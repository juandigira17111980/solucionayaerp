-- ============================================================================
-- Fase 4: caja POS profesional, pagos mixtos, arqueo y reportes por turno.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.pos_sale_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  pos_session_id uuid NOT NULL REFERENCES public.pos_sessions(id) ON DELETE CASCADE,
  sales_order_id uuid NOT NULL REFERENCES public.sales_orders(id) ON DELETE CASCADE,
  payment_method public.payment_method NOT NULL,
  amount numeric(18,2) NOT NULL CHECK (amount > 0),
  reference text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.pos_session_closure_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  pos_session_id uuid NOT NULL REFERENCES public.pos_sessions(id) ON DELETE CASCADE,
  payment_method public.payment_method NOT NULL,
  expected_amount numeric(18,2) NOT NULL DEFAULT 0,
  counted_amount numeric(18,2) NOT NULL DEFAULT 0,
  difference numeric(18,2) NOT NULL DEFAULT 0,
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pos_session_id, payment_method)
);

ALTER TABLE public.pos_sessions
  ADD COLUMN IF NOT EXISTS closing_notes text;

ALTER TABLE public.sales_orders
  ADD COLUMN IF NOT EXISTS receipt_payload jsonb;

CREATE INDEX IF NOT EXISTS idx_pos_sale_payments_session
  ON public.pos_sale_payments(pos_session_id, payment_method);
CREATE INDEX IF NOT EXISTS idx_pos_sale_payments_order
  ON public.pos_sale_payments(sales_order_id);
CREATE INDEX IF NOT EXISTS idx_pos_closure_lines_session
  ON public.pos_session_closure_lines(pos_session_id);

ALTER TABLE public.pos_sale_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_session_closure_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pos_sale_payments_granular" ON public.pos_sale_payments;
CREATE POLICY "pos_sale_payments_granular" ON public.pos_sale_payments
  FOR ALL TO authenticated
  USING (public.has_permission(auth.uid(), company_id, 'pos.operate'))
  WITH CHECK (public.has_permission(auth.uid(), company_id, 'pos.operate'));

DROP POLICY IF EXISTS "pos_session_closure_lines_granular" ON public.pos_session_closure_lines;
CREATE POLICY "pos_session_closure_lines_granular" ON public.pos_session_closure_lines
  FOR ALL TO authenticated
  USING (public.has_permission(auth.uid(), company_id, 'pos.operate'))
  WITH CHECK (public.has_permission(auth.uid(), company_id, 'pos.operate'));

CREATE OR REPLACE FUNCTION public.process_pos_sale(
  _session_id uuid,
  _customer_id uuid,
  _payments jsonb,
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
  pay RECORD;
  product_row RECORD;
  subtotal numeric(18,2) := 0;
  paid_non_credit numeric(18,2) := 0;
  credit_amount numeric(18,2) := 0;
  cash_amount numeric(18,2) := 0;
  payment_total numeric(18,2) := 0;
  payment_count int := 0;
  order_method public.payment_method := 'efectivo';
  ar_doc text;
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

  IF _payments IS NULL OR jsonb_typeof(_payments) <> 'array' OR jsonb_array_length(_payments) = 0 THEN
    RAISE EXCEPTION 'Registra al menos un medio de pago';
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

    SELECT p.id, p.sku, p.is_sellable INTO product_row
    FROM public.products p
    WHERE p.id = item.product_id AND p.company_id = ps.company_id;

    IF NOT FOUND OR product_row.is_sellable IS NOT TRUE THEN
      RAISE EXCEPTION 'Producto no habilitado para POS';
    END IF;

    subtotal := subtotal + (item.quantity * item.unit_price);
  END LOOP;

  FOR pay IN
    SELECT
      (x.value->>'payment_method')::public.payment_method AS payment_method,
      COALESCE((x.value->>'amount')::numeric, 0) AS amount,
      NULLIF(x.value->>'reference', '') AS reference
    FROM jsonb_array_elements(_payments) AS x(value)
  LOOP
    IF pay.amount <= 0 THEN
      RAISE EXCEPTION 'Monto de pago invalido';
    END IF;

    payment_total := payment_total + pay.amount;
    payment_count := payment_count + 1;

    IF payment_count = 1 THEN order_method := pay.payment_method; END IF;
    IF pay.payment_method = 'efectivo' THEN cash_amount := cash_amount + pay.amount; END IF;
    IF pay.payment_method = 'credito' THEN
      credit_amount := credit_amount + pay.amount;
    ELSE
      paid_non_credit := paid_non_credit + pay.amount;
    END IF;
  END LOOP;

  IF payment_count > 1 THEN order_method := 'mixto'; END IF;
  IF credit_amount > 0 AND _customer_id IS NULL THEN
    RAISE EXCEPTION 'Pagos con credito requieren cliente';
  END IF;
  IF ABS(payment_total - subtotal) > 0.01 THEN
    RAISE EXCEPTION 'Los pagos (%) no coinciden con el total de la venta (%)', payment_total, subtotal;
  END IF;

  doc_num := public.next_sales_number(ps.company_id, 'sale');
  INSERT INTO public.sales_orders (
    company_id, doc_number, customer_id, warehouse_id, pos_session_id,
    channel, order_date, subtotal, tax_amount, discount_amount, total,
    payment_method, status, created_by
  ) VALUES (
    ps.company_id, doc_num, _customer_id, ps.warehouse_id, ps.id,
    'pos', CURRENT_DATE, subtotal, 0, 0, subtotal,
    order_method, 'borrador', auth.uid()
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

  INSERT INTO public.pos_sale_payments (
    company_id, pos_session_id, sales_order_id, payment_method, amount, reference, created_by
  )
  SELECT
    ps.company_id,
    ps.id,
    so_id,
    (x.value->>'payment_method')::public.payment_method,
    COALESCE((x.value->>'amount')::numeric, 0),
    NULLIF(x.value->>'reference', ''),
    auth.uid()
  FROM jsonb_array_elements(_payments) AS x(value);

  IF order_method = 'mixto' AND cash_amount > 0 THEN
    UPDATE public.pos_sessions
      SET expected_amount = expected_amount + cash_amount
      WHERE id = ps.id;
  END IF;

  IF credit_amount > 0 AND order_method <> 'credito' THEN
    ar_doc := public.next_sales_number(ps.company_id, 'ar');
    INSERT INTO public.accounts_receivable (
      company_id, doc_number, customer_id, sales_order_id,
      invoice_date, due_date, currency,
      total_amount, paid_amount, balance, status, created_by
    ) VALUES (
      ps.company_id, ar_doc, _customer_id, so_id,
      CURRENT_DATE, NULL, 'COP',
      credit_amount, 0, credit_amount, 'pendiente', auth.uid()
    );
  END IF;

  UPDATE public.sales_orders
    SET paid_amount = paid_non_credit,
        balance = credit_amount,
        receipt_payload = jsonb_build_object(
          'payments', _payments,
          'items', _items,
          'cashier_id', auth.uid(),
          'pos_session_id', ps.id
        )
    WHERE id = so_id;

  RETURN so_id;
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
BEGIN
  RETURN public.process_pos_sale(
    _session_id,
    _customer_id,
    jsonb_build_array(jsonb_build_object('payment_method', _payment_method, 'amount', (
      SELECT COALESCE(SUM((x.value->>'quantity')::numeric * (x.value->>'unit_price')::numeric), 0)
      FROM jsonb_array_elements(_items) AS x(value)
    ))),
    _items
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.close_pos_session(
  _session_id uuid,
  _counts jsonb,
  _notes text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p public.pos_sessions%ROWTYPE;
  method public.payment_method;
  expected numeric(18,2);
  counted numeric(18,2);
  total_expected numeric(18,2) := 0;
  total_counted numeric(18,2) := 0;
BEGIN
  SELECT * INTO p FROM public.pos_sessions WHERE id = _session_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Turno no encontrado'; END IF;

  PERFORM public.assert_has_permission(p.company_id, 'pos.operate');

  IF NOT public.can_access_warehouse(auth.uid(), p.company_id, p.warehouse_id, true) THEN
    RAISE EXCEPTION 'Sin permisos operativos sobre la bodega del turno';
  END IF;

  IF p.status <> 'abierta' THEN RAISE EXCEPTION 'El turno ya esta cerrado'; END IF;

  FOR method IN SELECT unnest(ARRAY['efectivo','tarjeta','transferencia','credito','mixto','otro']::public.payment_method[]) LOOP
    SELECT COALESCE(SUM(amount), 0) INTO expected
    FROM public.pos_sale_payments
    WHERE pos_session_id = _session_id AND payment_method = method;

    IF method = 'efectivo' THEN
      expected := expected + p.opening_amount;
    END IF;

    SELECT COALESCE((
      SELECT (value->>'counted_amount')::numeric
      FROM jsonb_array_elements(COALESCE(_counts, '[]'::jsonb)) AS c(value)
      WHERE (value->>'payment_method')::public.payment_method = method
      LIMIT 1
    ), 0) INTO counted;

    IF expected <> 0 OR counted <> 0 THEN
      INSERT INTO public.pos_session_closure_lines (
        company_id, pos_session_id, payment_method,
        expected_amount, counted_amount, difference, notes, created_by
      ) VALUES (
        p.company_id, p.id, method,
        expected, counted, counted - expected, _notes, auth.uid()
      )
      ON CONFLICT (pos_session_id, payment_method)
      DO UPDATE SET expected_amount = EXCLUDED.expected_amount,
                    counted_amount = EXCLUDED.counted_amount,
                    difference = EXCLUDED.difference,
                    notes = EXCLUDED.notes;

      total_expected := total_expected + expected;
      total_counted := total_counted + counted;
    END IF;
  END LOOP;

  UPDATE public.pos_sessions SET
    status = 'cerrada',
    closed_at = now(),
    counted_amount = total_counted,
    difference = total_counted - total_expected,
    closing_notes = _notes
  WHERE id = _session_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.close_pos_session(_session_id uuid, _counted numeric)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.close_pos_session(
    _session_id,
    jsonb_build_array(jsonb_build_object('payment_method', 'efectivo', 'counted_amount', _counted)),
    NULL
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.report_pos_session_summary(_session_id uuid)
RETURNS TABLE(payment_method public.payment_method, expected_amount numeric, counted_amount numeric, difference numeric, sales_amount numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p public.pos_sessions%ROWTYPE;
BEGIN
  SELECT * INTO p FROM public.pos_sessions WHERE id = _session_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Turno no encontrado'; END IF;

  PERFORM public.assert_has_permission(p.company_id, 'pos.operate');

  RETURN QUERY
  SELECT m.payment_method,
    (COALESCE(SUM(pay.amount), 0) + CASE WHEN m.payment_method = 'efectivo' THEN p.opening_amount ELSE 0 END)::numeric,
    COALESCE(cl.counted_amount, 0)::numeric,
    COALESCE(cl.difference, 0)::numeric,
    COALESCE(SUM(pay.amount), 0)::numeric
  FROM unnest(ARRAY['efectivo','tarjeta','transferencia','credito','mixto','otro']::public.payment_method[]) AS m(payment_method)
  LEFT JOIN public.pos_sale_payments pay ON pay.pos_session_id = p.id AND pay.payment_method = m.payment_method
  LEFT JOIN public.pos_session_closure_lines cl ON cl.pos_session_id = p.id AND cl.payment_method = m.payment_method
  GROUP BY m.payment_method, cl.counted_amount, cl.difference, p.opening_amount
  HAVING (COALESCE(SUM(pay.amount), 0) + CASE WHEN m.payment_method = 'efectivo' THEN p.opening_amount ELSE 0 END) <> 0
      OR COALESCE(cl.counted_amount, 0) <> 0
  ORDER BY m.payment_method;
END;
$$;

CREATE OR REPLACE FUNCTION public.report_pos_sessions_history(_company_id uuid)
RETURNS TABLE(
  id uuid,
  doc_number text,
  cashier_id uuid,
  warehouse_id uuid,
  warehouse_name text,
  status public.pos_session_status,
  opened_at timestamptz,
  closed_at timestamptz,
  opening_amount numeric,
  counted_amount numeric,
  difference numeric,
  closing_notes text,
  sales_amount numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_has_permission(_company_id, 'pos.operate');

  RETURN QUERY
  SELECT
    ps.id,
    ps.doc_number,
    ps.cashier_id,
    ps.warehouse_id,
    w.name::text AS warehouse_name,
    ps.status,
    ps.opened_at,
    ps.closed_at,
    ps.opening_amount,
    ps.counted_amount,
    ps.difference,
    ps.closing_notes,
    COALESCE(SUM(pay.amount), 0)::numeric AS sales_amount
  FROM public.pos_sessions ps
  LEFT JOIN public.warehouses w ON w.id = ps.warehouse_id
  LEFT JOIN public.pos_sale_payments pay ON pay.pos_session_id = ps.id
  WHERE ps.company_id = _company_id
    AND public.can_access_warehouse(auth.uid(), ps.company_id, ps.warehouse_id, false)
  GROUP BY ps.id, w.name
  ORDER BY ps.opened_at DESC
  LIMIT 100;
END;
$$;

REVOKE ALL ON FUNCTION public.process_pos_sale(uuid, uuid, jsonb, jsonb) FROM public;
REVOKE ALL ON FUNCTION public.process_pos_sale(uuid, uuid, public.payment_method, jsonb) FROM public;
REVOKE ALL ON FUNCTION public.close_pos_session(uuid, jsonb, text) FROM public;
REVOKE ALL ON FUNCTION public.close_pos_session(uuid, numeric) FROM public;
REVOKE ALL ON FUNCTION public.report_pos_session_summary(uuid) FROM public;
REVOKE ALL ON FUNCTION public.report_pos_sessions_history(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.process_pos_sale(uuid, uuid, jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.process_pos_sale(uuid, uuid, public.payment_method, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.close_pos_session(uuid, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.close_pos_session(uuid, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.report_pos_session_summary(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.report_pos_sessions_history(uuid) TO authenticated;
