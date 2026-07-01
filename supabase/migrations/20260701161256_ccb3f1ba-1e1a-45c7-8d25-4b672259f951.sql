
CREATE TABLE public.ai_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'Nueva conversación',
  agent TEXT NOT NULL DEFAULT 'general',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_conversations TO authenticated;
GRANT ALL ON public.ai_conversations TO service_role;
ALTER TABLE public.ai_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ai_conv_read" ON public.ai_conversations FOR SELECT TO authenticated
  USING (public.is_company_member(auth.uid(), company_id) AND user_id = auth.uid());
CREATE POLICY "ai_conv_insert" ON public.ai_conversations FOR INSERT TO authenticated
  WITH CHECK (public.is_company_member(auth.uid(), company_id) AND user_id = auth.uid());
CREATE POLICY "ai_conv_update" ON public.ai_conversations FOR UPDATE TO authenticated
  USING (public.is_company_member(auth.uid(), company_id) AND user_id = auth.uid());
CREATE POLICY "ai_conv_delete" ON public.ai_conversations FOR DELETE TO authenticated
  USING (public.is_company_member(auth.uid(), company_id) AND user_id = auth.uid());

CREATE TABLE public.ai_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.ai_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user','assistant','system')),
  parts JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.ai_messages TO authenticated;
GRANT ALL ON public.ai_messages TO service_role;
ALTER TABLE public.ai_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ai_msg_read" ON public.ai_messages FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.ai_conversations c WHERE c.id = conversation_id AND c.user_id = auth.uid()));
CREATE POLICY "ai_msg_write" ON public.ai_messages FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.ai_conversations c WHERE c.id = conversation_id AND c.user_id = auth.uid()));
CREATE POLICY "ai_msg_delete" ON public.ai_messages FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.ai_conversations c WHERE c.id = conversation_id AND c.user_id = auth.uid()));

CREATE INDEX ai_messages_conv_idx ON public.ai_messages(conversation_id, created_at);
CREATE INDEX ai_conversations_company_user_idx ON public.ai_conversations(company_id, user_id, updated_at DESC);

CREATE TRIGGER ai_conversations_updated_at BEFORE UPDATE ON public.ai_conversations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

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
  WITH stock AS (
    SELECT s.product_id, COALESCE(SUM(s.qty),0) AS total_stock
    FROM public.inventory_stock s
    JOIN public.warehouses w ON w.id = s.warehouse_id
    WHERE w.company_id = p_company_id
    GROUP BY s.product_id
  ),
  sales AS (
    SELECT si.product_id, COALESCE(SUM(si.qty),0) / GREATEST(p_days,1)::numeric AS avg_daily
    FROM public.sales_invoice_items si
    JOIN public.sales_invoices inv ON inv.id = si.invoice_id
    WHERE inv.company_id = p_company_id
      AND inv.status = 'Confirmada'
      AND inv.issue_date >= (CURRENT_DATE - p_days)
    GROUP BY si.product_id
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
         THEN GREATEST( (sa.avg_daily * p_days) - COALESCE(st.total_stock,0), 0)
         ELSE GREATEST( COALESCE(p.min_stock,0) - COALESCE(st.total_stock,0), 0) END,
    CASE
      WHEN COALESCE(st.total_stock,0) <= 0 THEN 'Sin existencia'
      WHEN COALESCE(st.total_stock,0) < COALESCE(p.min_stock,0) THEN 'Bajo stock mínimo'
      WHEN COALESCE(sa.avg_daily,0) > 0 AND COALESCE(st.total_stock,0) / sa.avg_daily < 7 THEN 'Menos de 7 días'
      ELSE 'OK'
    END
  FROM public.products p
  LEFT JOIN stock st ON st.product_id = p.id
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
         ar.id, (ar.balance)::numeric
  FROM public.accounts_receivable ar
  LEFT JOIN public.parties t ON t.id = ar.customer_id
  WHERE ar.company_id = p_company_id
    AND ar.status IN ('Pendiente','Parcial')
    AND ar.due_date < CURRENT_DATE
    AND ar.balance > 0
  ORDER BY ar.due_date ASC LIMIT 20;

  RETURN QUERY
  SELECT CASE WHEN ap.due_date < CURRENT_DATE THEN 'high' ELSE 'medium' END,
         'CxP'::text,
         CASE WHEN ap.due_date < CURRENT_DATE THEN 'Pago vencido: ' ELSE 'Pago próximo: ' END || ap.doc_number,
         'Proveedor ' || COALESCE(t.legal_name,'—') || ' — vence ' || ap.due_date::text,
         ap.id, (ap.balance)::numeric
  FROM public.accounts_payable ap
  LEFT JOIN public.parties t ON t.id = ap.supplier_id
  WHERE ap.company_id = p_company_id
    AND ap.status IN ('Pendiente','Parcial')
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
         'Cuenta ' || COALESCE(b.account_number,'—') || ' con saldo ' || b.balance::text,
         b.id, b.balance
  FROM public.bank_accounts b
  WHERE b.company_id = p_company_id AND b.balance < 0;
END;
$$;

GRANT EXECUTE ON FUNCTION public.report_reorder_suggestions(UUID, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.report_smart_alerts(UUID) TO authenticated;
