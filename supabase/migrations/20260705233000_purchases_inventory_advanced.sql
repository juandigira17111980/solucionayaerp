-- ============================================================================
-- Fase 5: compras e inventario avanzado.
-- Recepciones con lotes, devoluciones, traslados/ajustes controlados y trazabilidad.
-- ============================================================================

ALTER TABLE public.purchase_receipt_lines
  ADD COLUMN IF NOT EXISTS lot_code text,
  ADD COLUMN IF NOT EXISTS expires_at date,
  ADD COLUMN IF NOT EXISTS lot_id uuid REFERENCES public.product_lots(id) ON DELETE SET NULL;

ALTER TABLE public.inventory_movements
  ADD COLUMN IF NOT EXISTS source_module text,
  ADD COLUMN IF NOT EXISTS source_id uuid,
  ADD COLUMN IF NOT EXISTS reason text;

CREATE INDEX IF NOT EXISTS idx_prl_lot ON public.purchase_receipt_lines(lot_id);
CREATE INDEX IF NOT EXISTS idx_lots_company_product_expiry ON public.product_lots(company_id, product_id, expires_at);
CREATE INDEX IF NOT EXISTS idx_kardex_lot_trace ON public.kardex(company_id, product_id, warehouse_id, lot_id, movement_date DESC);
CREATE INDEX IF NOT EXISTS idx_mov_source ON public.inventory_movements(company_id, source_module, source_id);

CREATE OR REPLACE FUNCTION public.ensure_product_lot(
  _company_id uuid,
  _product_id uuid,
  _lot_code text,
  _expires_at date DEFAULT NULL,
  _notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  lot_id uuid;
BEGIN
  IF NOT (
    public.has_permission(auth.uid(), _company_id, 'inventory.operate')
    OR public.has_permission(auth.uid(), _company_id, 'purchases.operate')
  ) THEN
    RAISE EXCEPTION 'Sin permisos para administrar lotes';
  END IF;

  IF NULLIF(TRIM(COALESCE(_lot_code, '')), '') IS NULL THEN
    RETURN NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.products p
    WHERE p.id = _product_id
      AND p.company_id = _company_id
      AND p.tracks_inventory = true
  ) THEN
    RAISE EXCEPTION 'Producto no valido para lote';
  END IF;

  INSERT INTO public.product_lots(company_id, product_id, lot_code, expires_at, notes)
  VALUES (_company_id, _product_id, TRIM(_lot_code), _expires_at, _notes)
  ON CONFLICT (product_id, lot_code)
  DO UPDATE SET expires_at = COALESCE(EXCLUDED.expires_at, public.product_lots.expires_at),
                notes = COALESCE(EXCLUDED.notes, public.product_lots.notes)
  RETURNING id INTO lot_id;

  RETURN lot_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_inventory_movement_advanced(
  _company_id uuid,
  _movement_type public.movement_type,
  _warehouse_from_id uuid,
  _warehouse_to_id uuid,
  _third_party_id uuid,
  _reference text,
  _notes text,
  _reason text,
  _movement_date date,
  _lines jsonb,
  _confirm boolean DEFAULT true
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  mov_id uuid;
  mov_doc text;
  item RECORD;
  lot_id uuid;
  product_row RECORD;
BEGIN
  PERFORM public.assert_has_permission(_company_id, 'inventory.operate');

  IF _lines IS NULL OR jsonb_typeof(_lines) <> 'array' OR jsonb_array_length(_lines) = 0 THEN
    RAISE EXCEPTION 'Agrega al menos una linea';
  END IF;

  IF _movement_type IN ('salida','ajuste_negativo','traslado')
     AND NOT public.can_access_warehouse(auth.uid(), _company_id, _warehouse_from_id, true) THEN
    RAISE EXCEPTION 'Sin permisos operativos sobre bodega origen';
  END IF;

  IF _movement_type IN ('entrada','ajuste_positivo','traslado')
     AND NOT public.can_access_warehouse(auth.uid(), _company_id, _warehouse_to_id, true) THEN
    RAISE EXCEPTION 'Sin permisos operativos sobre bodega destino';
  END IF;

  IF _movement_type = 'traslado' AND _warehouse_from_id = _warehouse_to_id THEN
    RAISE EXCEPTION 'Origen y destino deben ser distintos';
  END IF;

  mov_doc := public.next_movement_number(_company_id, _movement_type);
  INSERT INTO public.inventory_movements (
    company_id, doc_number, movement_type, warehouse_from_id, warehouse_to_id,
    third_party_id, movement_date, reference, notes, reason, source_module, status, created_by
  ) VALUES (
    _company_id, mov_doc, _movement_type, _warehouse_from_id, _warehouse_to_id,
    _third_party_id, COALESCE(_movement_date, CURRENT_DATE), _reference, _notes,
    _reason, 'inventory', 'borrador', auth.uid()
  ) RETURNING id INTO mov_id;

  FOR item IN
    SELECT
      (x.value->>'product_id')::uuid AS product_id,
      COALESCE((x.value->>'quantity')::numeric, 0) AS quantity,
      COALESCE((x.value->>'unit_cost')::numeric, 0) AS unit_cost,
      NULLIF(x.value->>'lot_code', '') AS lot_code,
      NULLIF(x.value->>'expires_at', '')::date AS expires_at,
      NULLIF(x.value->>'serial_number', '') AS serial_number,
      NULLIF(x.value->>'notes', '') AS notes
    FROM jsonb_array_elements(_lines) AS x(value)
  LOOP
    IF item.product_id IS NULL OR item.quantity <= 0 THEN
      RAISE EXCEPTION 'Linea de inventario invalida';
    END IF;

    SELECT id, tracks_inventory INTO product_row
    FROM public.products
    WHERE id = item.product_id AND company_id = _company_id;

    IF NOT FOUND OR product_row.tracks_inventory IS NOT TRUE THEN
      RAISE EXCEPTION 'Producto sin control de inventario';
    END IF;

    lot_id := public.ensure_product_lot(_company_id, item.product_id, item.lot_code, item.expires_at, item.notes);

    INSERT INTO public.inventory_movement_lines (
      movement_id, product_id, quantity, unit_cost, lot_id, serial_number, notes
    ) VALUES (
      mov_id, item.product_id, item.quantity, item.unit_cost, lot_id, item.serial_number, item.notes
    );
  END LOOP;

  IF _confirm THEN
    PERFORM public.confirm_inventory_movement(mov_id);
  END IF;

  RETURN mov_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.confirm_purchase_receipt(_receipt_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.purchase_receipts%ROWTYPE;
  ln RECORD;
  mov_id uuid;
  mov_doc text;
  ap_id uuid;
  ap_doc text;
  totals numeric(18,2) := 0;
  v_lot_id uuid;
BEGIN
  SELECT * INTO r FROM public.purchase_receipts WHERE id = _receipt_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Recepcion no encontrada'; END IF;

  PERFORM public.assert_has_permission(r.company_id, 'purchases.operate');

  IF NOT public.can_access_warehouse(auth.uid(), r.company_id, r.warehouse_id, true) THEN
    RAISE EXCEPTION 'Sin permisos operativos sobre la bodega de recepcion';
  END IF;

  IF r.status <> 'borrador' THEN
    RAISE EXCEPTION 'Solo se confirman recepciones en borrador';
  END IF;

  mov_doc := public.next_movement_number(r.company_id, 'entrada');
  INSERT INTO public.inventory_movements (
    company_id, doc_number, movement_type, warehouse_to_id,
    third_party_id, movement_date, reference, notes, reason,
    source_module, source_id, status, created_by
  ) VALUES (
    r.company_id, mov_doc, 'entrada', r.warehouse_id,
    r.supplier_id, r.receipt_date,
    'REC ' || r.doc_number, 'Recepcion de compra ' || r.doc_number,
    'recepcion_compra', 'purchases', r.id, 'borrador', auth.uid()
  ) RETURNING id INTO mov_id;

  FOR ln IN
    SELECT prl.*, p.tracks_inventory
    FROM public.purchase_receipt_lines prl
    JOIN public.products p ON p.id = prl.product_id
    WHERE prl.receipt_id = _receipt_id
  LOOP
    IF ln.tracks_inventory IS NOT TRUE THEN
      CONTINUE;
    END IF;

    v_lot_id := COALESCE(
      ln.lot_id,
      public.ensure_product_lot(r.company_id, ln.product_id, ln.lot_code, ln.expires_at, 'Recepcion ' || r.doc_number)
    );

    IF v_lot_id IS NOT NULL AND ln.lot_id IS NULL THEN
      UPDATE public.purchase_receipt_lines SET lot_id = v_lot_id WHERE id = ln.id;
    END IF;

    INSERT INTO public.inventory_movement_lines (movement_id, product_id, quantity, unit_cost, lot_id)
    VALUES (mov_id, ln.product_id, ln.quantity, ln.unit_cost, v_lot_id);

    IF ln.purchase_order_line_id IS NOT NULL THEN
      UPDATE public.purchase_order_lines
        SET received_quantity = received_quantity + ln.quantity
        WHERE id = ln.purchase_order_line_id;
    END IF;

    totals := totals + (ln.quantity * ln.unit_cost);
  END LOOP;

  PERFORM public.confirm_inventory_movement(mov_id);

  IF r.purchase_order_id IS NOT NULL THEN
    UPDATE public.purchase_orders po SET status = (
      CASE
        WHEN NOT EXISTS (
          SELECT 1 FROM public.purchase_order_lines
          WHERE purchase_order_id = po.id AND received_quantity < quantity
        ) THEN 'recibida'::purchase_order_status
        ELSE 'parcial'::purchase_order_status
      END
    )
    WHERE id = r.purchase_order_id;
  END IF;

  ap_doc := public.next_purchase_number(r.company_id, 'payable');
  INSERT INTO public.accounts_payable (
    company_id, doc_number, supplier_id, receipt_id,
    supplier_invoice, invoice_date, due_date, currency,
    total_amount, paid_amount, balance, status, notes, created_by
  ) VALUES (
    r.company_id, ap_doc, r.supplier_id, r.id,
    r.supplier_invoice, COALESCE(r.invoice_date, r.receipt_date), r.due_date, 'COP',
    totals, 0, totals, 'pendiente', 'Generada por recepcion ' || r.doc_number, auth.uid()
  ) RETURNING id INTO ap_id;

  UPDATE public.purchase_receipts
    SET status = 'confirmada',
        inventory_movement_id = mov_id,
        total = totals,
        confirmed_at = now(),
        confirmed_by = auth.uid()
    WHERE id = _receipt_id;

  RETURN ap_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_purchase_return(
  _receipt_id uuid,
  _lines jsonb,
  _notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.purchase_receipts%ROWTYPE;
  payload jsonb := '[]'::jsonb;
  item RECORD;
BEGIN
  SELECT * INTO r FROM public.purchase_receipts WHERE id = _receipt_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Recepcion no encontrada'; END IF;

  PERFORM public.assert_has_permission(r.company_id, 'purchases.operate');

  IF r.status <> 'confirmada' THEN
    RAISE EXCEPTION 'Solo se devuelven recepciones confirmadas';
  END IF;

  FOR item IN
    SELECT
      (x.value->>'product_id')::uuid AS product_id,
      COALESCE((x.value->>'quantity')::numeric, 0) AS quantity,
      COALESCE((x.value->>'unit_cost')::numeric, 0) AS unit_cost,
      NULLIF(x.value->>'lot_code', '') AS lot_code,
      NULLIF(x.value->>'expires_at', '') AS expires_at
    FROM jsonb_array_elements(COALESCE(_lines, '[]'::jsonb)) AS x(value)
  LOOP
    IF item.product_id IS NULL OR item.quantity <= 0 THEN
      RAISE EXCEPTION 'Linea de devolucion invalida';
    END IF;

    payload := payload || jsonb_build_array(jsonb_build_object(
      'product_id', item.product_id,
      'quantity', item.quantity,
      'unit_cost', item.unit_cost,
      'lot_code', item.lot_code,
      'expires_at', item.expires_at,
      'notes', 'Devolucion de compra ' || r.doc_number
    ));
  END LOOP;

  RETURN public.create_inventory_movement_advanced(
    r.company_id,
    'salida',
    r.warehouse_id,
    NULL,
    r.supplier_id,
    'DEV ' || r.doc_number,
    _notes,
    'devolucion_compra',
    CURRENT_DATE,
    payload,
    true
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.report_inventory_trace(
  _company_id uuid,
  _product_id uuid DEFAULT NULL,
  _warehouse_id uuid DEFAULT NULL,
  _lot_id uuid DEFAULT NULL
)
RETURNS TABLE(
  movement_date date,
  doc_number text,
  movement_type public.movement_type,
  warehouse_id uuid,
  warehouse_name text,
  product_id uuid,
  sku text,
  product_name text,
  lot_code text,
  direction public.kardex_direction,
  quantity numeric,
  unit_cost numeric,
  balance_qty numeric,
  balance_value numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_has_permission(_company_id, 'inventory.view');

  RETURN QUERY
  SELECT
    k.movement_date,
    m.doc_number,
    m.movement_type,
    k.warehouse_id,
    w.name::text,
    k.product_id,
    p.sku::text,
    p.name::text,
    l.lot_code::text,
    k.direction,
    k.quantity,
    k.unit_cost,
    k.balance_qty,
    k.balance_value
  FROM public.kardex k
  JOIN public.inventory_movements m ON m.id = k.movement_id
  JOIN public.products p ON p.id = k.product_id
  JOIN public.warehouses w ON w.id = k.warehouse_id
  LEFT JOIN public.product_lots l ON l.id = k.lot_id
  WHERE k.company_id = _company_id
    AND (_product_id IS NULL OR k.product_id = _product_id)
    AND (_warehouse_id IS NULL OR k.warehouse_id = _warehouse_id)
    AND (_lot_id IS NULL OR k.lot_id = _lot_id)
    AND public.can_access_warehouse(auth.uid(), k.company_id, k.warehouse_id, false)
  ORDER BY k.movement_date DESC, k.created_at DESC
  LIMIT 1000;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_product_lot(uuid, uuid, text, date, text) FROM public;
REVOKE ALL ON FUNCTION public.create_inventory_movement_advanced(uuid, public.movement_type, uuid, uuid, uuid, text, text, text, date, jsonb, boolean) FROM public;
REVOKE ALL ON FUNCTION public.create_purchase_return(uuid, jsonb, text) FROM public;
REVOKE ALL ON FUNCTION public.report_inventory_trace(uuid, uuid, uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.ensure_product_lot(uuid, uuid, text, date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_inventory_movement_advanced(uuid, public.movement_type, uuid, uuid, uuid, text, text, text, date, jsonb, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_purchase_return(uuid, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.report_inventory_trace(uuid, uuid, uuid, uuid) TO authenticated;
