
-- =========================================================
-- FASE 6: GASTOS + CONTABILIDAD + NÓMINA
-- =========================================================

-- ---------- ENUMS ----------
DO $$ BEGIN CREATE TYPE public.account_type AS ENUM ('activo','pasivo','patrimonio','ingreso','gasto','costo'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.journal_status AS ENUM ('borrador','confirmado','anulado'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.expense_status AS ENUM ('borrador','confirmado','pagado','anulado'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.payroll_status AS ENUM ('borrador','liquidada','pagada','anulada'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.employee_status AS ENUM ('activo','inactivo','retirado'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------- CHART OF ACCOUNTS ----------
CREATE TABLE public.chart_of_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  account_type public.account_type NOT NULL,
  parent_id uuid REFERENCES public.chart_of_accounts(id) ON DELETE SET NULL,
  is_postable boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, code)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chart_of_accounts TO authenticated;
GRANT ALL ON public.chart_of_accounts TO service_role;
ALTER TABLE public.chart_of_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "coa_company_members" ON public.chart_of_accounts FOR ALL TO authenticated
  USING (public.is_company_member(auth.uid(), company_id))
  WITH CHECK (public.is_company_member(auth.uid(), company_id));
CREATE TRIGGER trg_coa_updated BEFORE UPDATE ON public.chart_of_accounts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------- JOURNAL ENTRIES ----------
CREATE TABLE public.journal_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  doc_number text NOT NULL,
  entry_date date NOT NULL DEFAULT CURRENT_DATE,
  reference text,
  description text,
  source_type text,        -- 'gasto','compra','venta','tesoreria','nomina','manual'
  source_id uuid,
  total_debit numeric(18,2) NOT NULL DEFAULT 0,
  total_credit numeric(18,2) NOT NULL DEFAULT 0,
  status public.journal_status NOT NULL DEFAULT 'borrador',
  created_by uuid REFERENCES auth.users(id),
  confirmed_at timestamptz,
  confirmed_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, doc_number)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.journal_entries TO authenticated;
GRANT ALL ON public.journal_entries TO service_role;
ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "je_company_members" ON public.journal_entries FOR ALL TO authenticated
  USING (public.is_company_member(auth.uid(), company_id))
  WITH CHECK (public.is_company_member(auth.uid(), company_id));
CREATE TRIGGER trg_je_updated BEFORE UPDATE ON public.journal_entries FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.journal_entry_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_entry_id uuid NOT NULL REFERENCES public.journal_entries(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.chart_of_accounts(id),
  third_party_id uuid REFERENCES public.third_parties(id),
  description text,
  debit numeric(18,2) NOT NULL DEFAULT 0,
  credit numeric(18,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.journal_entry_lines TO authenticated;
GRANT ALL ON public.journal_entry_lines TO service_role;
ALTER TABLE public.journal_entry_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "jel_via_entry" ON public.journal_entry_lines FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.journal_entries je WHERE je.id = journal_entry_id AND public.is_company_member(auth.uid(), je.company_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.journal_entries je WHERE je.id = journal_entry_id AND public.is_company_member(auth.uid(), je.company_id)));

-- ---------- EXPENSES ----------
CREATE TABLE public.expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  doc_number text NOT NULL,
  supplier_id uuid REFERENCES public.third_parties(id),
  expense_account_id uuid REFERENCES public.chart_of_accounts(id),
  category text,
  expense_date date NOT NULL DEFAULT CURRENT_DATE,
  due_date date,
  supplier_invoice text,
  description text,
  currency text NOT NULL DEFAULT 'COP',
  subtotal numeric(18,2) NOT NULL DEFAULT 0,
  tax_amount numeric(18,2) NOT NULL DEFAULT 0,
  total numeric(18,2) NOT NULL DEFAULT 0,
  payment_method text NOT NULL DEFAULT 'credito', -- credito, efectivo, tarjeta, transferencia
  bank_account_id uuid REFERENCES public.bank_accounts(id),
  status public.expense_status NOT NULL DEFAULT 'borrador',
  ap_id uuid REFERENCES public.accounts_payable(id),
  treasury_txn_id uuid REFERENCES public.treasury_transactions(id),
  journal_entry_id uuid REFERENCES public.journal_entries(id),
  created_by uuid REFERENCES auth.users(id),
  confirmed_at timestamptz,
  confirmed_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, doc_number)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expenses TO authenticated;
GRANT ALL ON public.expenses TO service_role;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "expenses_company_members" ON public.expenses FOR ALL TO authenticated
  USING (public.is_company_member(auth.uid(), company_id))
  WITH CHECK (public.is_company_member(auth.uid(), company_id));
CREATE TRIGGER trg_expenses_updated BEFORE UPDATE ON public.expenses FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------- PAYROLL ----------
CREATE TABLE public.employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  code text NOT NULL,
  document_number text,
  full_name text NOT NULL,
  email text,
  phone text,
  position text,
  department text,
  hire_date date,
  termination_date date,
  base_salary numeric(18,2) NOT NULL DEFAULT 0,
  payment_method text DEFAULT 'transferencia',
  bank_account text,
  status public.employee_status NOT NULL DEFAULT 'activo',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, code)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employees TO authenticated;
GRANT ALL ON public.employees TO service_role;
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
CREATE POLICY "employees_company_members" ON public.employees FOR ALL TO authenticated
  USING (public.is_company_member(auth.uid(), company_id))
  WITH CHECK (public.is_company_member(auth.uid(), company_id));
CREATE TRIGGER trg_employees_updated BEFORE UPDATE ON public.employees FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.payroll_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  doc_number text NOT NULL,
  name text NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  pay_date date,
  frequency text NOT NULL DEFAULT 'mensual', -- mensual, quincenal, semanal
  total_gross numeric(18,2) NOT NULL DEFAULT 0,
  total_deductions numeric(18,2) NOT NULL DEFAULT 0,
  total_net numeric(18,2) NOT NULL DEFAULT 0,
  status public.payroll_status NOT NULL DEFAULT 'borrador',
  journal_entry_id uuid REFERENCES public.journal_entries(id),
  notes text,
  created_by uuid REFERENCES auth.users(id),
  liquidated_at timestamptz,
  liquidated_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, doc_number)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payroll_periods TO authenticated;
GRANT ALL ON public.payroll_periods TO service_role;
ALTER TABLE public.payroll_periods ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pp_company_members" ON public.payroll_periods FOR ALL TO authenticated
  USING (public.is_company_member(auth.uid(), company_id))
  WITH CHECK (public.is_company_member(auth.uid(), company_id));
CREATE TRIGGER trg_pp_updated BEFORE UPDATE ON public.payroll_periods FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.payroll_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_period_id uuid NOT NULL REFERENCES public.payroll_periods(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id),
  base_salary numeric(18,2) NOT NULL DEFAULT 0,
  worked_days numeric(6,2) NOT NULL DEFAULT 30,
  gross_amount numeric(18,2) NOT NULL DEFAULT 0,
  bonuses numeric(18,2) NOT NULL DEFAULT 0,
  overtime numeric(18,2) NOT NULL DEFAULT 0,
  health_deduction numeric(18,2) NOT NULL DEFAULT 0,
  pension_deduction numeric(18,2) NOT NULL DEFAULT 0,
  other_deductions numeric(18,2) NOT NULL DEFAULT 0,
  net_amount numeric(18,2) NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (payroll_period_id, employee_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payroll_items TO authenticated;
GRANT ALL ON public.payroll_items TO service_role;
ALTER TABLE public.payroll_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pi_via_period" ON public.payroll_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.payroll_periods p WHERE p.id = payroll_period_id AND public.is_company_member(auth.uid(), p.company_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.payroll_periods p WHERE p.id = payroll_period_id AND public.is_company_member(auth.uid(), p.company_id)));

-- ---------- SEQUENCES / NUMBERING ----------
CREATE OR REPLACE FUNCTION public.next_accounting_number(_company_id uuid, _kind text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE prefix text; n int;
BEGIN
  prefix := CASE _kind
    WHEN 'expense' THEN 'GA'
    WHEN 'journal' THEN 'AS'
    WHEN 'payroll' THEN 'NM'
    ELSE 'DOC' END;
  IF _kind = 'expense' THEN
    SELECT COALESCE(MAX(NULLIF(regexp_replace(doc_number,'^GA-',''),'')::int),0)+1 INTO n
      FROM public.expenses WHERE company_id=_company_id AND doc_number ~ '^GA-[0-9]+$';
  ELSIF _kind = 'journal' THEN
    SELECT COALESCE(MAX(NULLIF(regexp_replace(doc_number,'^AS-',''),'')::int),0)+1 INTO n
      FROM public.journal_entries WHERE company_id=_company_id AND doc_number ~ '^AS-[0-9]+$';
  ELSIF _kind = 'payroll' THEN
    SELECT COALESCE(MAX(NULLIF(regexp_replace(doc_number,'^NM-',''),'')::int),0)+1 INTO n
      FROM public.payroll_periods WHERE company_id=_company_id AND doc_number ~ '^NM-[0-9]+$';
  ELSE n := 1; END IF;
  RETURN prefix || '-' || lpad(n::text,6,'0');
END; $$;

-- ---------- CONFIRM JOURNAL ENTRY ----------
CREATE OR REPLACE FUNCTION public.confirm_journal_entry(_je_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE j public.journal_entries%ROWTYPE; td numeric(18,2); tc numeric(18,2);
BEGIN
  SELECT * INTO j FROM public.journal_entries WHERE id=_je_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Asiento no encontrado'; END IF;
  IF NOT public.is_company_member(auth.uid(), j.company_id) THEN RAISE EXCEPTION 'Sin permisos'; END IF;
  IF j.status <> 'borrador' THEN RAISE EXCEPTION 'Solo se confirman asientos en borrador'; END IF;
  SELECT COALESCE(SUM(debit),0), COALESCE(SUM(credit),0) INTO td, tc
    FROM public.journal_entry_lines WHERE journal_entry_id=_je_id;
  IF td = 0 AND tc = 0 THEN RAISE EXCEPTION 'El asiento no tiene movimientos'; END IF;
  IF round(td,2) <> round(tc,2) THEN RAISE EXCEPTION 'Asiento descuadrado: débito % vs crédito %', td, tc; END IF;
  UPDATE public.journal_entries SET total_debit=td, total_credit=tc,
    status='confirmado', confirmed_at=now(), confirmed_by=auth.uid() WHERE id=_je_id;
END; $$;

-- ---------- CONFIRM EXPENSE ----------
CREATE OR REPLACE FUNCTION public.confirm_expense(_expense_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  e public.expenses%ROWTYPE;
  ap_id uuid := NULL;
  ap_doc text;
  tx_id uuid := NULL;
  tx_doc text;
  je_id uuid;
  je_doc text;
  gasto_acc uuid;
  cxp_acc uuid;
  banco_acc uuid;
  iva_acc uuid;
BEGIN
  SELECT * INTO e FROM public.expenses WHERE id=_expense_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Gasto no encontrado'; END IF;
  IF NOT public.is_company_member(auth.uid(), e.company_id) THEN RAISE EXCEPTION 'Sin permisos'; END IF;
  IF e.status <> 'borrador' THEN RAISE EXCEPTION 'Solo se confirman gastos en borrador'; END IF;
  IF e.total <= 0 THEN RAISE EXCEPTION 'El total del gasto debe ser mayor a cero'; END IF;

  -- Resolve accounts (best-effort by code, ignore if not present)
  gasto_acc := e.expense_account_id;
  IF gasto_acc IS NULL THEN
    SELECT id INTO gasto_acc FROM public.chart_of_accounts
      WHERE company_id=e.company_id AND code='5' ORDER BY code LIMIT 1;
  END IF;
  SELECT id INTO cxp_acc FROM public.chart_of_accounts WHERE company_id=e.company_id AND code='2205' LIMIT 1;
  SELECT id INTO iva_acc FROM public.chart_of_accounts WHERE company_id=e.company_id AND code='2408' LIMIT 1;

  -- Credit path -> create AP
  IF e.payment_method = 'credito' THEN
    ap_doc := public.next_purchase_number(e.company_id, 'payable');
    INSERT INTO public.accounts_payable(company_id, doc_number, supplier_id,
      supplier_invoice, invoice_date, due_date, currency,
      total_amount, paid_amount, balance, status, created_by)
    VALUES (e.company_id, ap_doc, e.supplier_id,
      e.supplier_invoice, e.expense_date, COALESCE(e.due_date, e.expense_date), e.currency,
      e.total, 0, e.total, 'pendiente', auth.uid())
    RETURNING id INTO ap_id;
  ELSE
    -- Direct payment via treasury
    IF e.bank_account_id IS NULL THEN
      RAISE EXCEPTION 'Se requiere cuenta bancaria para pagos directos';
    END IF;
    tx_doc := public.next_treasury_number(e.company_id, 'pago');
    INSERT INTO public.treasury_transactions(company_id, doc_number, txn_type,
      bank_account_id, third_party_id, txn_date, amount, currency,
      reference, notes, status, created_by, confirmed_at, confirmed_by)
    VALUES (e.company_id, tx_doc, 'pago',
      e.bank_account_id, e.supplier_id, e.expense_date, e.total, e.currency,
      'Gasto ' || e.doc_number, e.description, 'confirmado', auth.uid(), now(), auth.uid())
    RETURNING id INTO tx_id;
    -- Update bank balance
    UPDATE public.bank_accounts SET current_balance = current_balance - e.total
      WHERE id = e.bank_account_id;
    -- Resolve bank account contable code if any
    SELECT id INTO banco_acc FROM public.chart_of_accounts
      WHERE company_id=e.company_id AND code='1110' LIMIT 1;
  END IF;

  -- Create journal entry (best-effort — only if we have gasto account)
  IF gasto_acc IS NOT NULL THEN
    je_doc := public.next_accounting_number(e.company_id, 'journal');
    INSERT INTO public.journal_entries(company_id, doc_number, entry_date,
      reference, description, source_type, source_id, status, created_by)
    VALUES (e.company_id, je_doc, e.expense_date,
      'GA ' || e.doc_number, COALESCE(e.description, 'Gasto ' || e.doc_number),
      'gasto', e.id, 'borrador', auth.uid())
    RETURNING id INTO je_id;

    -- Debit: gasto (subtotal) + IVA descontable
    INSERT INTO public.journal_entry_lines(journal_entry_id, account_id, third_party_id, description, debit, credit)
      VALUES (je_id, gasto_acc, e.supplier_id, e.category, e.subtotal, 0);
    IF e.tax_amount > 0 AND iva_acc IS NOT NULL THEN
      INSERT INTO public.journal_entry_lines(journal_entry_id, account_id, third_party_id, description, debit, credit)
        VALUES (je_id, iva_acc, e.supplier_id, 'IVA', e.tax_amount, 0);
    ELSIF e.tax_amount > 0 THEN
      UPDATE public.journal_entry_lines SET debit = debit + e.tax_amount
        WHERE journal_entry_id = je_id AND account_id = gasto_acc;
    END IF;

    -- Credit: CxP o Banco
    IF e.payment_method = 'credito' AND cxp_acc IS NOT NULL THEN
      INSERT INTO public.journal_entry_lines(journal_entry_id, account_id, third_party_id, description, debit, credit)
        VALUES (je_id, cxp_acc, e.supplier_id, 'CxP', 0, e.total);
      PERFORM public.confirm_journal_entry(je_id);
    ELSIF e.payment_method <> 'credito' AND banco_acc IS NOT NULL THEN
      INSERT INTO public.journal_entry_lines(journal_entry_id, account_id, third_party_id, description, debit, credit)
        VALUES (je_id, banco_acc, e.supplier_id, 'Banco', 0, e.total);
      PERFORM public.confirm_journal_entry(je_id);
    END IF;
  END IF;

  UPDATE public.expenses SET
    status = CASE WHEN e.payment_method='credito' THEN 'confirmado'::expense_status ELSE 'pagado'::expense_status END,
    ap_id = ap_id,
    treasury_txn_id = tx_id,
    journal_entry_id = je_id,
    confirmed_at = now(),
    confirmed_by = auth.uid()
  WHERE id = _expense_id;

  RETURN _expense_id;
END; $$;

-- ---------- LIQUIDATE PAYROLL ----------
CREATE OR REPLACE FUNCTION public.liquidate_payroll_period(_period_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  p public.payroll_periods%ROWTYPE;
  g numeric(18,2) := 0;
  d numeric(18,2) := 0;
  n numeric(18,2) := 0;
BEGIN
  SELECT * INTO p FROM public.payroll_periods WHERE id=_period_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Periodo no encontrado'; END IF;
  IF NOT public.is_company_member(auth.uid(), p.company_id) THEN RAISE EXCEPTION 'Sin permisos'; END IF;
  IF p.status <> 'borrador' THEN RAISE EXCEPTION 'Solo se liquidan periodos en borrador'; END IF;

  -- Recalculate each item (gross = base * worked/30 + bonuses + overtime, net = gross - deductions)
  UPDATE public.payroll_items SET
    gross_amount = round((base_salary * worked_days / 30.0) + bonuses + overtime, 2),
    net_amount = round((base_salary * worked_days / 30.0) + bonuses + overtime
                       - (health_deduction + pension_deduction + other_deductions), 2)
  WHERE payroll_period_id = _period_id;

  SELECT
    COALESCE(SUM(gross_amount),0),
    COALESCE(SUM(health_deduction + pension_deduction + other_deductions),0),
    COALESCE(SUM(net_amount),0)
  INTO g, d, n
  FROM public.payroll_items WHERE payroll_period_id = _period_id;

  UPDATE public.payroll_periods SET
    total_gross = g, total_deductions = d, total_net = n,
    status = 'liquidada', liquidated_at = now(), liquidated_by = auth.uid()
  WHERE id = _period_id;
END; $$;

-- ---------- SEED BASIC CHART OF ACCOUNTS (helper) ----------
CREATE OR REPLACE FUNCTION public.seed_chart_of_accounts(_company_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_company_member(auth.uid(), _company_id) THEN RAISE EXCEPTION 'Sin permisos'; END IF;
  INSERT INTO public.chart_of_accounts (company_id, code, name, account_type, is_postable) VALUES
    (_company_id, '1',    'ACTIVO',                 'activo',    false),
    (_company_id, '11',   'Disponible',             'activo',    false),
    (_company_id, '1105', 'Caja',                   'activo',    true),
    (_company_id, '1110', 'Bancos',                 'activo',    true),
    (_company_id, '13',   'Deudores',               'activo',    false),
    (_company_id, '1305', 'Clientes',               'activo',    true),
    (_company_id, '14',   'Inventarios',            'activo',    false),
    (_company_id, '1435', 'Mercancías',             'activo',    true),
    (_company_id, '2',    'PASIVO',                 'pasivo',    false),
    (_company_id, '22',   'Proveedores',            'pasivo',    false),
    (_company_id, '2205', 'Proveedores nacionales', 'pasivo',    true),
    (_company_id, '24',   'Impuestos',              'pasivo',    false),
    (_company_id, '2408', 'IVA por pagar',          'pasivo',    true),
    (_company_id, '25',   'Obligaciones laborales', 'pasivo',    false),
    (_company_id, '2505', 'Salarios por pagar',     'pasivo',    true),
    (_company_id, '3',    'PATRIMONIO',             'patrimonio',false),
    (_company_id, '3105', 'Capital social',         'patrimonio',true),
    (_company_id, '4',    'INGRESOS',               'ingreso',   false),
    (_company_id, '4135', 'Ventas',                 'ingreso',   true),
    (_company_id, '5',    'GASTOS',                 'gasto',     false),
    (_company_id, '5105', 'Gastos de personal',     'gasto',     true),
    (_company_id, '5135', 'Servicios',              'gasto',     true),
    (_company_id, '5140', 'Arrendamientos',         'gasto',     true),
    (_company_id, '5195', 'Gastos diversos',        'gasto',     true),
    (_company_id, '6',    'COSTOS',                 'costo',     false),
    (_company_id, '6135', 'Costo de mercancías',    'costo',     true)
  ON CONFLICT (company_id, code) DO NOTHING;
END; $$;

-- Indexes
CREATE INDEX ON public.chart_of_accounts(company_id);
CREATE INDEX ON public.journal_entries(company_id, entry_date DESC);
CREATE INDEX ON public.journal_entry_lines(journal_entry_id);
CREATE INDEX ON public.journal_entry_lines(account_id);
CREATE INDEX ON public.expenses(company_id, expense_date DESC);
CREATE INDEX ON public.employees(company_id);
CREATE INDEX ON public.payroll_periods(company_id, period_start DESC);
CREATE INDEX ON public.payroll_items(payroll_period_id);
