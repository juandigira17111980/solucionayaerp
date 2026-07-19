-- Fase 6.2 - Integracion automatica contable
-- Amarra ventas/POS, compras, tesoreria e inventario con asientos contables
-- idempotentes, usando mapeos configurables por empresa.

CREATE INDEX IF NOT EXISTS idx_journal_entries_source_lookup
  ON public.journal_entries(company_id, source_type, source_id)
  WHERE source_type IS NOT NULL AND source_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.ensure_accounting_automation_defaults(_company_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  start_month date := date_trunc('month', CURRENT_DATE)::date;
BEGIN
  IF NOT public.is_company_member(auth.uid(), _company_id) THEN
    RAISE EXCEPTION 'Sin permisos sobre esta empresa';
  END IF;

  PERFORM public.seed_chart_of_accounts(_company_id);

  INSERT INTO public.accounting_voucher_types(company_id, code, name, prefix)
  VALUES
    (_company_id, 'DIARIO', 'Comprobante diario', 'AS'),
    (_company_id, 'VENTA', 'Comprobante de venta', 'VE'),
    (_company_id, 'COMPRA', 'Comprobante de compra', 'CO'),
    (_company_id, 'EGRESO', 'Comprobante de egreso', 'CE'),
    (_company_id, 'INGRESO', 'Comprobante de ingreso', 'CI'),
    (_company_id, 'NOMINA', 'Comprobante de nomina', 'NM'),
    (_company_id, 'AJUSTE', 'Comprobante de ajuste', 'AJ')
  ON CONFLICT (company_id, code) DO NOTHING;

  INSERT INTO public.accounting_periods(company_id, period_code, start_date, end_date)
  VALUES (
    _company_id,
    to_char(start_month, 'YYYY-MM'),
    start_month,
    (start_month + interval '1 month - 1 day')::date
  )
  ON CONFLICT (company_id, period_code) DO NOTHING;

  INSERT INTO public.accounting_account_mappings(company_id, mapping_key, account_id, description)
  SELECT _company_id, v.mapping_key, coa.id, v.description
  FROM (
    VALUES
      ('cash.efectivo', '1105', 'Caja para pagos en efectivo'),
      ('cash.otro', '1105', 'Caja para otros medios'),
      ('bank.default', '1110', 'Bancos por defecto'),
      ('cash.tarjeta', '1110', 'Banco para tarjetas'),
      ('cash.transferencia', '1110', 'Banco para transferencias'),
      ('ar.customers', '1305', 'Clientes / cuentas por cobrar'),
      ('inventory.stock', '1435', 'Inventario de mercancias'),
      ('ap.suppliers', '2205', 'Proveedores / cuentas por pagar'),
      ('tax.payable', '2408', 'IVA por pagar'),
      ('sales.revenue', '4135', 'Ingresos por ventas'),
      ('expense.default', '5195', 'Gastos diversos'),
      ('cogs.merchandise', '6135', 'Costo de mercancias')
  ) AS v(mapping_key, code, description)
  JOIN public.chart_of_accounts coa
    ON coa.company_id = _company_id
   AND coa.code = v.code
  ON CONFLICT (company_id, mapping_key) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_accounting_account(
  _company_id uuid,
  _mapping_key text,
  _fallback_code text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  account_id uuid;
BEGIN
  PERFORM public.ensure_accounting_automation_defaults(_company_id);

  SELECT m.account_id INTO account_id
  FROM public.accounting_account_mappings m
  JOIN public.chart_of_accounts coa ON coa.id = m.account_id
  WHERE m.company_id = _company_id
    AND m.mapping_key = _mapping_key
    AND m.is_active = true
    AND coa.is_active = true
    AND coa.is_postable = true
  LIMIT 1;

  IF account_id IS NULL THEN
    SELECT id INTO account_id
    FROM public.chart_of_accounts
    WHERE company_id = _company_id
      AND code = _fallback_code
      AND is_active = true
      AND is_postable = true
    LIMIT 1;
  END IF;

  IF account_id IS NULL THEN
    RAISE EXCEPTION 'No hay cuenta contable activa para % / %', _mapping_key, _fallback_code;
  END IF;

  RETURN account_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.accounting_line(
  _account_id uuid,
  _description text,
  _debit numeric,
  _credit numeric,
  _third_party_id uuid DEFAULT NULL,
  _cost_center_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT jsonb_build_object(
    'account_id', _account_id,
    'description', _description,
    'debit', COALESCE(_debit, 0),
    'credit', COALESCE(_credit, 0),
    'third_party_id', _third_party_id,
    'cost_center_id', _cost_center_id
  );
$$;

CREATE OR REPLACE FUNCTION public.ensure_accounting_period_system(_company_id uuid, _entry_date date)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p_id uuid;
  p_start date := date_trunc('month', _entry_date)::date;
BEGIN
  SELECT id INTO p_id
  FROM public.accounting_periods
  WHERE company_id = _company_id
    AND _entry_date BETWEEN start_date AND end_date
  ORDER BY start_date DESC
  LIMIT 1;

  IF p_id IS NULL THEN
    INSERT INTO public.accounting_periods(company_id, period_code, start_date, end_date)
    VALUES (
      _company_id,
      to_char(p_start, 'YYYY-MM'),
      p_start,
      (p_start + interval '1 month - 1 day')::date
    )
    RETURNING id INTO p_id;
  END IF;

  RETURN p_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.assert_accounting_period_open_system(_company_id uuid, _entry_date date)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p public.accounting_periods%ROWTYPE;
BEGIN
  SELECT * INTO p
  FROM public.accounting_periods
  WHERE company_id = _company_id
    AND _entry_date BETWEEN start_date AND end_date
  ORDER BY start_date DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN public.ensure_accounting_period_system(_company_id, _entry_date);
  END IF;

  IF p.status <> 'abierto' THEN
    RAISE EXCEPTION 'Periodo contable % no esta abierto', p.period_code;
  END IF;

  RETURN p.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_system_journal_entry(
  _company_id uuid,
  _entry_date date,
  _voucher_type_code text,
  _reference text,
  _description text,
  _source_type text,
  _source_id uuid,
  _lines jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p_id uuid;
  vt public.accounting_voucher_types%ROWTYPE;
  doc text;
  je_id uuid;
  item RECORD;
  v_total_debit numeric(18,2) := 0;
  v_total_credit numeric(18,2) := 0;
BEGIN
  IF _source_type IS NOT NULL AND _source_id IS NOT NULL THEN
    SELECT id INTO je_id
    FROM public.journal_entries
    WHERE company_id = _company_id
      AND source_type = _source_type
      AND source_id = _source_id
      AND status <> 'anulado'
    ORDER BY created_at DESC
    LIMIT 1;

    IF je_id IS NOT NULL THEN
      RETURN je_id;
    END IF;
  END IF;

  IF _lines IS NULL OR jsonb_typeof(_lines) <> 'array' OR jsonb_array_length(_lines) < 2 THEN
    RAISE EXCEPTION 'El asiento automatico requiere al menos dos lineas';
  END IF;

  PERFORM public.ensure_accounting_automation_defaults(_company_id);
  p_id := public.assert_accounting_period_open_system(_company_id, COALESCE(_entry_date, CURRENT_DATE));

  SELECT * INTO vt
  FROM public.accounting_voucher_types
  WHERE company_id = _company_id
    AND code = COALESCE(NULLIF(_voucher_type_code, ''), 'DIARIO')
    AND is_active = true
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tipo de comprobante contable no configurado: %', _voucher_type_code;
  END IF;

  doc := public.next_accounting_number(_company_id, CASE COALESCE(vt.code, 'DIARIO')
    WHEN 'VENTA' THEN 'sale'
    WHEN 'COMPRA' THEN 'purchase'
    WHEN 'INGRESO' THEN 'income'
    WHEN 'EGRESO' THEN 'expense_voucher'
    WHEN 'NOMINA' THEN 'payroll'
    WHEN 'AJUSTE' THEN 'adjustment'
    ELSE 'journal'
  END);

  INSERT INTO public.journal_entries(
    company_id, doc_number, entry_date, period_id, voucher_type_id,
    reference, description, source_type, source_id, status,
    total_debit, total_credit, created_by, confirmed_at, confirmed_by
  ) VALUES (
    _company_id, doc, COALESCE(_entry_date, CURRENT_DATE), p_id, vt.id,
    _reference, _description, COALESCE(_source_type, 'system'), _source_id, 'confirmado',
    0, 0, auth.uid(), now(), auth.uid()
  ) RETURNING id INTO je_id;

  FOR item IN
    SELECT
      (x.value->>'account_id')::uuid AS account_id,
      NULLIF(x.value->>'third_party_id', '')::uuid AS third_party_id,
      NULLIF(x.value->>'cost_center_id', '')::uuid AS cost_center_id,
      NULLIF(x.value->>'description', '') AS description,
      COALESCE((x.value->>'debit')::numeric, 0) AS debit,
      COALESCE((x.value->>'credit')::numeric, 0) AS credit
    FROM jsonb_array_elements(_lines) AS x(value)
  LOOP
    IF item.account_id IS NULL OR (item.debit <= 0 AND item.credit <= 0) OR (item.debit > 0 AND item.credit > 0) THEN
      RAISE EXCEPTION 'Linea contable automatica invalida';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.chart_of_accounts coa
      WHERE coa.id = item.account_id
        AND coa.company_id = _company_id
        AND coa.is_active = true
        AND coa.is_postable = true
    ) THEN
      RAISE EXCEPTION 'Cuenta contable automatica no valida o no imputable';
    END IF;

    IF item.cost_center_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.cost_centers cc
      WHERE cc.id = item.cost_center_id
        AND cc.company_id = _company_id
        AND cc.is_active = true
    ) THEN
      RAISE EXCEPTION 'Centro de costo no valido';
    END IF;

    INSERT INTO public.journal_entry_lines(
      journal_entry_id, account_id, third_party_id, cost_center_id, description, debit, credit
    ) VALUES (
      je_id, item.account_id, item.third_party_id, item.cost_center_id,
      item.description, item.debit, item.credit
    );

    v_total_debit := v_total_debit + item.debit;
    v_total_credit := v_total_credit + item.credit;
  END LOOP;

  IF round(v_total_debit, 2) <> round(v_total_credit, 2) THEN
    RAISE EXCEPTION 'Asiento automatico descuadrado: debito % vs credito %', v_total_debit, v_total_credit;
  END IF;

  UPDATE public.journal_entries
  SET total_debit = v_total_debit,
      total_credit = v_total_credit
  WHERE id = je_id;

  RETURN je_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.post_accounting_for_sale(_sales_order_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s public.sales_orders%ROWTYPE;
  lines jsonb := '[]'::jsonb;
  paid_lines int := 0;
  payment RECORD;
  revenue numeric(18,2);
  cogs numeric(18,2);
  cash_account uuid;
  bank_account uuid;
  ar_account uuid;
  revenue_account uuid;
  tax_account uuid;
  stock_account uuid;
  cogs_account uuid;
  payment_key text;
BEGIN
  SELECT * INTO s FROM public.sales_orders WHERE id = _sales_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Venta no encontrada para contabilizar'; END IF;
  PERFORM public.assert_any_permission(s.company_id, ARRAY['sales.operate', 'pos.operate', 'accounting.operate']);
  IF s.status <> 'confirmada' THEN RAISE EXCEPTION 'La venta debe estar confirmada para contabilizar'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.journal_entries
    WHERE company_id = s.company_id AND source_type = 'sale' AND source_id = s.id AND status <> 'anulado'
  ) THEN
    SELECT id INTO STRICT stock_account FROM public.journal_entries
    WHERE company_id = s.company_id AND source_type = 'sale' AND source_id = s.id AND status <> 'anulado'
    ORDER BY created_at DESC LIMIT 1;
    RETURN stock_account;
  END IF;

  cash_account := public.resolve_accounting_account(s.company_id, 'cash.efectivo', '1105');
  bank_account := public.resolve_accounting_account(s.company_id, 'bank.default', '1110');
  ar_account := public.resolve_accounting_account(s.company_id, 'ar.customers', '1305');
  revenue_account := public.resolve_accounting_account(s.company_id, 'sales.revenue', '4135');
  tax_account := public.resolve_accounting_account(s.company_id, 'tax.payable', '2408');
  stock_account := public.resolve_accounting_account(s.company_id, 'inventory.stock', '1435');
  cogs_account := public.resolve_accounting_account(s.company_id, 'cogs.merchandise', '6135');

  FOR payment IN
    SELECT payment_method, SUM(amount)::numeric(18,2) AS amount
    FROM public.pos_sale_payments
    WHERE sales_order_id = s.id
    GROUP BY payment_method
  LOOP
    payment_key := CASE payment.payment_method
      WHEN 'efectivo' THEN 'cash.efectivo'
      WHEN 'tarjeta' THEN 'cash.tarjeta'
      WHEN 'transferencia' THEN 'cash.transferencia'
      WHEN 'otro' THEN 'cash.otro'
      ELSE 'ar.customers'
    END;

    IF payment.payment_method = 'credito' THEN
      lines := lines || jsonb_build_array(public.accounting_line(ar_account, 'CxC POS ' || s.doc_number, payment.amount, 0, s.customer_id));
    ELSE
      lines := lines || jsonb_build_array(public.accounting_line(
        public.resolve_accounting_account(s.company_id, payment_key, CASE WHEN payment.payment_method = 'efectivo' THEN '1105' ELSE '1110' END),
        'Pago POS ' || s.doc_number || ' - ' || payment.payment_method::text,
        payment.amount, 0, s.customer_id
      ));
    END IF;
    paid_lines := paid_lines + 1;
  END LOOP;

  IF paid_lines = 0 THEN
    IF s.payment_method = 'credito' THEN
      lines := lines || jsonb_build_array(public.accounting_line(ar_account, 'CxC venta ' || s.doc_number, s.total, 0, s.customer_id));
    ELSIF s.payment_method = 'tarjeta' OR s.payment_method = 'transferencia' THEN
      lines := lines || jsonb_build_array(public.accounting_line(bank_account, 'Pago venta ' || s.doc_number, s.total, 0, s.customer_id));
    ELSIF s.payment_method = 'mixto' THEN
      IF s.paid_amount > 0 THEN
        lines := lines || jsonb_build_array(public.accounting_line(cash_account, 'Pago parcial venta ' || s.doc_number, s.paid_amount, 0, s.customer_id));
      END IF;
      IF s.balance > 0 THEN
        lines := lines || jsonb_build_array(public.accounting_line(ar_account, 'Saldo CxC venta ' || s.doc_number, s.balance, 0, s.customer_id));
      END IF;
    ELSE
      lines := lines || jsonb_build_array(public.accounting_line(cash_account, 'Pago venta ' || s.doc_number, s.total, 0, s.customer_id));
    END IF;
  END IF;

  revenue := round(GREATEST(s.subtotal - s.discount_amount, 0), 2);
  IF revenue > 0 THEN
    lines := lines || jsonb_build_array(public.accounting_line(revenue_account, 'Ingreso venta ' || s.doc_number, 0, revenue, s.customer_id));
  END IF;
  IF s.tax_amount > 0 THEN
    lines := lines || jsonb_build_array(public.accounting_line(tax_account, 'IVA venta ' || s.doc_number, 0, s.tax_amount, s.customer_id));
  END IF;

  SELECT COALESCE(SUM(sl.quantity * sl.unit_cost), 0)::numeric(18,2) INTO cogs
  FROM public.sales_order_lines sl
  JOIN public.products p ON p.id = sl.product_id
  WHERE sl.sales_order_id = s.id
    AND p.tracks_inventory = true;

  IF cogs > 0 THEN
    lines := lines || jsonb_build_array(public.accounting_line(cogs_account, 'Costo venta ' || s.doc_number, cogs, 0, s.customer_id));
    lines := lines || jsonb_build_array(public.accounting_line(stock_account, 'Salida inventario venta ' || s.doc_number, 0, cogs, s.customer_id));
  END IF;

  RETURN public.create_system_journal_entry(
    s.company_id, s.order_date, 'VENTA', s.doc_number,
    'Contabilizacion automatica venta ' || s.doc_number,
    'sale', s.id, lines
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.post_accounting_for_purchase_receipt(_receipt_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.purchase_receipts%ROWTYPE;
  inventory_total numeric(18,2);
  expense_total numeric(18,2);
  lines jsonb := '[]'::jsonb;
  stock_account uuid;
  expense_account uuid;
  ap_account uuid;
BEGIN
  SELECT * INTO r FROM public.purchase_receipts WHERE id = _receipt_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Recepcion no encontrada para contabilizar'; END IF;
  PERFORM public.assert_any_permission(r.company_id, ARRAY['purchases.operate', 'accounting.operate']);
  IF r.status <> 'confirmada' THEN RAISE EXCEPTION 'La recepcion debe estar confirmada para contabilizar'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.journal_entries
    WHERE company_id = r.company_id AND source_type = 'purchase_receipt' AND source_id = r.id AND status <> 'anulado'
  ) THEN
    SELECT id INTO stock_account FROM public.journal_entries
    WHERE company_id = r.company_id AND source_type = 'purchase_receipt' AND source_id = r.id AND status <> 'anulado'
    ORDER BY created_at DESC LIMIT 1;
    RETURN stock_account;
  END IF;

  stock_account := public.resolve_accounting_account(r.company_id, 'inventory.stock', '1435');
  expense_account := public.resolve_accounting_account(r.company_id, 'expense.default', '5195');
  ap_account := public.resolve_accounting_account(r.company_id, 'ap.suppliers', '2205');

  SELECT COALESCE(SUM(prl.quantity * prl.unit_cost) FILTER (WHERE p.tracks_inventory = true), 0)::numeric(18,2),
         COALESCE(SUM(prl.quantity * prl.unit_cost) FILTER (WHERE p.tracks_inventory IS NOT TRUE), 0)::numeric(18,2)
    INTO inventory_total, expense_total
  FROM public.purchase_receipt_lines prl
  JOIN public.products p ON p.id = prl.product_id
  WHERE prl.receipt_id = r.id;

  IF inventory_total > 0 THEN
    lines := lines || jsonb_build_array(public.accounting_line(stock_account, 'Inventario recibido ' || r.doc_number, inventory_total, 0, r.supplier_id));
  END IF;
  IF expense_total > 0 THEN
    lines := lines || jsonb_build_array(public.accounting_line(expense_account, 'Servicio/consumo recibido ' || r.doc_number, expense_total, 0, r.supplier_id));
  END IF;
  IF r.total > 0 THEN
    lines := lines || jsonb_build_array(public.accounting_line(ap_account, 'CxP recepcion ' || r.doc_number, 0, r.total, r.supplier_id));
  END IF;

  RETURN public.create_system_journal_entry(
    r.company_id, r.receipt_date, 'COMPRA', r.doc_number,
    'Contabilizacion automatica recepcion ' || r.doc_number,
    'purchase_receipt', r.id, lines
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.post_accounting_for_treasury_transaction(_txn_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t public.treasury_transactions%ROWTYPE;
  app RECORD;
  lines jsonb := '[]'::jsonb;
  app_total numeric(18,2) := 0;
  bank_account uuid;
  bank_to_account uuid;
  ar_account uuid;
  ap_account uuid;
  expense_account uuid;
  income_account uuid;
BEGIN
  SELECT * INTO t FROM public.treasury_transactions WHERE id = _txn_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Movimiento de tesoreria no encontrado para contabilizar'; END IF;
  PERFORM public.assert_any_permission(t.company_id, ARRAY['treasury.operate', 'accounting.operate']);
  IF t.status <> 'confirmado' THEN RAISE EXCEPTION 'El movimiento de tesoreria debe estar confirmado'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.journal_entries
    WHERE company_id = t.company_id AND source_type = 'treasury' AND source_id = t.id AND status <> 'anulado'
  ) THEN
    SELECT id INTO bank_account FROM public.journal_entries
    WHERE company_id = t.company_id AND source_type = 'treasury' AND source_id = t.id AND status <> 'anulado'
    ORDER BY created_at DESC LIMIT 1;
    RETURN bank_account;
  END IF;

  bank_account := public.resolve_accounting_account(t.company_id, CASE WHEN t.payment_method = 'efectivo' THEN 'cash.efectivo' ELSE 'bank.default' END, CASE WHEN t.payment_method = 'efectivo' THEN '1105' ELSE '1110' END);
  bank_to_account := public.resolve_accounting_account(t.company_id, 'bank.default', '1110');
  ar_account := public.resolve_accounting_account(t.company_id, 'ar.customers', '1305');
  ap_account := public.resolve_accounting_account(t.company_id, 'ap.suppliers', '2205');
  expense_account := public.resolve_accounting_account(t.company_id, 'expense.default', '5195');
  income_account := public.resolve_accounting_account(t.company_id, 'sales.revenue', '4135');

  IF t.txn_type = 'cobro' THEN
    lines := lines || jsonb_build_array(public.accounting_line(bank_account, 'Ingreso tesoreria ' || t.doc_number, t.amount, 0, t.third_party_id));
    FOR app IN SELECT * FROM public.payment_applications WHERE treasury_txn_id = t.id LOOP
      IF app.ar_id IS NOT NULL THEN
        lines := lines || jsonb_build_array(public.accounting_line(ar_account, 'Abono CxC ' || t.doc_number, 0, app.amount, t.third_party_id));
        app_total := app_total + app.amount;
      END IF;
    END LOOP;
    IF t.amount > app_total THEN
      lines := lines || jsonb_build_array(public.accounting_line(income_account, 'Ingreso no aplicado ' || t.doc_number, 0, t.amount - app_total, t.third_party_id));
    END IF;
  ELSIF t.txn_type = 'pago' THEN
    FOR app IN SELECT * FROM public.payment_applications WHERE treasury_txn_id = t.id LOOP
      IF app.ap_id IS NOT NULL THEN
        lines := lines || jsonb_build_array(public.accounting_line(ap_account, 'Abono CxP ' || t.doc_number, app.amount, 0, t.third_party_id));
        app_total := app_total + app.amount;
      END IF;
    END LOOP;
    IF t.amount > app_total THEN
      lines := lines || jsonb_build_array(public.accounting_line(expense_account, 'Pago no aplicado ' || t.doc_number, t.amount - app_total, 0, t.third_party_id));
    END IF;
    lines := lines || jsonb_build_array(public.accounting_line(bank_account, 'Salida tesoreria ' || t.doc_number, 0, t.amount, t.third_party_id));
  ELSIF t.txn_type = 'transferencia' THEN
    lines := lines || jsonb_build_array(public.accounting_line(bank_to_account, 'Cuenta destino ' || t.doc_number, t.amount, 0, t.third_party_id));
    lines := lines || jsonb_build_array(public.accounting_line(bank_account, 'Cuenta origen ' || t.doc_number, 0, t.amount, t.third_party_id));
  ELSIF t.txn_type = 'ajuste_positivo' THEN
    lines := lines || jsonb_build_array(public.accounting_line(bank_account, 'Ajuste positivo tesoreria ' || t.doc_number, t.amount, 0, t.third_party_id));
    lines := lines || jsonb_build_array(public.accounting_line(income_account, 'Contrapartida ajuste positivo ' || t.doc_number, 0, t.amount, t.third_party_id));
  ELSIF t.txn_type = 'ajuste_negativo' THEN
    lines := lines || jsonb_build_array(public.accounting_line(expense_account, 'Ajuste negativo tesoreria ' || t.doc_number, t.amount, 0, t.third_party_id));
    lines := lines || jsonb_build_array(public.accounting_line(bank_account, 'Contrapartida ajuste negativo ' || t.doc_number, 0, t.amount, t.third_party_id));
  END IF;

  RETURN public.create_system_journal_entry(
    t.company_id, t.txn_date, CASE WHEN t.txn_type IN ('cobro','ajuste_positivo') THEN 'INGRESO' ELSE 'EGRESO' END,
    t.doc_number, 'Contabilizacion automatica tesoreria ' || t.doc_number,
    'treasury', t.id, lines
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.post_accounting_for_inventory_movement(_movement_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  m public.inventory_movements%ROWTYPE;
  total_cost numeric(18,2);
  lines jsonb := '[]'::jsonb;
  stock_account uuid;
  expense_account uuid;
  income_account uuid;
BEGIN
  SELECT * INTO m FROM public.inventory_movements WHERE id = _movement_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Movimiento de inventario no encontrado para contabilizar'; END IF;
  PERFORM public.assert_any_permission(m.company_id, ARRAY['inventory.operate', 'sales.operate', 'pos.operate', 'purchases.operate', 'accounting.operate']);
  IF m.status <> 'confirmado' THEN RAISE EXCEPTION 'El movimiento de inventario debe estar confirmado'; END IF;

  IF COALESCE(m.source_module, '') = 'purchases' OR COALESCE(m.reference, '') LIKE 'REC %' OR COALESCE(m.reference, '') LIKE 'VT %' THEN
    RETURN NULL;
  END IF;

  IF m.movement_type = 'traslado' THEN
    RETURN NULL;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.journal_entries
    WHERE company_id = m.company_id AND source_type = 'inventory' AND source_id = m.id AND status <> 'anulado'
  ) THEN
    SELECT id INTO stock_account FROM public.journal_entries
    WHERE company_id = m.company_id AND source_type = 'inventory' AND source_id = m.id AND status <> 'anulado'
    ORDER BY created_at DESC LIMIT 1;
    RETURN stock_account;
  END IF;

  SELECT COALESCE(SUM(total_cost), 0)::numeric(18,2) INTO total_cost
  FROM public.kardex
  WHERE movement_id = m.id;

  IF total_cost <= 0 THEN
    RETURN NULL;
  END IF;

  stock_account := public.resolve_accounting_account(m.company_id, 'inventory.stock', '1435');
  expense_account := public.resolve_accounting_account(m.company_id, 'expense.default', '5195');
  income_account := public.resolve_accounting_account(m.company_id, 'sales.revenue', '4135');

  IF m.movement_type IN ('entrada', 'ajuste_positivo') THEN
    lines := lines || jsonb_build_array(public.accounting_line(stock_account, 'Entrada inventario ' || m.doc_number, total_cost, 0, m.third_party_id));
    lines := lines || jsonb_build_array(public.accounting_line(income_account, 'Contrapartida entrada inventario ' || m.doc_number, 0, total_cost, m.third_party_id));
  ELSE
    lines := lines || jsonb_build_array(public.accounting_line(expense_account, 'Salida/ajuste inventario ' || m.doc_number, total_cost, 0, m.third_party_id));
    lines := lines || jsonb_build_array(public.accounting_line(stock_account, 'Contrapartida salida inventario ' || m.doc_number, 0, total_cost, m.third_party_id));
  END IF;

  RETURN public.create_system_journal_entry(
    m.company_id, m.movement_date, 'AJUSTE', m.doc_number,
    'Contabilizacion automatica inventario ' || m.doc_number,
    'inventory', m.id, lines
  );
END;
$$;

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
  accounting_id uuid;
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
          third_party_id, movement_date, reference, notes, source_module, source_id, status, created_by
        ) VALUES (
          s.company_id, mov_doc, 'salida', s.warehouse_id,
          s.customer_id, s.order_date,
          'VT ' || s.doc_number, 'Venta ' || s.doc_number, 'sales', s.id,
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
  ELSE
    accounting_id := public.post_accounting_for_sale(s.id);
  END IF;

  RETURN COALESCE(accounting_id, ar_id, mov_id, s.id);
END;
$$;

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
    SELECT * FROM public.validate_pos_stock(ps.company_id, ps.warehouse_id, _items)
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

  PERFORM public.post_accounting_for_sale(so_id);

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
  v_lot_id uuid;
  accounting_id uuid;
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

  FOR ln IN
    SELECT prl.*, p.tracks_inventory
    FROM public.purchase_receipt_lines prl
    JOIN public.products p ON p.id = prl.product_id
    WHERE prl.receipt_id = _receipt_id
  LOOP
    IF ln.tracks_inventory IS TRUE THEN
      IF mov_id IS NULL THEN
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

  accounting_id := public.post_accounting_for_purchase_receipt(_receipt_id);

  RETURN COALESCE(accounting_id, ap_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.confirm_treasury_transaction(_txn_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t public.treasury_transactions%ROWTYPE;
  app RECORD;
  apps_total numeric(18,2);
BEGIN
  SELECT * INTO t FROM public.treasury_transactions WHERE id = _txn_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Movimiento no encontrado'; END IF;

  PERFORM public.assert_has_permission(t.company_id, 'treasury.operate');

  IF t.status <> 'borrador' THEN RAISE EXCEPTION 'Solo se confirman movimientos en borrador'; END IF;

  IF t.txn_type = 'transferencia' AND t.bank_account_to_id IS NULL THEN
    RAISE EXCEPTION 'Transferencia requiere cuenta destino';
  END IF;
  IF t.txn_type = 'transferencia' AND t.bank_account_to_id = t.bank_account_id THEN
    RAISE EXCEPTION 'La cuenta origen y destino deben ser distintas';
  END IF;

  IF t.txn_type IN ('cobro','pago') THEN
    SELECT COALESCE(SUM(amount), 0) INTO apps_total
      FROM public.payment_applications WHERE treasury_txn_id = _txn_id;
    IF apps_total > t.amount THEN
      RAISE EXCEPTION 'Aplicaciones (%) exceden el monto (%)', apps_total, t.amount;
    END IF;
  END IF;

  IF t.txn_type IN ('cobro','ajuste_positivo') THEN
    UPDATE public.bank_accounts SET current_balance = current_balance + t.amount
      WHERE id = t.bank_account_id;
  ELSIF t.txn_type IN ('pago','ajuste_negativo') THEN
    UPDATE public.bank_accounts SET current_balance = current_balance - t.amount
      WHERE id = t.bank_account_id;
  ELSIF t.txn_type = 'transferencia' THEN
    UPDATE public.bank_accounts SET current_balance = current_balance - t.amount
      WHERE id = t.bank_account_id;
    UPDATE public.bank_accounts SET current_balance = current_balance + t.amount
      WHERE id = t.bank_account_to_id;
  END IF;

  UPDATE public.treasury_transactions
    SET status = 'confirmado', confirmed_at = now(), confirmed_by = auth.uid()
    WHERE id = _txn_id;

  FOR app IN SELECT * FROM public.payment_applications WHERE treasury_txn_id = _txn_id LOOP
    IF app.ar_id IS NOT NULL THEN PERFORM public.recalc_ar_status(app.ar_id); END IF;
    IF app.ap_id IS NOT NULL THEN PERFORM public.recalc_ap_status(app.ap_id); END IF;
  END LOOP;

  PERFORM public.post_accounting_for_treasury_transaction(_txn_id);
END;
$$;

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

  PERFORM public.post_accounting_for_inventory_movement(_movement_id);
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_accounting_automation_defaults(uuid) FROM public;
REVOKE ALL ON FUNCTION public.resolve_accounting_account(uuid, text, text) FROM public;
REVOKE ALL ON FUNCTION public.accounting_line(uuid, text, numeric, numeric, uuid, uuid) FROM public;
REVOKE ALL ON FUNCTION public.ensure_accounting_period_system(uuid, date) FROM public;
REVOKE ALL ON FUNCTION public.assert_accounting_period_open_system(uuid, date) FROM public;
REVOKE ALL ON FUNCTION public.create_system_journal_entry(uuid, date, text, text, text, text, uuid, jsonb) FROM public;
REVOKE ALL ON FUNCTION public.post_accounting_for_sale(uuid) FROM public;
REVOKE ALL ON FUNCTION public.post_accounting_for_purchase_receipt(uuid) FROM public;
REVOKE ALL ON FUNCTION public.post_accounting_for_treasury_transaction(uuid) FROM public;
REVOKE ALL ON FUNCTION public.post_accounting_for_inventory_movement(uuid) FROM public;

GRANT EXECUTE ON FUNCTION public.ensure_accounting_automation_defaults(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_accounting_for_sale(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_accounting_for_purchase_receipt(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_accounting_for_treasury_transaction(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_accounting_for_inventory_movement(uuid) TO authenticated;
