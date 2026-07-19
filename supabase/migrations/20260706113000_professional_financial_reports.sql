-- Fase 6.3 - Reportes financieros profesionales

CREATE OR REPLACE FUNCTION public.report_financial_position(_company_id uuid, _to date)
RETURNS TABLE(section text, account_id uuid, code text, name text, account_type public.account_type, balance numeric, sort_order int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_has_permission(_company_id, 'accounting.view');

  RETURN QUERY
  WITH balances AS (
    SELECT
      a.id,
      a.code,
      a.name,
      a.account_type,
      CASE
        WHEN a.account_type = 'activo' THEN COALESCE(SUM(l.debit - l.credit) FILTER (WHERE j.id IS NOT NULL), 0)
        WHEN a.account_type IN ('pasivo','patrimonio') THEN COALESCE(SUM(l.credit - l.debit) FILTER (WHERE j.id IS NOT NULL), 0)
        ELSE 0
      END::numeric AS bal
    FROM public.chart_of_accounts a
    LEFT JOIN public.journal_entry_lines l ON l.account_id = a.id
    LEFT JOIN public.journal_entries j ON j.id = l.journal_entry_id
      AND j.company_id = _company_id
      AND j.status = 'confirmado'
      AND j.entry_date <= _to
    WHERE a.company_id = _company_id
      AND a.is_postable = true
      AND a.account_type IN ('activo','pasivo','patrimonio')
    GROUP BY a.id, a.code, a.name, a.account_type
  ),
  pnl AS (
    SELECT COALESCE(SUM(
      CASE
        WHEN a.account_type = 'ingreso' THEN l.credit - l.debit
        WHEN a.account_type IN ('gasto','costo') THEN -(l.debit - l.credit)
        ELSE 0
      END
    ), 0)::numeric AS net_income
    FROM public.journal_entry_lines l
    JOIN public.journal_entries j ON j.id = l.journal_entry_id
    JOIN public.chart_of_accounts a ON a.id = l.account_id
    WHERE j.company_id = _company_id
      AND j.status = 'confirmado'
      AND j.entry_date <= _to
      AND a.account_type IN ('ingreso','gasto','costo')
  )
  SELECT
    CASE b.account_type
      WHEN 'activo' THEN 'ACTIVO'
      WHEN 'pasivo' THEN 'PASIVO'
      ELSE 'PATRIMONIO'
    END::text,
    b.id,
    b.code::text,
    b.name::text,
    b.account_type,
    b.bal,
    CASE b.account_type WHEN 'activo' THEN 1 WHEN 'pasivo' THEN 2 ELSE 3 END
  FROM balances b
  WHERE b.bal <> 0
  UNION ALL
  SELECT
    'PATRIMONIO'::text,
    NULL::uuid,
    'UTILIDAD'::text,
    'Utilidad acumulada del ejercicio'::text,
    'patrimonio'::public.account_type,
    pnl.net_income,
    4
  FROM pnl
  WHERE pnl.net_income <> 0
  ORDER BY sort_order, code;
END;
$$;

CREATE OR REPLACE FUNCTION public.report_income_statement(_company_id uuid, _from date, _to date)
RETURNS TABLE(section text, account_id uuid, code text, name text, account_type public.account_type, amount numeric, sort_order int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_has_permission(_company_id, 'accounting.view');

  RETURN QUERY
  WITH rows AS (
    SELECT
      a.id,
      a.code,
      a.name,
      a.account_type,
      CASE
        WHEN a.account_type = 'ingreso' THEN COALESCE(SUM(l.credit - l.debit) FILTER (WHERE j.id IS NOT NULL), 0)
        WHEN a.account_type IN ('costo','gasto') THEN COALESCE(SUM(l.debit - l.credit) FILTER (WHERE j.id IS NOT NULL), 0)
        ELSE 0
      END::numeric AS amount
    FROM public.chart_of_accounts a
    LEFT JOIN public.journal_entry_lines l ON l.account_id = a.id
    LEFT JOIN public.journal_entries j ON j.id = l.journal_entry_id
      AND j.company_id = _company_id
      AND j.status = 'confirmado'
      AND j.entry_date BETWEEN _from AND _to
    WHERE a.company_id = _company_id
      AND a.is_postable = true
      AND a.account_type IN ('ingreso','costo','gasto')
    GROUP BY a.id, a.code, a.name, a.account_type
  ),
  totals AS (
    SELECT
      COALESCE(SUM(amount) FILTER (WHERE account_type = 'ingreso'), 0)::numeric AS income,
      COALESCE(SUM(amount) FILTER (WHERE account_type = 'costo'), 0)::numeric AS costs,
      COALESCE(SUM(amount) FILTER (WHERE account_type = 'gasto'), 0)::numeric AS expenses
    FROM rows
  )
  SELECT
    CASE r.account_type
      WHEN 'ingreso' THEN 'INGRESOS'
      WHEN 'costo' THEN 'COSTOS'
      ELSE 'GASTOS'
    END::text,
    r.id,
    r.code::text,
    r.name::text,
    r.account_type,
    r.amount,
    CASE r.account_type WHEN 'ingreso' THEN 1 WHEN 'costo' THEN 2 ELSE 4 END
  FROM rows r
  WHERE r.amount <> 0
  UNION ALL
  SELECT 'UTILIDAD BRUTA', NULL::uuid, 'UB', 'Utilidad bruta', 'ingreso'::public.account_type, income - costs, 3 FROM totals
  UNION ALL
  SELECT 'UTILIDAD OPERACIONAL', NULL::uuid, 'UO', 'Utilidad operacional', 'ingreso'::public.account_type, income - costs - expenses, 5 FROM totals
  ORDER BY sort_order, code;
END;
$$;

CREATE OR REPLACE FUNCTION public.report_journal_book(_company_id uuid, _from date, _to date, _source_type text DEFAULT NULL)
RETURNS TABLE(
  entry_id uuid,
  entry_date date,
  doc_number text,
  reference text,
  source_type text,
  status public.journal_status,
  account_code text,
  account_name text,
  line_description text,
  third_party_name text,
  debit numeric,
  credit numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_has_permission(_company_id, 'accounting.view');

  RETURN QUERY
  SELECT
    j.id,
    j.entry_date,
    j.doc_number::text,
    COALESCE(j.reference, j.description)::text,
    j.source_type::text,
    j.status,
    a.code::text,
    a.name::text,
    COALESCE(l.description, j.description)::text,
    tp.name::text,
    l.debit::numeric,
    l.credit::numeric
  FROM public.journal_entries j
  JOIN public.journal_entry_lines l ON l.journal_entry_id = j.id
  JOIN public.chart_of_accounts a ON a.id = l.account_id
  LEFT JOIN public.third_parties tp ON tp.id = l.third_party_id
  WHERE j.company_id = _company_id
    AND j.entry_date BETWEEN _from AND _to
    AND (_source_type IS NULL OR j.source_type = _source_type)
  ORDER BY j.entry_date, j.doc_number, a.code, l.created_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.report_account_ledger(_company_id uuid, _account_id uuid, _from date, _to date)
RETURNS TABLE(entry_date date, doc_number text, reference text, description text, debit numeric, credit numeric, running_balance numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  opening numeric(18,2);
BEGIN
  PERFORM public.assert_has_permission(_company_id, 'accounting.view');

  SELECT COALESCE(SUM(l.debit - l.credit), 0)::numeric INTO opening
  FROM public.journal_entry_lines l
  JOIN public.journal_entries j ON j.id = l.journal_entry_id
  WHERE j.company_id = _company_id
    AND j.status = 'confirmado'
    AND l.account_id = _account_id
    AND j.entry_date < _from;

  RETURN QUERY
  SELECT
    (_from - 1)::date,
    'SALDO'::text,
    'Saldo inicial'::text,
    'Saldo inicial'::text,
    CASE WHEN opening > 0 THEN opening ELSE 0 END,
    CASE WHEN opening < 0 THEN abs(opening) ELSE 0 END,
    opening
  UNION ALL
  SELECT
    x.entry_date,
    x.doc_number,
    x.reference,
    x.description,
    x.debit,
    x.credit,
    opening + SUM(x.debit - x.credit) OVER (ORDER BY x.entry_date, x.created_at, x.line_id)::numeric
  FROM (
    SELECT
      j.entry_date,
      j.doc_number::text,
      COALESCE(j.reference, j.description)::text AS reference,
      COALESCE(l.description, j.description)::text AS description,
      l.debit::numeric,
      l.credit::numeric,
      j.created_at,
      l.id AS line_id
    FROM public.journal_entry_lines l
    JOIN public.journal_entries j ON j.id = l.journal_entry_id
    WHERE j.company_id = _company_id
      AND j.status = 'confirmado'
      AND l.account_id = _account_id
      AND j.entry_date BETWEEN _from AND _to
  ) x
  ORDER BY entry_date, doc_number;
END;
$$;

CREATE OR REPLACE FUNCTION public.report_third_party_ledger(_company_id uuid, _third_party_id uuid DEFAULT NULL, _from date DEFAULT NULL, _to date DEFAULT NULL)
RETURNS TABLE(
  third_party_id uuid,
  third_party_name text,
  account_code text,
  account_name text,
  entry_date date,
  doc_number text,
  reference text,
  debit numeric,
  credit numeric,
  balance numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_has_permission(_company_id, 'accounting.view');

  RETURN QUERY
  SELECT
    l.third_party_id,
    COALESCE(tp.name, 'Sin tercero')::text,
    a.code::text,
    a.name::text,
    j.entry_date,
    j.doc_number::text,
    COALESCE(j.reference, l.description, j.description)::text,
    l.debit::numeric,
    l.credit::numeric,
    SUM(l.debit - l.credit) OVER (
      PARTITION BY l.third_party_id, l.account_id
      ORDER BY j.entry_date, j.created_at, l.id
    )::numeric
  FROM public.journal_entry_lines l
  JOIN public.journal_entries j ON j.id = l.journal_entry_id
  JOIN public.chart_of_accounts a ON a.id = l.account_id
  LEFT JOIN public.third_parties tp ON tp.id = l.third_party_id
  WHERE j.company_id = _company_id
    AND j.status = 'confirmado'
    AND l.third_party_id IS NOT NULL
    AND (_third_party_id IS NULL OR l.third_party_id = _third_party_id)
    AND (_from IS NULL OR j.entry_date >= _from)
    AND (_to IS NULL OR j.entry_date <= _to)
  ORDER BY third_party_name, account_code, j.entry_date, j.created_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.report_ar_ap_reconciliation(_company_id uuid, _to date)
RETURNS TABLE(module text, third_party_id uuid, third_party_name text, operational_balance numeric, accounting_balance numeric, difference numeric, status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_has_permission(_company_id, 'accounting.view');

  RETURN QUERY
  WITH ar_ops AS (
    SELECT customer_id AS third_party_id, SUM(balance)::numeric AS balance
    FROM public.accounts_receivable
    WHERE company_id = _company_id
      AND invoice_date <= _to
    GROUP BY customer_id
  ),
  ar_acc AS (
    SELECT l.third_party_id, SUM(l.debit - l.credit)::numeric AS balance
    FROM public.journal_entry_lines l
    JOIN public.journal_entries j ON j.id = l.journal_entry_id
    JOIN public.chart_of_accounts a ON a.id = l.account_id
    WHERE j.company_id = _company_id
      AND j.status = 'confirmado'
      AND j.entry_date <= _to
      AND a.code = '1305'
    GROUP BY l.third_party_id
  ),
  ap_ops AS (
    SELECT supplier_id AS third_party_id, SUM(balance)::numeric AS balance
    FROM public.accounts_payable
    WHERE company_id = _company_id
      AND invoice_date <= _to
    GROUP BY supplier_id
  ),
  ap_acc AS (
    SELECT l.third_party_id, SUM(l.credit - l.debit)::numeric AS balance
    FROM public.journal_entry_lines l
    JOIN public.journal_entries j ON j.id = l.journal_entry_id
    JOIN public.chart_of_accounts a ON a.id = l.account_id
    WHERE j.company_id = _company_id
      AND j.status = 'confirmado'
      AND j.entry_date <= _to
      AND a.code = '2205'
    GROUP BY l.third_party_id
  ),
  rows AS (
    SELECT 'CxC'::text AS module, COALESCE(o.third_party_id, a.third_party_id) AS third_party_id,
      COALESCE(o.balance, 0)::numeric AS operational_balance,
      COALESCE(a.balance, 0)::numeric AS accounting_balance
    FROM ar_ops o
    FULL JOIN ar_acc a ON a.third_party_id = o.third_party_id
    UNION ALL
    SELECT 'CxP'::text AS module, COALESCE(o.third_party_id, a.third_party_id) AS third_party_id,
      COALESCE(o.balance, 0)::numeric AS operational_balance,
      COALESCE(a.balance, 0)::numeric AS accounting_balance
    FROM ap_ops o
    FULL JOIN ap_acc a ON a.third_party_id = o.third_party_id
  )
  SELECT
    r.module,
    r.third_party_id,
    COALESCE(tp.name, 'Sin tercero')::text,
    r.operational_balance,
    r.accounting_balance,
    (r.operational_balance - r.accounting_balance)::numeric,
    CASE WHEN abs(r.operational_balance - r.accounting_balance) < 0.01 THEN 'conciliado' ELSE 'diferencia' END::text
  FROM rows r
  LEFT JOIN public.third_parties tp ON tp.id = r.third_party_id
  WHERE r.operational_balance <> 0 OR r.accounting_balance <> 0
  ORDER BY r.module, status DESC, third_party_name;
END;
$$;

REVOKE ALL ON FUNCTION public.report_financial_position(uuid, date) FROM public;
REVOKE ALL ON FUNCTION public.report_income_statement(uuid, date, date) FROM public;
REVOKE ALL ON FUNCTION public.report_journal_book(uuid, date, date, text) FROM public;
REVOKE ALL ON FUNCTION public.report_account_ledger(uuid, uuid, date, date) FROM public;
REVOKE ALL ON FUNCTION public.report_third_party_ledger(uuid, uuid, date, date) FROM public;
REVOKE ALL ON FUNCTION public.report_ar_ap_reconciliation(uuid, date) FROM public;

GRANT EXECUTE ON FUNCTION public.report_financial_position(uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.report_income_statement(uuid, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.report_journal_book(uuid, date, date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.report_account_ledger(uuid, uuid, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.report_third_party_ledger(uuid, uuid, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.report_ar_ap_reconciliation(uuid, date) TO authenticated;
