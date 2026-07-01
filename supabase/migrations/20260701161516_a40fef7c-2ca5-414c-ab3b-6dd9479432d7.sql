
CREATE OR REPLACE FUNCTION public.report_reorder_suggestions(
  p_company_id UUID,
  p_days INT DEFAULT 30
) RETURNS TABLE(
  product_id UUID,
  sku TEXT,
  name TEXT,
  total_stock NUMERIC,
  min_stock NUMERIC,
  avg_daily_sales NUMERIC,
  days_of_stock NUMERIC,
  suggested_qty NUMERIC,
  reason TEXT
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_company_member(auth.uid(), p_company_id) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY
  WITH stk AS (
    SELECT s.product_id, COALESCE(SUM(s.quantity),0)::numeric AS total_stock
    FROM public.stock s
    WHERE s.company_id = p_company_id
    GROUP BY s.product_id
  ),
  sales AS (
    SELECT sl.product_id,
           COALESCE(SUM(sl.quantity),0)::numeric / GREATEST(p_days,1)::numeric AS avg_daily
    FROM public.sales_order_lines sl
    JOIN public.sales_orders so ON so.id = sl.sales_order_id
    WHERE so.company_id = p_company_id
      AND so.status = 'confirmada'
      AND so.order_date >= (CURRENT_DATE - p_days)
    GROUP BY sl.product_id
  )
  SELECT
    p.id, p.sku, p.name,
    COALESCE(st.total_stock,0),
    COALESCE(p.min_stock,0)::numeric,
    COALESCE(sa.avg_daily,0),
    CASE WHEN COALESCE(sa.avg_daily,0) > 0
         THEN ROUND(COALESCE(st.total_stock,0) / sa.avg_daily, 1)
         ELSE NULL END,
    CASE WHEN COALESCE(sa.avg_daily,0) > 0
         THEN GREATEST((sa.avg_daily * p_days) - COALESCE(st.total_stock,0), 0)
         ELSE GREATEST(COALESCE(p.min_stock,0) - COALESCE(st.total_stock,0), 0) END,
    CASE
      WHEN COALESCE(st.total_stock,0) <= 0 THEN 'Sin existencia'
      WHEN COALESCE(st.total_stock,0) < COALESCE(p.min_stock,0) THEN 'Bajo stock mínimo'
      WHEN COALESCE(sa.avg_daily,0) > 0 AND COALESCE(st.total_stock,0) / sa.avg_daily < 7 THEN 'Menos de 7 días'
      ELSE 'OK'
    END
  FROM public.products p
  LEFT JOIN stk st ON st.product_id = p.id
  LEFT JOIN sales sa ON sa.product_id = p.id
  WHERE p.company_id = p_company_id
    AND p.is_active = true
    AND (
      COALESCE(st.total_stock,0) < COALESCE(p.min_stock,0)
      OR (COALESCE(sa.avg_daily,0) > 0 AND COALESCE(st.total_stock,0) / sa.avg_daily < 14)
    )
  ORDER BY (COALESCE(st.total_stock,0) - COALESCE(p.min_stock,0)) ASC;
END;
$$;

CREATE OR REPLACE FUNCTION public.report_smart_alerts(p_company_id UUID)
RETURNS TABLE(
  severity TEXT,
  category TEXT,
  title TEXT,
  detail TEXT,
  reference_id UUID,
  amount NUMERIC
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_company_member(auth.uid(), p_company_id) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  SELECT 'high'::text, 'CxC'::text,
         'Factura vencida: ' || ar.doc_number,
         'Cliente ' || COALESCE(t.legal_name,'—') || ' — vencida hace ' ||
           (CURRENT_DATE - ar.due_date)::text || ' días',
         ar.id, ar.balance::numeric
  FROM public.accounts_receivable ar
  LEFT JOIN public.third_parties t ON t.id = ar.customer_id
  WHERE ar.company_id = p_company_id
    AND ar.status IN ('pendiente','parcial')
    AND ar.due_date IS NOT NULL
    AND ar.due_date < CURRENT_DATE
    AND ar.balance > 0
  ORDER BY ar.due_date ASC LIMIT 20;

  RETURN QUERY
  SELECT CASE WHEN ap.due_date < CURRENT_DATE THEN 'high' ELSE 'medium' END,
         'CxP'::text,
         CASE WHEN ap.due_date < CURRENT_DATE THEN 'Pago vencido: ' ELSE 'Pago próximo: ' END || ap.doc_number,
         'Proveedor ' || COALESCE(t.legal_name,'—') || ' — vence ' || ap.due_date::text,
         ap.id, ap.balance::numeric
  FROM public.accounts_payable ap
  LEFT JOIN public.third_parties t ON t.id = ap.supplier_id
  WHERE ap.company_id = p_company_id
    AND ap.status IN ('pendiente','parcial')
    AND ap.due_date IS NOT NULL
    AND ap.due_date <= (CURRENT_DATE + 7)
    AND ap.balance > 0
  ORDER BY ap.due_date ASC LIMIT 20;

  RETURN QUERY
  SELECT 'medium'::text, 'Inventario'::text,
         'Stock bajo: ' || r.name,
         'Existencia ' || r.total_stock::text || ' — mínimo ' || r.min_stock::text || ' (' || r.reason || ')',
         r.product_id, r.suggested_qty
  FROM public.report_reorder_suggestions(p_company_id, 30) r
  WHERE r.reason <> 'OK' LIMIT 20;

  RETURN QUERY
  SELECT 'high'::text, 'Tesorería'::text,
         'Saldo negativo: ' || b.name,
         'Cuenta ' || COALESCE(b.account_number,'—') || ' con saldo ' || b.current_balance::text,
         b.id, b.current_balance
  FROM public.bank_accounts b
  WHERE b.company_id = p_company_id AND b.current_balance < 0;
END;
$$;
