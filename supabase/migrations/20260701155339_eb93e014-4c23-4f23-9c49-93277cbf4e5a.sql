-- ============ Fase 7 · Reportería / BI ============
-- Read-only aggregation RPCs (SECURITY DEFINER, gated by is_company_member)

-- 1) Sales summary: totals + counts within a date range
CREATE OR REPLACE FUNCTION public.report_sales_summary(_company_id uuid, _from date, _to date)
RETURNS TABLE(
  total_sales numeric,
  total_orders bigint,
  avg_ticket numeric,
  total_cost numeric,
  gross_margin numeric,
  cash_sales numeric,
  credit_sales numeric
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_company_member(auth.uid(), _company_id) THEN
    RAISE EXCEPTION 'Sin permisos'; END IF;
  RETURN QUERY
  SELECT
    COALESCE(SUM(so.total),0)::numeric,
    COUNT(*)::bigint,
    COALESCE(AVG(so.total),0)::numeric,
    COALESCE(SUM(sl.quantity * sl.unit_cost),0)::numeric,
    COALESCE(SUM(so.total) - SUM(sl.quantity * sl.unit_cost),0)::numeric,
    COALESCE(SUM(so.total) FILTER (WHERE so.payment_method <> 'credito'),0)::numeric,
    COALESCE(SUM(so.total) FILTER (WHERE so.payment_method = 'credito'),0)::numeric
  FROM public.sales_orders so
  LEFT JOIN public.sales_order_lines sl ON sl.sales_order_id = so.id
  WHERE so.company_id = _company_id
    AND so.status = 'confirmada'
    AND so.order_date BETWEEN _from AND _to;
END; $$;

-- 2) Sales by day (time series)
CREATE OR REPLACE FUNCTION public.report_sales_by_day(_company_id uuid, _from date, _to date)
RETURNS TABLE(day date, total numeric, orders bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_company_member(auth.uid(), _company_id) THEN
    RAISE EXCEPTION 'Sin permisos'; END IF;
  RETURN QUERY
  SELECT so.order_date::date AS day,
         COALESCE(SUM(so.total),0)::numeric,
         COUNT(*)::bigint
  FROM public.sales_orders so
  WHERE so.company_id = _company_id
    AND so.status = 'confirmada'
    AND so.order_date BETWEEN _from AND _to
  GROUP BY so.order_date::date
  ORDER BY so.order_date::date;
END; $$;

-- 3) Top products (by revenue) in range
CREATE OR REPLACE FUNCTION public.report_top_products(_company_id uuid, _from date, _to date, _limit int DEFAULT 10)
RETURNS TABLE(product_id uuid, sku text, name text, qty numeric, revenue numeric, cost numeric, margin numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_company_member(auth.uid(), _company_id) THEN
    RAISE EXCEPTION 'Sin permisos'; END IF;
  RETURN QUERY
  SELECT p.id, p.sku, p.name,
    COALESCE(SUM(sl.quantity),0)::numeric AS qty,
    COALESCE(SUM(sl.quantity * sl.unit_price),0)::numeric AS revenue,
    COALESCE(SUM(sl.quantity * sl.unit_cost),0)::numeric AS cost,
    COALESCE(SUM(sl.quantity * sl.unit_price) - SUM(sl.quantity * sl.unit_cost),0)::numeric AS margin
  FROM public.sales_order_lines sl
  JOIN public.sales_orders so ON so.id = sl.sales_order_id
  JOIN public.products p ON p.id = sl.product_id
  WHERE so.company_id = _company_id
    AND so.status = 'confirmada'
    AND so.order_date BETWEEN _from AND _to
  GROUP BY p.id, p.sku, p.name
  ORDER BY revenue DESC
  LIMIT _limit;
END; $$;

-- 4) Top customers
CREATE OR REPLACE FUNCTION public.report_top_customers(_company_id uuid, _from date, _to date, _limit int DEFAULT 10)
RETURNS TABLE(customer_id uuid, name text, orders bigint, revenue numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_company_member(auth.uid(), _company_id) THEN
    RAISE EXCEPTION 'Sin permisos'; END IF;
  RETURN QUERY
  SELECT tp.id, tp.name, COUNT(*)::bigint, COALESCE(SUM(so.total),0)::numeric
  FROM public.sales_orders so
  JOIN public.third_parties tp ON tp.id = so.customer_id
  WHERE so.company_id = _company_id
    AND so.status = 'confirmada'
    AND so.order_date BETWEEN _from AND _to
  GROUP BY tp.id, tp.name
  ORDER BY 4 DESC
  LIMIT _limit;
END; $$;

-- 5) Purchases summary
CREATE OR REPLACE FUNCTION public.report_purchases_summary(_company_id uuid, _from date, _to date)
RETURNS TABLE(total_purchases numeric, total_orders bigint, avg_order numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_company_member(auth.uid(), _company_id) THEN
    RAISE EXCEPTION 'Sin permisos'; END IF;
  RETURN QUERY
  SELECT COALESCE(SUM(po.total),0)::numeric, COUNT(*)::bigint, COALESCE(AVG(po.total),0)::numeric
  FROM public.purchase_orders po
  WHERE po.company_id = _company_id
    AND po.status IN ('confirmada','parcial','recibida')
    AND po.order_date BETWEEN _from AND _to;
END; $$;

-- 6) Inventory value by warehouse (current)
CREATE OR REPLACE FUNCTION public.report_inventory_value(_company_id uuid)
RETURNS TABLE(warehouse_id uuid, warehouse_name text, sku_count bigint, total_qty numeric, total_value numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_company_member(auth.uid(), _company_id) THEN
    RAISE EXCEPTION 'Sin permisos'; END IF;
  RETURN QUERY
  SELECT w.id, w.name,
    COUNT(*) FILTER (WHERE s.quantity > 0)::bigint,
    COALESCE(SUM(s.quantity),0)::numeric,
    COALESCE(SUM(s.quantity * s.avg_cost),0)::numeric
  FROM public.warehouses w
  LEFT JOIN public.stock s ON s.warehouse_id = w.id
  WHERE w.company_id = _company_id
  GROUP BY w.id, w.name
  ORDER BY w.name;
END; $$;

-- 7) Low stock alerts (below min_stock)
CREATE OR REPLACE FUNCTION public.report_low_stock(_company_id uuid, _limit int DEFAULT 50)
RETURNS TABLE(product_id uuid, sku text, name text, min_stock numeric, current_qty numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_company_member(auth.uid(), _company_id) THEN
    RAISE EXCEPTION 'Sin permisos'; END IF;
  RETURN QUERY
  SELECT p.id, p.sku, p.name,
    COALESCE(p.min_stock,0)::numeric,
    COALESCE((SELECT SUM(quantity) FROM public.stock WHERE product_id=p.id),0)::numeric AS cur
  FROM public.products p
  WHERE p.company_id = _company_id
    AND COALESCE(p.min_stock,0) > 0
    AND COALESCE((SELECT SUM(quantity) FROM public.stock WHERE product_id=p.id),0) < COALESCE(p.min_stock,0)
  ORDER BY (COALESCE(p.min_stock,0) - COALESCE((SELECT SUM(quantity) FROM public.stock WHERE product_id=p.id),0)) DESC
  LIMIT _limit;
END; $$;

-- 8) Cash-flow (treasury inflows/outflows by day)
CREATE OR REPLACE FUNCTION public.report_cashflow_by_day(_company_id uuid, _from date, _to date)
RETURNS TABLE(day date, inflow numeric, outflow numeric, net numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_company_member(auth.uid(), _company_id) THEN
    RAISE EXCEPTION 'Sin permisos'; END IF;
  RETURN QUERY
  SELECT t.txn_date::date,
    COALESCE(SUM(t.amount) FILTER (WHERE t.txn_type IN ('cobro','ajuste_positivo')),0)::numeric AS inflow,
    COALESCE(SUM(t.amount) FILTER (WHERE t.txn_type IN ('pago','ajuste_negativo')),0)::numeric AS outflow,
    (COALESCE(SUM(t.amount) FILTER (WHERE t.txn_type IN ('cobro','ajuste_positivo')),0)
     - COALESCE(SUM(t.amount) FILTER (WHERE t.txn_type IN ('pago','ajuste_negativo')),0))::numeric AS net
  FROM public.treasury_transactions t
  WHERE t.company_id = _company_id
    AND t.status = 'confirmado'
    AND t.txn_date BETWEEN _from AND _to
  GROUP BY t.txn_date::date
  ORDER BY t.txn_date::date;
END; $$;

-- 9) AR / AP aging summary
CREATE OR REPLACE FUNCTION public.report_ar_aging(_company_id uuid)
RETURNS TABLE(bucket text, doc_count bigint, total numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_company_member(auth.uid(), _company_id) THEN
    RAISE EXCEPTION 'Sin permisos'; END IF;
  RETURN QUERY
  SELECT
    CASE
      WHEN due_date IS NULL OR due_date >= CURRENT_DATE THEN 'Vigente'
      WHEN CURRENT_DATE - due_date <= 30 THEN '1-30 días'
      WHEN CURRENT_DATE - due_date <= 60 THEN '31-60 días'
      WHEN CURRENT_DATE - due_date <= 90 THEN '61-90 días'
      ELSE '90+ días'
    END AS bucket,
    COUNT(*)::bigint,
    COALESCE(SUM(balance),0)::numeric
  FROM public.accounts_receivable
  WHERE company_id = _company_id AND status IN ('pendiente','parcial') AND balance > 0
  GROUP BY 1
  ORDER BY 1;
END; $$;

CREATE OR REPLACE FUNCTION public.report_ap_aging(_company_id uuid)
RETURNS TABLE(bucket text, doc_count bigint, total numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_company_member(auth.uid(), _company_id) THEN
    RAISE EXCEPTION 'Sin permisos'; END IF;
  RETURN QUERY
  SELECT
    CASE
      WHEN due_date IS NULL OR due_date >= CURRENT_DATE THEN 'Vigente'
      WHEN CURRENT_DATE - due_date <= 30 THEN '1-30 días'
      WHEN CURRENT_DATE - due_date <= 60 THEN '31-60 días'
      WHEN CURRENT_DATE - due_date <= 90 THEN '61-90 días'
      ELSE '90+ días'
    END AS bucket,
    COUNT(*)::bigint,
    COALESCE(SUM(balance),0)::numeric
  FROM public.accounts_payable
  WHERE company_id = _company_id AND status IN ('pendiente','parcial') AND balance > 0
  GROUP BY 1
  ORDER BY 1;
END; $$;

-- 10) Expenses by category
CREATE OR REPLACE FUNCTION public.report_expenses_by_category(_company_id uuid, _from date, _to date)
RETURNS TABLE(category text, doc_count bigint, total numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_company_member(auth.uid(), _company_id) THEN
    RAISE EXCEPTION 'Sin permisos'; END IF;
  RETURN QUERY
  SELECT COALESCE(e.category,'Sin categoría'),
    COUNT(*)::bigint,
    COALESCE(SUM(e.total),0)::numeric
  FROM public.expenses e
  WHERE e.company_id = _company_id
    AND e.status IN ('confirmado','pagado')
    AND e.expense_date BETWEEN _from AND _to
  GROUP BY 1
  ORDER BY 3 DESC;
END; $$;

-- 11) P&L simplified (Ingresos - Costos - Gastos)
CREATE OR REPLACE FUNCTION public.report_pnl(_company_id uuid, _from date, _to date)
RETURNS TABLE(revenue numeric, cogs numeric, gross_profit numeric, expenses numeric, net_profit numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_rev numeric; v_cogs numeric; v_exp numeric;
BEGIN
  IF NOT public.is_company_member(auth.uid(), _company_id) THEN
    RAISE EXCEPTION 'Sin permisos'; END IF;
  SELECT COALESCE(SUM(so.total),0), COALESCE(SUM(sl.quantity*sl.unit_cost),0)
    INTO v_rev, v_cogs
  FROM public.sales_orders so
  LEFT JOIN public.sales_order_lines sl ON sl.sales_order_id = so.id
  WHERE so.company_id=_company_id AND so.status='confirmada'
    AND so.order_date BETWEEN _from AND _to;
  SELECT COALESCE(SUM(total),0) INTO v_exp
  FROM public.expenses
  WHERE company_id=_company_id AND status IN ('confirmado','pagado')
    AND expense_date BETWEEN _from AND _to;
  RETURN QUERY SELECT v_rev, v_cogs, (v_rev - v_cogs), v_exp, (v_rev - v_cogs - v_exp);
END; $$;
