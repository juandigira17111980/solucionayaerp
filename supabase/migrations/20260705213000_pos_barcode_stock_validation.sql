-- ============================================================================
-- Fase 3: POS con codigo de barras y validacion de stock por bodega.
-- Mantiene la operacion POS atomica desde PostgreSQL para Lovable + VPS.
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_products_company_barcode
  ON public.products(company_id, barcode)
  WHERE barcode IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_products_company_sku
  ON public.products(company_id, sku);

CREATE OR REPLACE FUNCTION public.validate_pos_stock(
  _company_id uuid,
  _warehouse_id uuid,
  _items jsonb
)
RETURNS TABLE(
  product_id uuid,
  sku text,
  name text,
  tracks_inventory boolean,
  requested_qty numeric,
  available_qty numeric,
  shortage_qty numeric,
  ok boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_any_permission(_company_id, ARRAY['pos.operate', 'sales.operate']);

  IF NOT public.can_access_warehouse(auth.uid(), _company_id, _warehouse_id, true) THEN
    RAISE EXCEPTION 'Sin permisos operativos sobre la bodega del POS';
  END IF;

  IF _items IS NULL OR jsonb_typeof(_items) <> 'array' OR jsonb_array_length(_items) = 0 THEN
    RAISE EXCEPTION 'El carrito esta vacio';
  END IF;

  RETURN QUERY
  WITH item_rows AS (
    SELECT
      (x.value->>'product_id')::uuid AS product_id,
      SUM(COALESCE((x.value->>'quantity')::numeric, 0))::numeric AS requested_qty
    FROM jsonb_array_elements(_items) AS x(value)
    GROUP BY (x.value->>'product_id')::uuid
  )
  SELECT
    p.id,
    p.sku,
    p.name,
    p.tracks_inventory,
    i.requested_qty,
    CASE WHEN p.tracks_inventory THEN COALESCE(s.quantity, 0)::numeric ELSE NULL::numeric END,
    CASE
      WHEN p.tracks_inventory THEN GREATEST(i.requested_qty - COALESCE(s.quantity, 0), 0)::numeric
      ELSE 0::numeric
    END,
    CASE
      WHEN p.tracks_inventory THEN COALESCE(s.quantity, 0) >= i.requested_qty
      ELSE true
    END
  FROM item_rows i
  JOIN public.products p ON p.id = i.product_id AND p.company_id = _company_id
  LEFT JOIN public.stock s ON s.product_id = p.id AND s.warehouse_id = _warehouse_id
  WHERE p.is_sellable = true;
END;
$$;

CREATE OR REPLACE FUNCTION public.process_pos_sale(
  _session_id uuid,
  _customer_id uuid,
  _payment_method public.payment_method,
  _items jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ps public.pos_sessions%ROWTYPE;
  doc_num text;
  so_id uuid;
  item RECORD;
  stock_row RECORD;
  subtotal numeric(18,2) := 0;
BEGIN
  SELECT * INTO ps FROM public.pos_sessions WHERE id = _session_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Turno POS no encontrado'; END IF;

  PERFORM public.assert_has_permission(ps.company_id, 'pos.operate');

  IF NOT public.can_access_warehouse(auth.uid(), ps.company_id, ps.warehouse_id, true) THEN
    RAISE EXCEPTION 'Sin permisos operativos sobre la bodega del POS';
  END IF;

  IF ps.status <> 'abierta' THEN
    RAISE EXCEPTION 'El turno POS no esta abierto';
  END IF;

  IF _items IS NULL OR jsonb_typeof(_items) <> 'array' OR jsonb_array_length(_items) = 0 THEN
    RAISE EXCEPTION 'El carrito esta vacio';
  END IF;

  IF _payment_method = 'credito' AND _customer_id IS NULL THEN
    RAISE EXCEPTION 'Credito requiere cliente';
  END IF;

  FOR item IN
    SELECT *
    FROM public.validate_pos_stock(ps.company_id, ps.warehouse_id, _items)
  LOOP
    IF item.ok IS NOT TRUE THEN
      RAISE EXCEPTION 'Stock insuficiente para % (disp: %, req: %)',
        item.sku, item.available_qty, item.requested_qty;
    END IF;
  END LOOP;

  -- Detecta items inexistentes, no vendibles o de otra empresa.
  FOR item IN
    SELECT
      (x.value->>'product_id')::uuid AS product_id,
      COALESCE((x.value->>'quantity')::numeric, 0) AS quantity,
      COALESCE((x.value->>'unit_price')::numeric, 0) AS unit_price
    FROM jsonb_array_elements(_items) AS x(value)
  LOOP
    IF item.product_id IS NULL OR item.quantity <= 0 OR item.unit_price < 0 THEN
      RAISE EXCEPTION 'Linea POS invalida';
    END IF;

    SELECT p.id, p.sku, p.is_sellable
      INTO stock_row
    FROM public.products p
    WHERE p.id = item.product_id AND p.company_id = ps.company_id;

    IF NOT FOUND OR stock_row.is_sellable IS NOT TRUE THEN
      RAISE EXCEPTION 'Producto no habilitado para POS';
    END IF;

    subtotal := subtotal + (item.quantity * item.unit_price);
  END LOOP;

  doc_num := public.next_sales_number(ps.company_id, 'sale');
  INSERT INTO public.sales_orders (
    company_id, doc_number, customer_id, warehouse_id, pos_session_id,
    channel, order_date, subtotal, tax_amount, discount_amount, total,
    payment_method, status, created_by
  ) VALUES (
    ps.company_id, doc_num, _customer_id, ps.warehouse_id, ps.id,
    'pos', CURRENT_DATE, subtotal, 0, 0, subtotal,
    _payment_method, 'borrador', auth.uid()
  ) RETURNING id INTO so_id;

  INSERT INTO public.sales_order_lines (
    sales_order_id, product_id, quantity, unit_price,
    tax_percent, discount_percent, subtotal
  )
  SELECT
    so_id,
    (x.value->>'product_id')::uuid,
    COALESCE((x.value->>'quantity')::numeric, 0),
    COALESCE((x.value->>'unit_price')::numeric, 0),
    0,
    0,
    COALESCE((x.value->>'quantity')::numeric, 0) * COALESCE((x.value->>'unit_price')::numeric, 0)
  FROM jsonb_array_elements(_items) AS x(value);

  PERFORM public.confirm_sales_order(so_id);

  RETURN so_id;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_pos_stock(uuid, uuid, jsonb) FROM public;
REVOKE ALL ON FUNCTION public.process_pos_sale(uuid, uuid, public.payment_method, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.validate_pos_stock(uuid, uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.process_pos_sale(uuid, uuid, public.payment_method, jsonb) TO authenticated;
