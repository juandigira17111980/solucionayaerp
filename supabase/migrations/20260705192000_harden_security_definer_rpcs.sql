-- Fase 1.2: hardening de RPC SECURITY DEFINER para Lovable + VPS.
-- No modifica datos. Reemplaza funciones para validar permisos granulares.

CREATE OR REPLACE FUNCTION public.assert_has_permission(_company_id uuid, _permission_code text)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  IF NOT public.has_permission(auth.uid(), _company_id, _permission_code) THEN
    RAISE EXCEPTION 'Sin permisos: %', _permission_code;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.assert_any_permission(_company_id uuid, _permission_codes text[])
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  code text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  FOREACH code IN ARRAY _permission_codes LOOP
    IF public.has_permission(auth.uid(), _company_id, code) THEN
      RETURN;
    END IF;
  END LOOP;

  RAISE EXCEPTION 'Sin permisos suficientes';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.assert_has_permission(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.assert_any_permission(uuid, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assert_has_permission(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.assert_any_permission(uuid, text[]) TO authenticated, service_role;

-- ============================================================================
-- Inventario: confirmar movimiento exige inventory.operate, o flujo interno
-- controlado desde ventas/POS/compras con permiso del modulo correspondiente.
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

  FOR ln IN SELECT * FROM public.inventory_movement_lines WHERE movement_id = _movement_id LOOP
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
-- Ventas/POS
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
  mov_id uuid;
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

  FOR ln IN SELECT * FROM public.sales_order_lines WHERE sales_order_id = _sales_order_id LOOP
    SELECT avg_cost INTO stock_cost FROM public.stock
      WHERE warehouse_id = s.warehouse_id AND product_id = ln.product_id;
    stock_cost := COALESCE(stock_cost, 0);

    INSERT INTO public.inventory_movement_lines (movement_id, product_id, quantity, unit_cost)
      VALUES (mov_id, ln.product_id, ln.quantity, stock_cost);

    UPDATE public.sales_order_lines SET unit_cost = stock_cost WHERE id = ln.id;
  END LOOP;

  PERFORM public.confirm_inventory_movement(mov_id);

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

  RETURN COALESCE(ar_id, mov_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.close_pos_session(_session_id uuid, _counted numeric)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p public.pos_sessions%ROWTYPE;
BEGIN
  SELECT * INTO p FROM public.pos_sessions WHERE id = _session_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Turno no encontrado'; END IF;

  PERFORM public.assert_has_permission(p.company_id, 'pos.operate');

  IF NOT public.can_access_warehouse(auth.uid(), p.company_id, p.warehouse_id, true) THEN
    RAISE EXCEPTION 'Sin permisos operativos sobre la bodega del turno';
  END IF;

  IF p.status <> 'abierta' THEN RAISE EXCEPTION 'El turno ya esta cerrado'; END IF;

  UPDATE public.pos_sessions SET
    status = 'cerrada',
    closed_at = now(),
    counted_amount = _counted,
    difference = _counted - (opening_amount + expected_amount)
  WHERE id = _session_id;
END;
$$;

-- ============================================================================
-- Compras
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
  mov_id uuid;
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

  FOR ln IN SELECT * FROM public.purchase_receipt_lines WHERE receipt_id = _receipt_id LOOP
    INSERT INTO public.inventory_movement_lines (movement_id, product_id, quantity, unit_cost)
      VALUES (mov_id, ln.product_id, ln.quantity, ln.unit_cost);

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

-- ============================================================================
-- Reporteria / BI: todas las RPC de lectura sensible exigen reports.view.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.report_sales_summary(_company_id uuid, _from date, _to date)
RETURNS TABLE(total_sales numeric, total_orders bigint, avg_ticket numeric, total_cost numeric, gross_margin numeric, cash_sales numeric, credit_sales numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.assert_has_permission(_company_id, 'reports.view');
  RETURN QUERY
  SELECT COALESCE(SUM(so.total),0)::numeric, COUNT(*)::bigint, COALESCE(AVG(so.total),0)::numeric,
    COALESCE(SUM(sl.quantity * sl.unit_cost),0)::numeric,
    COALESCE(SUM(so.total) - SUM(sl.quantity * sl.unit_cost),0)::numeric,
    COALESCE(SUM(so.total) FILTER (WHERE so.payment_method <> 'credito'),0)::numeric,
    COALESCE(SUM(so.total) FILTER (WHERE so.payment_method = 'credito'),0)::numeric
  FROM public.sales_orders so
  LEFT JOIN public.sales_order_lines sl ON sl.sales_order_id = so.id
  WHERE so.company_id = _company_id AND so.status = 'confirmada' AND so.order_date BETWEEN _from AND _to;
END; $$;

CREATE OR REPLACE FUNCTION public.report_sales_by_day(_company_id uuid, _from date, _to date)
RETURNS TABLE(day date, total numeric, orders bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.assert_has_permission(_company_id, 'reports.view');
  RETURN QUERY
  SELECT so.order_date::date, COALESCE(SUM(so.total),0)::numeric, COUNT(*)::bigint
  FROM public.sales_orders so
  WHERE so.company_id = _company_id AND so.status = 'confirmada' AND so.order_date BETWEEN _from AND _to
  GROUP BY so.order_date::date
  ORDER BY so.order_date::date;
END; $$;

CREATE OR REPLACE FUNCTION public.report_top_products(_company_id uuid, _from date, _to date, _limit int DEFAULT 10)
RETURNS TABLE(product_id uuid, sku text, name text, qty numeric, revenue numeric, cost numeric, margin numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.assert_has_permission(_company_id, 'reports.view');
  RETURN QUERY
  SELECT p.id, p.sku, p.name,
    COALESCE(SUM(sl.quantity),0)::numeric,
    COALESCE(SUM(sl.quantity * sl.unit_price),0)::numeric,
    COALESCE(SUM(sl.quantity * sl.unit_cost),0)::numeric,
    COALESCE(SUM(sl.quantity * sl.unit_price) - SUM(sl.quantity * sl.unit_cost),0)::numeric
  FROM public.sales_order_lines sl
  JOIN public.sales_orders so ON so.id = sl.sales_order_id
  JOIN public.products p ON p.id = sl.product_id
  WHERE so.company_id = _company_id AND so.status = 'confirmada' AND so.order_date BETWEEN _from AND _to
  GROUP BY p.id, p.sku, p.name
  ORDER BY 5 DESC
  LIMIT _limit;
END; $$;

CREATE OR REPLACE FUNCTION public.report_top_customers(_company_id uuid, _from date, _to date, _limit int DEFAULT 10)
RETURNS TABLE(customer_id uuid, name text, orders bigint, revenue numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.assert_has_permission(_company_id, 'reports.view');
  RETURN QUERY
  SELECT tp.id, COALESCE(tp.trade_name, tp.legal_name), COUNT(*)::bigint, COALESCE(SUM(so.total),0)::numeric
  FROM public.sales_orders so
  JOIN public.third_parties tp ON tp.id = so.customer_id
  WHERE so.company_id = _company_id AND so.status = 'confirmada' AND so.order_date BETWEEN _from AND _to
  GROUP BY tp.id, tp.trade_name, tp.legal_name
  ORDER BY 4 DESC
  LIMIT _limit;
END; $$;

CREATE OR REPLACE FUNCTION public.report_purchases_summary(_company_id uuid, _from date, _to date)
RETURNS TABLE(total_purchases numeric, total_orders bigint, avg_order numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.assert_has_permission(_company_id, 'reports.view');
  RETURN QUERY
  SELECT COALESCE(SUM(po.total),0)::numeric, COUNT(*)::bigint, COALESCE(AVG(po.total),0)::numeric
  FROM public.purchase_orders po
  WHERE po.company_id = _company_id AND po.status IN ('aprobada','parcial','recibida') AND po.order_date BETWEEN _from AND _to;
END; $$;

CREATE OR REPLACE FUNCTION public.report_inventory_value(_company_id uuid)
RETURNS TABLE(warehouse_id uuid, warehouse_name text, sku_count bigint, total_qty numeric, total_value numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.assert_has_permission(_company_id, 'reports.view');
  RETURN QUERY
  SELECT w.id, w.name, COUNT(*) FILTER (WHERE s.quantity > 0)::bigint,
    COALESCE(SUM(s.quantity),0)::numeric, COALESCE(SUM(s.quantity * s.avg_cost),0)::numeric
  FROM public.warehouses w
  LEFT JOIN public.stock s ON s.warehouse_id = w.id
  WHERE w.company_id = _company_id
  GROUP BY w.id, w.name
  ORDER BY w.name;
END; $$;

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
    AND COALESCE(p.min_stock,0) > 0
    AND COALESCE((SELECT SUM(quantity) FROM public.stock WHERE product_id=p.id),0) < COALESCE(p.min_stock,0)
  ORDER BY (COALESCE(p.min_stock,0) - COALESCE((SELECT SUM(quantity) FROM public.stock WHERE product_id=p.id),0)) DESC
  LIMIT _limit;
END; $$;

CREATE OR REPLACE FUNCTION public.report_cashflow_by_day(_company_id uuid, _from date, _to date)
RETURNS TABLE(day date, inflow numeric, outflow numeric, net numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.assert_has_permission(_company_id, 'reports.view');
  RETURN QUERY
  SELECT t.txn_date::date,
    COALESCE(SUM(t.amount) FILTER (WHERE t.txn_type IN ('cobro','ajuste_positivo')),0)::numeric,
    COALESCE(SUM(t.amount) FILTER (WHERE t.txn_type IN ('pago','ajuste_negativo')),0)::numeric,
    (COALESCE(SUM(t.amount) FILTER (WHERE t.txn_type IN ('cobro','ajuste_positivo')),0)
     - COALESCE(SUM(t.amount) FILTER (WHERE t.txn_type IN ('pago','ajuste_negativo')),0))::numeric
  FROM public.treasury_transactions t
  WHERE t.company_id = _company_id AND t.status = 'confirmado' AND t.txn_date BETWEEN _from AND _to
  GROUP BY t.txn_date::date
  ORDER BY t.txn_date::date;
END; $$;

CREATE OR REPLACE FUNCTION public.report_ar_aging(_company_id uuid)
RETURNS TABLE(bucket text, doc_count bigint, total numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.assert_has_permission(_company_id, 'reports.view');
  RETURN QUERY
  SELECT CASE
      WHEN due_date IS NULL OR due_date >= CURRENT_DATE THEN 'Vigente'
      WHEN CURRENT_DATE - due_date <= 30 THEN '1-30 dias'
      WHEN CURRENT_DATE - due_date <= 60 THEN '31-60 dias'
      WHEN CURRENT_DATE - due_date <= 90 THEN '61-90 dias'
      ELSE '90+ dias'
    END,
    COUNT(*)::bigint, COALESCE(SUM(balance),0)::numeric
  FROM public.accounts_receivable
  WHERE company_id = _company_id AND status IN ('pendiente','parcial') AND balance > 0
  GROUP BY 1
  ORDER BY 1;
END; $$;

CREATE OR REPLACE FUNCTION public.report_ap_aging(_company_id uuid)
RETURNS TABLE(bucket text, doc_count bigint, total numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.assert_has_permission(_company_id, 'reports.view');
  RETURN QUERY
  SELECT CASE
      WHEN due_date IS NULL OR due_date >= CURRENT_DATE THEN 'Vigente'
      WHEN CURRENT_DATE - due_date <= 30 THEN '1-30 dias'
      WHEN CURRENT_DATE - due_date <= 60 THEN '31-60 dias'
      WHEN CURRENT_DATE - due_date <= 90 THEN '61-90 dias'
      ELSE '90+ dias'
    END,
    COUNT(*)::bigint, COALESCE(SUM(balance),0)::numeric
  FROM public.accounts_payable
  WHERE company_id = _company_id AND status IN ('pendiente','parcial') AND balance > 0
  GROUP BY 1
  ORDER BY 1;
END; $$;

CREATE OR REPLACE FUNCTION public.report_expenses_by_category(_company_id uuid, _from date, _to date)
RETURNS TABLE(category text, doc_count bigint, total numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.assert_has_permission(_company_id, 'reports.view');
  RETURN QUERY
  SELECT COALESCE(e.category,'Sin categoria'), COUNT(*)::bigint, COALESCE(SUM(e.total),0)::numeric
  FROM public.expenses e
  WHERE e.company_id = _company_id AND e.status IN ('confirmado','pagado') AND e.expense_date BETWEEN _from AND _to
  GROUP BY 1
  ORDER BY 3 DESC;
END; $$;

CREATE OR REPLACE FUNCTION public.report_pnl(_company_id uuid, _from date, _to date)
RETURNS TABLE(revenue numeric, cogs numeric, gross_profit numeric, expenses numeric, net_profit numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_rev numeric; v_cogs numeric; v_exp numeric;
BEGIN
  PERFORM public.assert_has_permission(_company_id, 'reports.view');
  SELECT COALESCE(SUM(so.total),0), COALESCE(SUM(sl.quantity*sl.unit_cost),0)
    INTO v_rev, v_cogs
  FROM public.sales_orders so
  LEFT JOIN public.sales_order_lines sl ON sl.sales_order_id = so.id
  WHERE so.company_id=_company_id AND so.status='confirmada' AND so.order_date BETWEEN _from AND _to;
  SELECT COALESCE(SUM(total),0) INTO v_exp
  FROM public.expenses
  WHERE company_id=_company_id AND status IN ('confirmado','pagado') AND expense_date BETWEEN _from AND _to;
  RETURN QUERY SELECT v_rev, v_cogs, (v_rev - v_cogs), v_exp, (v_rev - v_cogs - v_exp);
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
    WHERE so.company_id = p_company_id AND so.status = 'confirmada' AND so.order_date >= (CURRENT_DATE - p_days)
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
  WHERE p.company_id = p_company_id AND p.is_active = true
    AND (COALESCE(st.total_stock,0) < COALESCE(p.min_stock,0)
      OR (COALESCE(sa.avg_daily,0) > 0 AND COALESCE(st.total_stock,0) / sa.avg_daily < 14))
  ORDER BY (COALESCE(st.total_stock,0) - COALESCE(p.min_stock,0)) ASC;
END; $$;

CREATE OR REPLACE FUNCTION public.report_smart_alerts(p_company_id uuid)
RETURNS TABLE(severity text, category text, title text, detail text, reference_id uuid, amount numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.assert_has_permission(p_company_id, 'reports.view');

  RETURN QUERY
  SELECT 'high'::text, 'CxC'::text, 'Factura vencida: ' || ar.doc_number,
    'Cliente ' || COALESCE(t.legal_name,'-') || ' - vencida hace ' || (CURRENT_DATE - ar.due_date)::text || ' dias',
    ar.id, ar.balance::numeric
  FROM public.accounts_receivable ar
  LEFT JOIN public.third_parties t ON t.id = ar.customer_id
  WHERE ar.company_id = p_company_id AND ar.status IN ('pendiente','parcial') AND ar.due_date IS NOT NULL
    AND ar.due_date < CURRENT_DATE AND ar.balance > 0
  ORDER BY ar.due_date ASC LIMIT 20;

  RETURN QUERY
  SELECT CASE WHEN ap.due_date < CURRENT_DATE THEN 'high' ELSE 'medium' END,
    'CxP'::text,
    CASE WHEN ap.due_date < CURRENT_DATE THEN 'Pago vencido: ' ELSE 'Pago proximo: ' END || ap.doc_number,
    'Proveedor ' || COALESCE(t.legal_name,'-') || ' - vence ' || ap.due_date::text,
    ap.id, ap.balance::numeric
  FROM public.accounts_payable ap
  LEFT JOIN public.third_parties t ON t.id = ap.supplier_id
  WHERE ap.company_id = p_company_id AND ap.status IN ('pendiente','parcial') AND ap.due_date IS NOT NULL
    AND ap.due_date <= (CURRENT_DATE + 7) AND ap.balance > 0
  ORDER BY ap.due_date ASC LIMIT 20;

  RETURN QUERY
  SELECT 'medium'::text, 'Inventario'::text, 'Stock bajo: ' || r.name,
    'Existencia ' || r.total_stock::text || ' - minimo ' || r.min_stock::text || ' (' || r.reason || ')',
    r.product_id, r.suggested_qty
  FROM public.report_reorder_suggestions(p_company_id, 30) r
  WHERE r.reason <> 'OK' LIMIT 20;

  RETURN QUERY
  SELECT 'high'::text, 'Tesoreria'::text, 'Saldo negativo: ' || b.name,
    'Cuenta ' || COALESCE(b.account_number,'-') || ' con saldo ' || b.current_balance::text,
    b.id, b.current_balance
  FROM public.bank_accounts b
  WHERE b.company_id = p_company_id AND b.current_balance < 0;
END; $$;
