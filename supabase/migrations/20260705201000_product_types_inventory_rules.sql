-- ============================================================================
-- Fase 2: modelo de productos para productos, servicios y consumo.
-- Compatible con Lovable + VPS: toda regla critica queda en PostgreSQL.
-- ============================================================================

DO $$
BEGIN
  CREATE TYPE public.product_type AS ENUM ('physical', 'service', 'consumable');
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS product_type public.product_type NOT NULL DEFAULT 'physical',
  ADD COLUMN IF NOT EXISTS tracks_inventory boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_sellable boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_purchasable boolean NOT NULL DEFAULT true;

UPDATE public.products
SET tracks_inventory = false
WHERE product_type = 'service';

UPDATE public.products
SET tracks_inventory = true
WHERE product_type IN ('physical', 'consumable');

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'products_type_rules_chk'
      AND conrelid = 'public.products'::regclass
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_type_rules_chk CHECK (
        (product_type = 'service' AND tracks_inventory = false)
        OR (product_type IN ('physical', 'consumable') AND tracks_inventory = true)
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_products_company_type
  ON public.products(company_id, product_type, is_active);

CREATE INDEX IF NOT EXISTS idx_products_company_flags
  ON public.products(company_id, is_sellable, is_purchasable, tracks_inventory, is_active);

-- ============================================================================
-- Inventario: no permite mover servicios ni productos que no controlan stock.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.confirm_inventory_movement(_movement_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  m public.inventory_movements%ROWTYPE;
  ln RECORD;
  cur_qty numeric(18,4);
  cur_cost numeric(18,4);
  new_qty numeric(18,4);
  new_cost numeric(18,4);
  use_cost numeric(18,4);
  allowed boolean := false;
BEGIN
  SELECT * INTO m FROM public.inventory_movements WHERE id = _movement_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Movimiento no encontrado'; END IF;

  allowed :=
    public.has_permission(auth.uid(), m.company_id, 'inventory.operate')
    OR (
      m.reference LIKE 'VT %'
      AND (
        public.has_permission(auth.uid(), m.company_id, 'sales.operate')
        OR public.has_permission(auth.uid(), m.company_id, 'pos.operate')
      )
    )
    OR (
      m.reference LIKE 'REC %'
      AND public.has_permission(auth.uid(), m.company_id, 'purchases.operate')
    );

  IF NOT allowed THEN
    RAISE EXCEPTION 'Sin permisos para confirmar movimiento de inventario';
  END IF;

  IF m.warehouse_from_id IS NOT NULL AND NOT public.can_access_warehouse(auth.uid(), m.company_id, m.warehouse_from_id, true) THEN
    RAISE EXCEPTION 'Sin permisos operativos sobre bodega origen';
  END IF;

  IF m.warehouse_to_id IS NOT NULL AND NOT public.can_access_warehouse(auth.uid(), m.company_id, m.warehouse_to_id, true) THEN
    RAISE EXCEPTION 'Sin permisos operativos sobre bodega destino';
  END IF;

  IF m.status <> 'borrador' THEN RAISE EXCEPTION 'Solo se confirman movimientos en borrador'; END IF;

  IF m.movement_type IN ('entrada','ajuste_positivo') AND m.warehouse_to_id IS NULL THEN
    RAISE EXCEPTION 'Se requiere bodega destino';
  END IF;
  IF m.movement_type IN ('salida','ajuste_negativo') AND m.warehouse_from_id IS NULL THEN
    RAISE EXCEPTION 'Se requiere bodega origen';
  END IF;
  IF m.movement_type = 'traslado' AND (m.warehouse_from_id IS NULL OR m.warehouse_to_id IS NULL) THEN
    RAISE EXCEPTION 'Traslado requiere bodega origen y destino';
  END IF;
  IF m.movement_type = 'traslado' AND m.warehouse_from_id = m.warehouse_to_id THEN
    RAISE EXCEPTION 'La bodega origen y destino deben ser distintas';
  END IF;

  FOR ln IN
    SELECT iml.*, p.tracks_inventory, p.sku
    FROM public.inventory_movement_lines iml
    JOIN public.products p ON p.id = iml.product_id
    WHERE iml.movement_id = _movement_id
  LOOP
    IF ln.tracks_inventory IS NOT TRUE THEN
      RAISE EXCEPTION 'El producto % no controla inventario y no puede moverse en stock', ln.sku;
    END IF;

    IF m.movement_type IN ('salida','ajuste_negativo','traslado') THEN
      SELECT quantity, avg_cost INTO cur_qty, cur_cost FROM public.stock
        WHERE warehouse_id = m.warehouse_from_id AND product_id = ln.product_id FOR UPDATE;
      IF NOT FOUND THEN cur_qty := 0; cur_cost := 0; END IF;
      IF cur_qty < ln.quantity THEN
        RAISE EXCEPTION 'Stock insuficiente para producto % en bodega origen (disp: %, req: %)',
          ln.product_id, cur_qty, ln.quantity;
      END IF;
      use_cost := cur_cost;
      new_qty := cur_qty - ln.quantity;
      new_cost := CASE WHEN new_qty = 0 THEN 0 ELSE cur_cost END;

      INSERT INTO public.stock (company_id, warehouse_id, product_id, quantity, avg_cost, updated_at)
        VALUES (m.company_id, m.warehouse_from_id, ln.product_id, new_qty, new_cost, now())
        ON CONFLICT (warehouse_id, product_id)
        DO UPDATE SET quantity = EXCLUDED.quantity, avg_cost = EXCLUDED.avg_cost, updated_at = now();

      INSERT INTO public.kardex (company_id, movement_id, movement_line_id, warehouse_id, product_id,
        lot_id, movement_date, direction, quantity, unit_cost, total_cost,
        balance_qty, balance_avg_cost, balance_value)
      VALUES (m.company_id, m.id, ln.id, m.warehouse_from_id, ln.product_id,
        ln.lot_id, m.movement_date, 'out', ln.quantity, use_cost, ln.quantity * use_cost,
        new_qty, new_cost, new_qty * new_cost);
    END IF;

    IF m.movement_type IN ('entrada','ajuste_positivo','traslado') THEN
      use_cost := CASE
        WHEN m.movement_type = 'traslado' THEN COALESCE(
          (SELECT unit_cost FROM public.kardex WHERE movement_line_id = ln.id AND direction='out' ORDER BY created_at DESC LIMIT 1),
          ln.unit_cost)
        ELSE ln.unit_cost
      END;

      SELECT quantity, avg_cost INTO cur_qty, cur_cost FROM public.stock
        WHERE warehouse_id = m.warehouse_to_id AND product_id = ln.product_id FOR UPDATE;
      IF NOT FOUND THEN cur_qty := 0; cur_cost := 0; END IF;
      new_qty := cur_qty + ln.quantity;
      new_cost := CASE WHEN new_qty = 0 THEN 0
        ELSE ((cur_qty * cur_cost) + (ln.quantity * use_cost)) / new_qty END;

      INSERT INTO public.stock (company_id, warehouse_id, product_id, quantity, avg_cost, updated_at)
        VALUES (m.company_id, m.warehouse_to_id, ln.product_id, new_qty, new_cost, now())
        ON CONFLICT (warehouse_id, product_id)
        DO UPDATE SET quantity = EXCLUDED.quantity, avg_cost = EXCLUDED.avg_cost, updated_at = now();

      INSERT INTO public.kardex (company_id, movement_id, movement_line_id, warehouse_id, product_id,
        lot_id, movement_date, direction, quantity, unit_cost, total_cost,
        balance_qty, balance_avg_cost, balance_value)
      VALUES (m.company_id, m.id, ln.id, m.warehouse_to_id, ln.product_id,
        ln.lot_id, m.movement_date, 'in', ln.quantity, use_cost, ln.quantity * use_cost,
        new_qty, new_cost, new_qty * new_cost);
    END IF;
  END LOOP;

  UPDATE public.inventory_movements
    SET status = 'confirmado', confirmed_at = now(), confirmed_by = auth.uid()
    WHERE id = _movement_id;
END;
$$;

-- ============================================================================
-- Ventas/POS: servicios venden y facturan, pero no generan salida de stock.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.confirm_sales_order(_sales_order_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s public.sales_orders%ROWTYPE;
  ln RECORD;
  mov_id uuid := NULL;
  mov_doc text;
  ar_id uuid := NULL;
  ar_doc text;
  stock_cost numeric(18,4);
BEGIN
  SELECT * INTO s FROM public.sales_orders WHERE id = _sales_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Venta no encontrada'; END IF;

  PERFORM public.assert_any_permission(s.company_id, ARRAY['sales.operate', 'pos.operate']);

  IF NOT public.can_access_warehouse(auth.uid(), s.company_id, s.warehouse_id, true) THEN
    RAISE EXCEPTION 'Sin permisos operativos sobre la bodega de venta';
  END IF;

  IF s.status <> 'borrador' THEN RAISE EXCEPTION 'Solo se confirman ventas en borrador'; END IF;

  FOR ln IN
    SELECT sl.*, p.tracks_inventory, p.cost_price, p.is_sellable, p.sku
    FROM public.sales_order_lines sl
    JOIN public.products p ON p.id = sl.product_id
    WHERE sl.sales_order_id = _sales_order_id
  LOOP
    IF ln.is_sellable IS NOT TRUE THEN
      RAISE EXCEPTION 'El producto % no esta habilitado para venta', ln.sku;
    END IF;

    IF ln.tracks_inventory IS TRUE THEN
      IF mov_id IS NULL THEN
        mov_doc := public.next_movement_number(s.company_id, 'salida');
        INSERT INTO public.inventory_movements (
          company_id, doc_number, movement_type, warehouse_from_id,
          third_party_id, movement_date, reference, notes, status, created_by
        ) VALUES (
          s.company_id, mov_doc, 'salida', s.warehouse_id,
          s.customer_id, s.order_date,
          'VT ' || s.doc_number, 'Venta ' || s.doc_number,
          'borrador', auth.uid()
        ) RETURNING id INTO mov_id;
      END IF;

      SELECT avg_cost INTO stock_cost FROM public.stock
        WHERE warehouse_id = s.warehouse_id AND product_id = ln.product_id;
      stock_cost := COALESCE(stock_cost, 0);

      INSERT INTO public.inventory_movement_lines (movement_id, product_id, quantity, unit_cost)
        VALUES (mov_id, ln.product_id, ln.quantity, stock_cost);

      UPDATE public.sales_order_lines SET unit_cost = stock_cost WHERE id = ln.id;
    ELSE
      UPDATE public.sales_order_lines
        SET unit_cost = COALESCE(ln.unit_cost, ln.cost_price, 0)
        WHERE id = ln.id;
    END IF;
  END LOOP;

  IF mov_id IS NOT NULL THEN
    PERFORM public.confirm_inventory_movement(mov_id);
  END IF;

  IF s.payment_method = 'credito' AND s.customer_id IS NOT NULL THEN
    ar_doc := public.next_sales_number(s.company_id, 'ar');
    INSERT INTO public.accounts_receivable (
      company_id, doc_number, customer_id, sales_order_id,
      invoice_date, due_date, currency,
      total_amount, paid_amount, balance, status, created_by
    ) VALUES (
      s.company_id, ar_doc, s.customer_id, s.id,
      s.order_date, s.due_date, s.currency,
      s.total, 0, s.total, 'pendiente', auth.uid()
    ) RETURNING id INTO ar_id;
  END IF;

  UPDATE public.sales_orders SET
    status = 'confirmada',
    inventory_movement_id = mov_id,
    paid_amount = CASE WHEN payment_method = 'credito' THEN 0 ELSE total END,
    balance = CASE WHEN payment_method = 'credito' THEN total ELSE 0 END,
    confirmed_at = now(),
    confirmed_by = auth.uid()
  WHERE id = _sales_order_id;

  IF s.pos_session_id IS NOT NULL THEN
    UPDATE public.pos_sessions
      SET total_sales = total_sales + s.total,
          expected_amount = expected_amount + CASE WHEN s.payment_method = 'efectivo' THEN s.total ELSE 0 END
      WHERE id = s.pos_session_id;
  END IF;

  RETURN COALESCE(ar_id, mov_id, s.id);
END;
$$;

-- ============================================================================
-- Compras: recepciones de servicios generan CxP, no entrada de inventario.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.confirm_purchase_receipt(_receipt_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.purchase_receipts%ROWTYPE;
  ln RECORD;
  mov_id uuid := NULL;
  mov_doc text;
  ap_id uuid;
  ap_doc text;
  totals numeric(18,2) := 0;
BEGIN
  SELECT * INTO r FROM public.purchase_receipts WHERE id = _receipt_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Recepcion no encontrada'; END IF;

  PERFORM public.assert_has_permission(r.company_id, 'purchases.operate');

  IF NOT public.can_access_warehouse(auth.uid(), r.company_id, r.warehouse_id, true) THEN
    RAISE EXCEPTION 'Sin permisos operativos sobre la bodega de recepcion';
  END IF;

  IF r.status <> 'borrador' THEN RAISE EXCEPTION 'Solo se confirman recepciones en borrador'; END IF;

  FOR ln IN
    SELECT prl.*, p.tracks_inventory, p.is_purchasable, p.sku
    FROM public.purchase_receipt_lines prl
    JOIN public.products p ON p.id = prl.product_id
    WHERE prl.receipt_id = _receipt_id
  LOOP
    IF ln.is_purchasable IS NOT TRUE THEN
      RAISE EXCEPTION 'El producto % no esta habilitado para compra', ln.sku;
    END IF;

    IF ln.tracks_inventory IS TRUE THEN
      IF mov_id IS NULL THEN
        mov_doc := public.next_movement_number(r.company_id, 'entrada');
        INSERT INTO public.inventory_movements (
          company_id, doc_number, movement_type, warehouse_to_id,
          third_party_id, movement_date, reference, notes, status, created_by
        ) VALUES (
          r.company_id, mov_doc, 'entrada', r.warehouse_id,
          r.supplier_id, r.receipt_date,
          'REC ' || r.doc_number, 'Recepcion de compra ' || r.doc_number,
          'borrador', auth.uid()
        ) RETURNING id INTO mov_id;
      END IF;

      INSERT INTO public.inventory_movement_lines (movement_id, product_id, quantity, unit_cost)
        VALUES (mov_id, ln.product_id, ln.quantity, ln.unit_cost);
    END IF;

    IF ln.purchase_order_line_id IS NOT NULL THEN
      UPDATE public.purchase_order_lines
        SET received_quantity = received_quantity + ln.quantity
        WHERE id = ln.purchase_order_line_id;
    END IF;

    totals := totals + (ln.quantity * ln.unit_cost);
  END LOOP;

  IF mov_id IS NOT NULL THEN
    PERFORM public.confirm_inventory_movement(mov_id);
  END IF;

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
    total_amount, paid_amount, balance, status, created_by
  ) VALUES (
    r.company_id, ap_doc, r.supplier_id, r.id,
    r.supplier_invoice, COALESCE(r.invoice_date, r.receipt_date), r.due_date, 'COP',
    totals, 0, totals, 'pendiente', auth.uid()
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

CREATE OR REPLACE FUNCTION public.report_low_stock(_company_id uuid, _limit int DEFAULT 50)
RETURNS TABLE(product_id uuid, sku text, name text, min_stock numeric, current_qty numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.assert_has_permission(_company_id, 'reports.view');
  RETURN QUERY
  SELECT p.id, p.sku, p.name, COALESCE(p.min_stock,0)::numeric,
    COALESCE((SELECT SUM(quantity) FROM public.stock WHERE product_id=p.id),0)::numeric
  FROM public.products p
  WHERE p.company_id = _company_id
    AND p.tracks_inventory = true
    AND COALESCE(p.min_stock,0) > 0
    AND COALESCE((SELECT SUM(quantity) FROM public.stock WHERE product_id=p.id),0) < COALESCE(p.min_stock,0)
  ORDER BY (COALESCE(p.min_stock,0) - COALESCE((SELECT SUM(quantity) FROM public.stock WHERE product_id=p.id),0)) DESC
  LIMIT _limit;
END; $$;

CREATE OR REPLACE FUNCTION public.report_reorder_suggestions(p_company_id uuid, p_days int DEFAULT 30)
RETURNS TABLE(product_id uuid, sku text, name text, total_stock numeric, min_stock numeric, avg_daily_sales numeric, days_of_stock numeric, suggested_qty numeric, reason text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.assert_has_permission(p_company_id, 'reports.view');
  RETURN QUERY
  WITH stk AS (
    SELECT s.product_id, COALESCE(SUM(s.quantity),0)::numeric AS total_stock
    FROM public.stock s
    WHERE s.company_id = p_company_id
    GROUP BY s.product_id
  ),
  sales AS (
    SELECT sl.product_id, COALESCE(SUM(sl.quantity),0)::numeric / GREATEST(p_days,1)::numeric AS avg_daily
    FROM public.sales_order_lines sl
    JOIN public.sales_orders so ON so.id = sl.sales_order_id
    JOIN public.products p ON p.id = sl.product_id
    WHERE so.company_id = p_company_id
      AND so.status = 'confirmada'
      AND so.order_date >= (CURRENT_DATE - p_days)
      AND p.tracks_inventory = true
    GROUP BY sl.product_id
  )
  SELECT p.id, p.sku, p.name, COALESCE(st.total_stock,0), COALESCE(p.min_stock,0)::numeric,
    COALESCE(sa.avg_daily,0),
    CASE WHEN COALESCE(sa.avg_daily,0) > 0 THEN ROUND(COALESCE(st.total_stock,0) / sa.avg_daily, 1) ELSE NULL END,
    CASE WHEN COALESCE(sa.avg_daily,0) > 0 THEN GREATEST((sa.avg_daily * p_days) - COALESCE(st.total_stock,0), 0)
      ELSE GREATEST(COALESCE(p.min_stock,0) - COALESCE(st.total_stock,0), 0) END,
    CASE
      WHEN COALESCE(st.total_stock,0) <= 0 THEN 'Sin existencia'
      WHEN COALESCE(st.total_stock,0) < COALESCE(p.min_stock,0) THEN 'Bajo stock minimo'
      WHEN COALESCE(sa.avg_daily,0) > 0 AND COALESCE(st.total_stock,0) / sa.avg_daily < 7 THEN 'Menos de 7 dias'
      ELSE 'OK'
    END
  FROM public.products p
  LEFT JOIN stk st ON st.product_id = p.id
  LEFT JOIN sales sa ON sa.product_id = p.id
  WHERE p.company_id = p_company_id
    AND p.is_active = true
    AND p.tracks_inventory = true
    AND (COALESCE(st.total_stock,0) < COALESCE(p.min_stock,0)
      OR (COALESCE(sa.avg_daily,0) > 0 AND COALESCE(st.total_stock,0) / sa.avg_daily < 14))
  ORDER BY (COALESCE(st.total_stock,0) - COALESCE(p.min_stock,0)) ASC;
END; $$;

REVOKE ALL ON FUNCTION public.confirm_inventory_movement(uuid) FROM public;
REVOKE ALL ON FUNCTION public.confirm_sales_order(uuid) FROM public;
REVOKE ALL ON FUNCTION public.confirm_purchase_receipt(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.confirm_inventory_movement(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_sales_order(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_purchase_receipt(uuid) TO authenticated;
