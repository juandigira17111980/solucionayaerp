-- ============================================================================
-- Fase 6.1: motor contable base.
-- Periodos, centros de costo, comprobantes, asientos controlados y reportes base.
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE public.accounting_period_status AS ENUM ('abierto', 'cerrado', 'bloqueado');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.accounting_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  period_code text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  status public.accounting_period_status NOT NULL DEFAULT 'abierto',
  closed_by uuid REFERENCES auth.users(id),
  closed_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, period_code),
  CHECK (start_date <= end_date)
);

CREATE TABLE IF NOT EXISTS public.cost_centers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  parent_id uuid REFERENCES public.cost_centers(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, code)
);

CREATE TABLE IF NOT EXISTS public.accounting_voucher_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  prefix text NOT NULL,
  affects_book boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, code),
  UNIQUE (company_id, prefix)
);

CREATE TABLE IF NOT EXISTS public.accounting_account_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  mapping_key text NOT NULL,
  account_id uuid NOT NULL REFERENCES public.chart_of_accounts(id) ON DELETE RESTRICT,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, mapping_key)
);

ALTER TABLE public.journal_entries
  ADD COLUMN IF NOT EXISTS period_id uuid REFERENCES public.accounting_periods(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS voucher_type_id uuid REFERENCES public.accounting_voucher_types(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cost_center_id uuid REFERENCES public.cost_centers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reversed_entry_id uuid REFERENCES public.journal_entries(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS locked_at timestamptz;

ALTER TABLE public.journal_entry_lines
  ADD COLUMN IF NOT EXISTS cost_center_id uuid REFERENCES public.cost_centers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_accounting_periods_company_dates ON public.accounting_periods(company_id, start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_cost_centers_company_code ON public.cost_centers(company_id, code);
CREATE INDEX IF NOT EXISTS idx_voucher_types_company_code ON public.accounting_voucher_types(company_id, code);
CREATE INDEX IF NOT EXISTS idx_journal_entries_period ON public.journal_entries(period_id, status);
CREATE INDEX IF NOT EXISTS idx_journal_entries_source ON public.journal_entries(company_id, source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_journal_lines_cost_center ON public.journal_entry_lines(cost_center_id);
CREATE INDEX IF NOT EXISTS idx_account_mappings_company_key ON public.accounting_account_mappings(company_id, mapping_key);

ALTER TABLE public.accounting_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cost_centers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounting_voucher_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounting_account_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "accounting_periods_granular" ON public.accounting_periods
  FOR ALL TO authenticated
  USING (public.has_permission(auth.uid(), company_id, 'accounting.view') OR public.has_permission(auth.uid(), company_id, 'accounting.operate'))
  WITH CHECK (public.has_permission(auth.uid(), company_id, 'accounting.operate'));

CREATE POLICY "cost_centers_granular" ON public.cost_centers
  FOR ALL TO authenticated
  USING (public.has_permission(auth.uid(), company_id, 'accounting.view') OR public.has_permission(auth.uid(), company_id, 'accounting.operate'))
  WITH CHECK (public.has_permission(auth.uid(), company_id, 'accounting.operate'));

CREATE POLICY "voucher_types_granular" ON public.accounting_voucher_types
  FOR ALL TO authenticated
  USING (public.has_permission(auth.uid(), company_id, 'accounting.view') OR public.has_permission(auth.uid(), company_id, 'accounting.operate'))
  WITH CHECK (public.has_permission(auth.uid(), company_id, 'accounting.operate'));

CREATE POLICY "account_mappings_granular" ON public.accounting_account_mappings
  FOR ALL TO authenticated
  USING (public.has_permission(auth.uid(), company_id, 'accounting.view') OR public.has_permission(auth.uid(), company_id, 'accounting.operate'))
  WITH CHECK (public.has_permission(auth.uid(), company_id, 'accounting.operate'));

CREATE OR REPLACE TRIGGER trg_accounting_periods_updated
  BEFORE UPDATE ON public.accounting_periods
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE TRIGGER trg_cost_centers_updated
  BEFORE UPDATE ON public.cost_centers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE TRIGGER trg_voucher_types_updated
  BEFORE UPDATE ON public.accounting_voucher_types
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE TRIGGER trg_account_mappings_updated
  BEFORE UPDATE ON public.accounting_account_mappings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.seed_accounting_foundation(_company_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  start_month date := date_trunc('month', CURRENT_DATE)::date;
BEGIN
  PERFORM public.assert_has_permission(_company_id, 'accounting.operate');

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

  INSERT INTO public.cost_centers(company_id, code, name)
  VALUES
    (_company_id, 'ADM', 'Administracion'),
    (_company_id, 'VEN', 'Ventas'),
    (_company_id, 'INV', 'Inventarios'),
    (_company_id, 'POS', 'Punto de venta')
  ON CONFLICT (company_id, code) DO NOTHING;

  INSERT INTO public.accounting_periods(company_id, period_code, start_date, end_date)
  VALUES (
    _company_id,
    to_char(start_month, 'YYYY-MM'),
    start_month,
    (start_month + interval '1 month - 1 day')::date
  )
  ON CONFLICT (company_id, period_code) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_accounting_period(_company_id uuid, _entry_date date)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p_id uuid;
  p_start date := date_trunc('month', _entry_date)::date;
BEGIN
  PERFORM public.assert_has_permission(_company_id, 'accounting.operate');

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

CREATE OR REPLACE FUNCTION public.assert_accounting_period_open(_company_id uuid, _entry_date date)
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
    RETURN public.ensure_accounting_period(_company_id, _entry_date);
  END IF;

  IF p.status <> 'abierto' THEN
    RAISE EXCEPTION 'Periodo contable % no esta abierto', p.period_code;
  END IF;

  RETURN p.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.next_accounting_number(_company_id uuid, _kind text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  prefix text;
  n int;
BEGIN
  prefix := CASE _kind
    WHEN 'expense' THEN 'GA'
    WHEN 'journal' THEN 'AS'
    WHEN 'payroll' THEN 'NM'
    WHEN 'sale' THEN 'VE'
    WHEN 'purchase' THEN 'CO'
    WHEN 'income' THEN 'CI'
    WHEN 'expense_voucher' THEN 'CE'
    WHEN 'adjustment' THEN 'AJ'
    ELSE 'DOC'
  END;

  SELECT COALESCE(MAX(NULLIF(regexp_replace(doc_number, '^' || prefix || '-', ''), '')::int), 0) + 1
  INTO n
  FROM public.journal_entries
  WHERE company_id = _company_id
    AND doc_number ~ ('^' || prefix || '-[0-9]+$');

  IF _kind = 'expense' THEN
    SELECT COALESCE(MAX(NULLIF(regexp_replace(doc_number,'^GA-',''),'')::int),0)+1 INTO n
    FROM public.expenses WHERE company_id = _company_id AND doc_number ~ '^GA-[0-9]+$';
  ELSIF _kind = 'payroll' THEN
    SELECT COALESCE(MAX(NULLIF(regexp_replace(doc_number,'^NM-',''),'')::int),0)+1 INTO n
    FROM public.payroll_periods WHERE company_id = _company_id AND doc_number ~ '^NM-[0-9]+$';
  END IF;

  RETURN prefix || '-' || lpad(n::text, 6, '0');
END;
$$;

CREATE OR REPLACE FUNCTION public.create_journal_entry(
  _company_id uuid,
  _entry_date date,
  _voucher_type_code text,
  _reference text,
  _description text,
  _source_type text,
  _source_id uuid,
  _lines jsonb,
  _confirm boolean DEFAULT false
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
  PERFORM public.assert_has_permission(_company_id, 'accounting.operate');
  p_id := public.assert_accounting_period_open(_company_id, COALESCE(_entry_date, CURRENT_DATE));

  SELECT * INTO vt
  FROM public.accounting_voucher_types
  WHERE company_id = _company_id
    AND code = COALESCE(NULLIF(_voucher_type_code, ''), 'DIARIO')
    AND is_active = true
  LIMIT 1;

  IF NOT FOUND THEN
    PERFORM public.seed_accounting_foundation(_company_id);
    SELECT * INTO vt
    FROM public.accounting_voucher_types
    WHERE company_id = _company_id
      AND code = COALESCE(NULLIF(_voucher_type_code, ''), 'DIARIO')
    LIMIT 1;
  END IF;

  IF _lines IS NULL OR jsonb_typeof(_lines) <> 'array' OR jsonb_array_length(_lines) < 2 THEN
    RAISE EXCEPTION 'El asiento requiere al menos dos lineas';
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
    reference, description, source_type, source_id, status, created_by
  ) VALUES (
    _company_id, doc, COALESCE(_entry_date, CURRENT_DATE), p_id, vt.id,
    _reference, _description, COALESCE(_source_type, 'manual'), _source_id,
    'borrador', auth.uid()
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
      RAISE EXCEPTION 'Linea contable invalida';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.chart_of_accounts coa
      WHERE coa.id = item.account_id
        AND coa.company_id = _company_id
        AND coa.is_active = true
        AND coa.is_postable = true
    ) THEN
      RAISE EXCEPTION 'Cuenta contable no valida o no imputable';
    END IF;

    IF item.cost_center_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.cost_centers cc
      WHERE cc.id = item.cost_center_id AND cc.company_id = _company_id AND cc.is_active = true
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

  UPDATE public.journal_entries
  SET total_debit = v_total_debit,
      total_credit = v_total_credit
  WHERE id = je_id;

  IF round(v_total_debit, 2) <> round(v_total_credit, 2) THEN
    RAISE EXCEPTION 'Asiento descuadrado: debito % vs credito %', v_total_debit, v_total_credit;
  END IF;

  IF _confirm THEN
    PERFORM public.confirm_journal_entry(je_id);
  END IF;

  RETURN je_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.confirm_journal_entry(_je_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  j public.journal_entries%ROWTYPE;
  td numeric(18,2);
  tc numeric(18,2);
  p_id uuid;
BEGIN
  SELECT * INTO j FROM public.journal_entries WHERE id = _je_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Asiento no encontrado'; END IF;

  PERFORM public.assert_has_permission(j.company_id, 'accounting.operate');

  IF j.status <> 'borrador' THEN
    RAISE EXCEPTION 'Solo se confirman asientos en borrador';
  END IF;

  p_id := public.assert_accounting_period_open(j.company_id, j.entry_date);

  IF EXISTS (
    SELECT 1
    FROM public.journal_entry_lines l
    JOIN public.chart_of_accounts a ON a.id = l.account_id
    WHERE l.journal_entry_id = _je_id
      AND (a.company_id <> j.company_id OR a.is_postable IS NOT TRUE OR a.is_active IS NOT TRUE)
  ) THEN
    RAISE EXCEPTION 'El asiento tiene cuentas no validas';
  END IF;

  SELECT COALESCE(SUM(debit),0), COALESCE(SUM(credit),0)
  INTO td, tc
  FROM public.journal_entry_lines
  WHERE journal_entry_id = _je_id;

  IF td = 0 AND tc = 0 THEN RAISE EXCEPTION 'El asiento no tiene movimientos'; END IF;
  IF round(td, 2) <> round(tc, 2) THEN RAISE EXCEPTION 'Asiento descuadrado: debito % vs credito %', td, tc; END IF;

  UPDATE public.journal_entries
  SET total_debit = td,
      total_credit = tc,
      period_id = COALESCE(period_id, p_id),
      status = 'confirmado',
      confirmed_at = now(),
      confirmed_by = auth.uid()
  WHERE id = _je_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.close_accounting_period(_period_id uuid, _notes text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p public.accounting_periods%ROWTYPE;
BEGIN
  SELECT * INTO p FROM public.accounting_periods WHERE id = _period_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Periodo no encontrado'; END IF;

  PERFORM public.assert_has_permission(p.company_id, 'accounting.operate');

  IF p.status <> 'abierto' THEN
    RAISE EXCEPTION 'El periodo no esta abierto';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.journal_entries
    WHERE company_id = p.company_id
      AND entry_date BETWEEN p.start_date AND p.end_date
      AND status = 'borrador'
  ) THEN
    RAISE EXCEPTION 'No se puede cerrar: existen asientos en borrador';
  END IF;

  UPDATE public.accounting_periods
  SET status = 'cerrado',
      closed_at = now(),
      closed_by = auth.uid(),
      notes = COALESCE(_notes, notes)
  WHERE id = _period_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.reopen_accounting_period(_period_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p public.accounting_periods%ROWTYPE;
BEGIN
  SELECT * INTO p FROM public.accounting_periods WHERE id = _period_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Periodo no encontrado'; END IF;

  PERFORM public.assert_has_permission(p.company_id, 'accounting.operate');

  IF p.status = 'bloqueado' THEN
    RAISE EXCEPTION 'El periodo esta bloqueado y no puede reabrirse';
  END IF;

  UPDATE public.accounting_periods
  SET status = 'abierto',
      closed_at = NULL,
      closed_by = NULL
  WHERE id = _period_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.report_trial_balance(_company_id uuid, _from date, _to date)
RETURNS TABLE(account_id uuid, code text, name text, account_type public.account_type, debit numeric, credit numeric, balance numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_has_permission(_company_id, 'accounting.view');

  RETURN QUERY
  SELECT
    a.id,
    a.code::text,
    a.name::text,
    a.account_type,
    COALESCE(SUM(l.debit) FILTER (WHERE j.id IS NOT NULL), 0)::numeric,
    COALESCE(SUM(l.credit) FILTER (WHERE j.id IS NOT NULL), 0)::numeric,
    CASE
      WHEN a.account_type IN ('activo','gasto','costo')
        THEN (COALESCE(SUM(l.debit) FILTER (WHERE j.id IS NOT NULL), 0) - COALESCE(SUM(l.credit) FILTER (WHERE j.id IS NOT NULL), 0))::numeric
      ELSE (COALESCE(SUM(l.credit) FILTER (WHERE j.id IS NOT NULL), 0) - COALESCE(SUM(l.debit) FILTER (WHERE j.id IS NOT NULL), 0))::numeric
    END
  FROM public.chart_of_accounts a
  LEFT JOIN public.journal_entry_lines l ON l.account_id = a.id
  LEFT JOIN public.journal_entries j ON j.id = l.journal_entry_id
    AND j.status = 'confirmado'
    AND j.entry_date BETWEEN _from AND _to
  WHERE a.company_id = _company_id
    AND a.is_postable = true
  GROUP BY a.id, a.code, a.name, a.account_type
  HAVING COALESCE(SUM(l.debit) FILTER (WHERE j.id IS NOT NULL), 0) <> 0
      OR COALESCE(SUM(l.credit) FILTER (WHERE j.id IS NOT NULL), 0) <> 0
  ORDER BY a.code;
END;
$$;

CREATE OR REPLACE FUNCTION public.report_general_ledger(_company_id uuid, _account_id uuid, _from date, _to date)
RETURNS TABLE(entry_date date, doc_number text, reference text, description text, debit numeric, credit numeric, running_balance numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_has_permission(_company_id, 'accounting.view');

  RETURN QUERY
  SELECT
    j.entry_date,
    j.doc_number::text,
    j.reference::text,
    COALESCE(l.description, j.description)::text,
    l.debit::numeric,
    l.credit::numeric,
    SUM(l.debit - l.credit) OVER (ORDER BY j.entry_date, j.created_at, l.id)::numeric
  FROM public.journal_entry_lines l
  JOIN public.journal_entries j ON j.id = l.journal_entry_id
  WHERE j.company_id = _company_id
    AND j.status = 'confirmado'
    AND l.account_id = _account_id
    AND j.entry_date BETWEEN _from AND _to
  ORDER BY j.entry_date, j.created_at, l.id;
END;
$$;

REVOKE ALL ON FUNCTION public.seed_accounting_foundation(uuid) FROM public;
REVOKE ALL ON FUNCTION public.next_accounting_number(uuid, text) FROM public;
REVOKE ALL ON FUNCTION public.ensure_accounting_period(uuid, date) FROM public;
REVOKE ALL ON FUNCTION public.assert_accounting_period_open(uuid, date) FROM public;
REVOKE ALL ON FUNCTION public.create_journal_entry(uuid, date, text, text, text, text, uuid, jsonb, boolean) FROM public;
REVOKE ALL ON FUNCTION public.confirm_journal_entry(uuid) FROM public;
REVOKE ALL ON FUNCTION public.close_accounting_period(uuid, text) FROM public;
REVOKE ALL ON FUNCTION public.reopen_accounting_period(uuid) FROM public;
REVOKE ALL ON FUNCTION public.report_trial_balance(uuid, date, date) FROM public;
REVOKE ALL ON FUNCTION public.report_general_ledger(uuid, uuid, date, date) FROM public;
GRANT EXECUTE ON FUNCTION public.seed_accounting_foundation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.next_accounting_number(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_accounting_period(uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assert_accounting_period_open(uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_journal_entry(uuid, date, text, text, text, text, uuid, jsonb, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_journal_entry(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.close_accounting_period(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reopen_accounting_period(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.report_trial_balance(uuid, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.report_general_ledger(uuid, uuid, date, date) TO authenticated;
