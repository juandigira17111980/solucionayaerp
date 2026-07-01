
-- ============================================================
-- FASE 5: TESORERÍA
-- ============================================================

CREATE TYPE public.bank_account_kind AS ENUM (
  'caja', 'banco', 'tarjeta', 'otro'
);

CREATE TYPE public.treasury_txn_type AS ENUM (
  'cobro', 'pago', 'transferencia', 'ajuste_positivo', 'ajuste_negativo'
);

CREATE TYPE public.treasury_txn_status AS ENUM (
  'borrador', 'confirmado', 'anulado'
);

-- ============================================================
-- BANK ACCOUNTS
-- ============================================================
CREATE TABLE public.bank_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  kind public.bank_account_kind NOT NULL DEFAULT 'banco',
  bank_name text,
  account_number text,
  currency text NOT NULL DEFAULT 'COP',
  opening_balance numeric(18,2) NOT NULL DEFAULT 0,
  current_balance numeric(18,2) NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bank_accounts TO authenticated;
GRANT ALL ON public.bank_accounts TO service_role;
ALTER TABLE public.bank_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ba_company_members" ON public.bank_accounts
  FOR ALL TO authenticated
  USING (public.is_company_member(auth.uid(), company_id))
  WITH CHECK (public.is_company_member(auth.uid(), company_id));

CREATE TRIGGER trg_ba_updated_at BEFORE UPDATE ON public.bank_accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_ba_company ON public.bank_accounts(company_id);

-- ============================================================
-- TREASURY TRANSACTIONS
-- ============================================================
CREATE TABLE public.treasury_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  doc_number text NOT NULL,
  txn_type public.treasury_txn_type NOT NULL,
  bank_account_id uuid NOT NULL REFERENCES public.bank_accounts(id) ON DELETE RESTRICT,
  bank_account_to_id uuid REFERENCES public.bank_accounts(id) ON DELETE RESTRICT,
  third_party_id uuid REFERENCES public.third_parties(id) ON DELETE RESTRICT,
  txn_date date NOT NULL DEFAULT CURRENT_DATE,
  payment_method public.payment_method NOT NULL DEFAULT 'efectivo',
  amount numeric(18,2) NOT NULL CHECK (amount > 0),
  reference text,
  notes text,
  status public.treasury_txn_status NOT NULL DEFAULT 'borrador',
  created_by uuid REFERENCES auth.users(id),
  confirmed_by uuid REFERENCES auth.users(id),
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, doc_number)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.treasury_transactions TO authenticated;
GRANT ALL ON public.treasury_transactions TO service_role;
ALTER TABLE public.treasury_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tt_company_members" ON public.treasury_transactions
  FOR ALL TO authenticated
  USING (public.is_company_member(auth.uid(), company_id))
  WITH CHECK (public.is_company_member(auth.uid(), company_id));

CREATE TRIGGER trg_tt_updated_at BEFORE UPDATE ON public.treasury_transactions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_tt_company ON public.treasury_transactions(company_id, txn_date DESC);
CREATE INDEX idx_tt_account ON public.treasury_transactions(bank_account_id);
CREATE INDEX idx_tt_third ON public.treasury_transactions(third_party_id);

-- ============================================================
-- PAYMENT APPLICATIONS
-- ============================================================
CREATE TABLE public.payment_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  treasury_txn_id uuid NOT NULL REFERENCES public.treasury_transactions(id) ON DELETE CASCADE,
  ar_id uuid REFERENCES public.accounts_receivable(id) ON DELETE RESTRICT,
  ap_id uuid REFERENCES public.accounts_payable(id) ON DELETE RESTRICT,
  amount numeric(18,2) NOT NULL CHECK (amount > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((ar_id IS NOT NULL)::int + (ap_id IS NOT NULL)::int = 1)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_applications TO authenticated;
GRANT ALL ON public.payment_applications TO service_role;
ALTER TABLE public.payment_applications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pa_via_txn" ON public.payment_applications
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.treasury_transactions t WHERE t.id = treasury_txn_id AND public.is_company_member(auth.uid(), t.company_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.treasury_transactions t WHERE t.id = treasury_txn_id AND public.is_company_member(auth.uid(), t.company_id)));

CREATE INDEX idx_pa_txn ON public.payment_applications(treasury_txn_id);
CREATE INDEX idx_pa_ar ON public.payment_applications(ar_id) WHERE ar_id IS NOT NULL;
CREATE INDEX idx_pa_ap ON public.payment_applications(ap_id) WHERE ap_id IS NOT NULL;

-- ============================================================
-- FUNCTIONS
-- ============================================================
CREATE OR REPLACE FUNCTION public.next_treasury_number(_company_id uuid, _type treasury_txn_type)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  prefix text;
  n int;
BEGIN
  prefix := CASE _type
    WHEN 'cobro' THEN 'CO'
    WHEN 'pago' THEN 'PG'
    WHEN 'transferencia' THEN 'TF'
    WHEN 'ajuste_positivo' THEN 'AJP'
    WHEN 'ajuste_negativo' THEN 'AJN'
  END;
  SELECT COALESCE(MAX(NULLIF(regexp_replace(doc_number, '^' || prefix || '-', ''), '')::int), 0) + 1
    INTO n
    FROM public.treasury_transactions
    WHERE company_id = _company_id AND txn_type = _type
      AND doc_number ~ ('^' || prefix || '-[0-9]+$');
  RETURN prefix || '-' || lpad(n::text, 6, '0');
END;
$$;

-- Recalculate AR status
CREATE OR REPLACE FUNCTION public.recalc_ar_status(_ar_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  paid numeric(18,2);
  total numeric(18,2);
BEGIN
  SELECT total_amount INTO total FROM public.accounts_receivable WHERE id = _ar_id;
  SELECT COALESCE(SUM(pa.amount), 0) INTO paid
    FROM public.payment_applications pa
    JOIN public.treasury_transactions t ON t.id = pa.treasury_txn_id
    WHERE pa.ar_id = _ar_id AND t.status = 'confirmado';
  UPDATE public.accounts_receivable
    SET paid_amount = paid,
        balance = total - paid,
        status = CASE
          WHEN paid <= 0 THEN 'pendiente'::ar_status
          WHEN paid >= total THEN 'cobrada'::ar_status
          ELSE 'parcial'::ar_status
        END
    WHERE id = _ar_id;
END;
$$;

-- Recalculate AP status
CREATE OR REPLACE FUNCTION public.recalc_ap_status(_ap_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  paid numeric(18,2);
  total numeric(18,2);
BEGIN
  SELECT total_amount INTO total FROM public.accounts_payable WHERE id = _ap_id;
  SELECT COALESCE(SUM(pa.amount), 0) INTO paid
    FROM public.payment_applications pa
    JOIN public.treasury_transactions t ON t.id = pa.treasury_txn_id
    WHERE pa.ap_id = _ap_id AND t.status = 'confirmado';
  UPDATE public.accounts_payable
    SET paid_amount = paid,
        balance = total - paid,
        status = CASE
          WHEN paid <= 0 THEN 'pendiente'::ap_status
          WHEN paid >= total THEN 'pagada'::ap_status
          ELSE 'parcial'::ap_status
        END
    WHERE id = _ap_id;
END;
$$;

-- Confirm treasury transaction
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
  cur_balance numeric(18,2);
BEGIN
  SELECT * INTO t FROM public.treasury_transactions WHERE id = _txn_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Movimiento no encontrado'; END IF;
  IF NOT public.is_company_member(auth.uid(), t.company_id) THEN
    RAISE EXCEPTION 'Sin permisos sobre esta empresa';
  END IF;
  IF t.status <> 'borrador' THEN RAISE EXCEPTION 'Solo se confirman movimientos en borrador'; END IF;

  -- Validate transfer
  IF t.txn_type = 'transferencia' AND t.bank_account_to_id IS NULL THEN
    RAISE EXCEPTION 'Transferencia requiere cuenta destino';
  END IF;
  IF t.txn_type = 'transferencia' AND t.bank_account_to_id = t.bank_account_id THEN
    RAISE EXCEPTION 'La cuenta origen y destino deben ser distintas';
  END IF;

  -- Validate applications sum <= amount (only for cobro/pago)
  IF t.txn_type IN ('cobro','pago') THEN
    SELECT COALESCE(SUM(amount), 0) INTO apps_total
      FROM public.payment_applications WHERE treasury_txn_id = _txn_id;
    IF apps_total > t.amount THEN
      RAISE EXCEPTION 'Aplicaciones (%) exceden el monto (%)', apps_total, t.amount;
    END IF;
  END IF;

  -- Update account balance(s)
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

  -- Update AR/AP statuses via applications
  FOR app IN SELECT * FROM public.payment_applications WHERE treasury_txn_id = _txn_id LOOP
    IF app.ar_id IS NOT NULL THEN
      -- update after status changes to confirmado below; call recalc after
      NULL;
    END IF;
  END LOOP;

  UPDATE public.treasury_transactions
    SET status = 'confirmado', confirmed_at = now(), confirmed_by = auth.uid()
    WHERE id = _txn_id;

  -- Now recalc affected AR/AP
  FOR app IN SELECT * FROM public.payment_applications WHERE treasury_txn_id = _txn_id LOOP
    IF app.ar_id IS NOT NULL THEN PERFORM public.recalc_ar_status(app.ar_id); END IF;
    IF app.ap_id IS NOT NULL THEN PERFORM public.recalc_ap_status(app.ap_id); END IF;
  END LOOP;
END;
$$;

-- Void treasury transaction (reverses balance, recalcs AR/AP)
CREATE OR REPLACE FUNCTION public.void_treasury_transaction(_txn_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t public.treasury_transactions%ROWTYPE;
  app RECORD;
BEGIN
  SELECT * INTO t FROM public.treasury_transactions WHERE id = _txn_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Movimiento no encontrado'; END IF;
  IF NOT public.is_company_member(auth.uid(), t.company_id) THEN
    RAISE EXCEPTION 'Sin permisos sobre esta empresa';
  END IF;
  IF t.status <> 'confirmado' THEN RAISE EXCEPTION 'Solo se anulan movimientos confirmados'; END IF;

  -- Reverse balance
  IF t.txn_type IN ('cobro','ajuste_positivo') THEN
    UPDATE public.bank_accounts SET current_balance = current_balance - t.amount
      WHERE id = t.bank_account_id;
  ELSIF t.txn_type IN ('pago','ajuste_negativo') THEN
    UPDATE public.bank_accounts SET current_balance = current_balance + t.amount
      WHERE id = t.bank_account_id;
  ELSIF t.txn_type = 'transferencia' THEN
    UPDATE public.bank_accounts SET current_balance = current_balance + t.amount
      WHERE id = t.bank_account_id;
    UPDATE public.bank_accounts SET current_balance = current_balance - t.amount
      WHERE id = t.bank_account_to_id;
  END IF;

  UPDATE public.treasury_transactions SET status = 'anulado' WHERE id = _txn_id;

  FOR app IN SELECT * FROM public.payment_applications WHERE treasury_txn_id = _txn_id LOOP
    IF app.ar_id IS NOT NULL THEN PERFORM public.recalc_ar_status(app.ar_id); END IF;
    IF app.ap_id IS NOT NULL THEN PERFORM public.recalc_ap_status(app.ap_id); END IF;
  END LOOP;
END;
$$;
