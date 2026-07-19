-- Fase 6.4 - Cierres financieros, bloqueo de periodos, reversos y auditoria.

CREATE TABLE IF NOT EXISTS public.accounting_period_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  period_id uuid REFERENCES public.accounting_periods(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  event_description text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_accounting_period_events_period
  ON public.accounting_period_events(period_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_accounting_period_events_company
  ON public.accounting_period_events(company_id, created_at DESC);

ALTER TABLE public.accounting_period_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "accounting_period_events_select" ON public.accounting_period_events
  FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), company_id, 'accounting.view'));

CREATE POLICY "accounting_period_events_insert" ON public.accounting_period_events
  FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(auth.uid(), company_id, 'accounting.operate'));

CREATE OR REPLACE FUNCTION public.log_accounting_period_event(
  _company_id uuid,
  _period_id uuid,
  _event_type text,
  _description text DEFAULT NULL,
  _metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  event_id uuid;
BEGIN
  INSERT INTO public.accounting_period_events(
    company_id, period_id, event_type, event_description, metadata, created_by
  ) VALUES (
    _company_id, _period_id, _event_type, _description, COALESCE(_metadata, '{}'::jsonb), auth.uid()
  ) RETURNING id INTO event_id;

  RETURN event_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_period_for_lock(_company_id uuid, _entry_date date)
RETURNS public.accounting_periods
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p public.accounting_periods%ROWTYPE;
  p_start date := date_trunc('month', COALESCE(_entry_date, CURRENT_DATE))::date;
BEGIN
  SELECT * INTO p
  FROM public.accounting_periods
  WHERE company_id = _company_id
    AND COALESCE(_entry_date, CURRENT_DATE) BETWEEN start_date AND end_date
  ORDER BY start_date DESC
  LIMIT 1;

  IF NOT FOUND THEN
    INSERT INTO public.accounting_periods(company_id, period_code, start_date, end_date)
    VALUES (
      _company_id,
      to_char(p_start, 'YYYY-MM'),
      p_start,
      (p_start + interval '1 month - 1 day')::date
    )
    RETURNING * INTO p;
  END IF;

  RETURN p;
END;
$$;

CREATE OR REPLACE FUNCTION public.assert_period_open_for_operation(
  _company_id uuid,
  _entry_date date,
  _module text,
  _doc_number text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p public.accounting_periods%ROWTYPE;
BEGIN
  p := public.ensure_period_for_lock(_company_id, COALESCE(_entry_date, CURRENT_DATE));

  IF p.status <> 'abierto' THEN
    RAISE EXCEPTION 'Periodo contable % esta %; no se permite % % con fecha %',
      p.period_code, p.status, COALESCE(_module, 'operacion'), COALESCE(_doc_number, ''), COALESCE(_entry_date, CURRENT_DATE);
  END IF;

  RETURN p.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_sales_order_period()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_period_open_for_operation(NEW.company_id, NEW.order_date, 'venta', NEW.doc_number);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_purchase_receipt_period()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_period_open_for_operation(NEW.company_id, NEW.receipt_date, 'recepcion de compra', NEW.doc_number);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_inventory_movement_period()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_period_open_for_operation(NEW.company_id, NEW.movement_date, 'movimiento de inventario', NEW.doc_number);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_treasury_transaction_period()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_period_open_for_operation(NEW.company_id, NEW.txn_date, 'movimiento de tesoreria', NEW.doc_number);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_journal_entry_period()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_period_open_for_operation(NEW.company_id, NEW.entry_date, 'asiento contable', NEW.doc_number);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_sales_order_period ON public.sales_orders;
CREATE TRIGGER trg_guard_sales_order_period
  BEFORE INSERT OR UPDATE ON public.sales_orders
  FOR EACH ROW EXECUTE FUNCTION public.guard_sales_order_period();

DROP TRIGGER IF EXISTS trg_guard_purchase_receipt_period ON public.purchase_receipts;
CREATE TRIGGER trg_guard_purchase_receipt_period
  BEFORE INSERT OR UPDATE ON public.purchase_receipts
  FOR EACH ROW EXECUTE FUNCTION public.guard_purchase_receipt_period();

DROP TRIGGER IF EXISTS trg_guard_inventory_movement_period ON public.inventory_movements;
CREATE TRIGGER trg_guard_inventory_movement_period
  BEFORE INSERT OR UPDATE ON public.inventory_movements
  FOR EACH ROW EXECUTE FUNCTION public.guard_inventory_movement_period();

DROP TRIGGER IF EXISTS trg_guard_treasury_transaction_period ON public.treasury_transactions;
CREATE TRIGGER trg_guard_treasury_transaction_period
  BEFORE INSERT OR UPDATE ON public.treasury_transactions
  FOR EACH ROW EXECUTE FUNCTION public.guard_treasury_transaction_period();

DROP TRIGGER IF EXISTS trg_guard_journal_entry_period ON public.journal_entries;
CREATE TRIGGER trg_guard_journal_entry_period
  BEFORE INSERT OR UPDATE ON public.journal_entries
  FOR EACH ROW EXECUTE FUNCTION public.guard_journal_entry_period();

CREATE OR REPLACE FUNCTION public.close_accounting_period(_period_id uuid, _notes text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p public.accounting_periods%ROWTYPE;
  unbalanced_count int;
  draft_count int;
BEGIN
  SELECT * INTO p FROM public.accounting_periods WHERE id = _period_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Periodo no encontrado'; END IF;

  PERFORM public.assert_has_permission(p.company_id, 'accounting.operate');

  IF p.status <> 'abierto' THEN
    RAISE EXCEPTION 'El periodo no esta abierto';
  END IF;

  SELECT COUNT(*) INTO draft_count
  FROM public.journal_entries
  WHERE company_id = p.company_id
    AND entry_date BETWEEN p.start_date AND p.end_date
    AND status = 'borrador';

  IF draft_count > 0 THEN
    RAISE EXCEPTION 'No se puede cerrar: existen % asientos en borrador', draft_count;
  END IF;

  SELECT COUNT(*) INTO unbalanced_count
  FROM public.journal_entries
  WHERE company_id = p.company_id
    AND entry_date BETWEEN p.start_date AND p.end_date
    AND status = 'confirmado'
    AND round(COALESCE(total_debit,0), 2) <> round(COALESCE(total_credit,0), 2);

  IF unbalanced_count > 0 THEN
    RAISE EXCEPTION 'No se puede cerrar: existen % asientos descuadrados', unbalanced_count;
  END IF;

  UPDATE public.accounting_periods
  SET status = 'cerrado',
      closed_at = now(),
      closed_by = auth.uid(),
      notes = COALESCE(_notes, notes)
  WHERE id = _period_id;

  PERFORM public.log_accounting_period_event(
    p.company_id,
    p.id,
    'period_closed',
    'Periodo cerrado',
    jsonb_build_object('notes', _notes, 'draft_count', draft_count, 'unbalanced_count', unbalanced_count)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.lock_accounting_period(_period_id uuid, _notes text DEFAULT NULL)
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

  IF p.status = 'abierto' THEN
    PERFORM public.close_accounting_period(_period_id, _notes);
  END IF;

  UPDATE public.accounting_periods
  SET status = 'bloqueado',
      notes = COALESCE(_notes, notes)
  WHERE id = _period_id;

  PERFORM public.log_accounting_period_event(
    p.company_id,
    p.id,
    'period_locked',
    'Periodo bloqueado definitivamente',
    jsonb_build_object('notes', _notes)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.reopen_accounting_period(_period_id uuid, _reason text DEFAULT NULL)
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
      closed_by = NULL,
      notes = COALESCE(_reason, notes)
  WHERE id = _period_id;

  PERFORM public.log_accounting_period_event(
    p.company_id,
    p.id,
    'period_reopened',
    'Periodo reabierto',
    jsonb_build_object('reason', _reason)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.reopen_accounting_period(_period_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.reopen_accounting_period(_period_id, NULL::text);
END;
$$;

CREATE OR REPLACE FUNCTION public.reverse_journal_entry(
  _journal_entry_id uuid,
  _reversal_date date DEFAULT CURRENT_DATE,
  _reason text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  original public.journal_entries%ROWTYPE;
  reversal_id uuid;
  payload jsonb;
BEGIN
  SELECT * INTO original FROM public.journal_entries WHERE id = _journal_entry_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Asiento no encontrado'; END IF;

  PERFORM public.assert_has_permission(original.company_id, 'accounting.operate');
  PERFORM public.assert_period_open_for_operation(original.company_id, COALESCE(_reversal_date, CURRENT_DATE), 'reverso contable', original.doc_number);

  IF original.status <> 'confirmado' THEN
    RAISE EXCEPTION 'Solo se reversan asientos confirmados';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.journal_entries
    WHERE reversed_entry_id = original.id
      AND status <> 'anulado'
  ) THEN
    RAISE EXCEPTION 'El asiento ya tiene un reverso activo';
  END IF;

  SELECT jsonb_agg(jsonb_build_object(
    'account_id', l.account_id,
    'third_party_id', l.third_party_id,
    'cost_center_id', l.cost_center_id,
    'description', COALESCE(_reason, 'Reverso de ' || original.doc_number),
    'debit', l.credit,
    'credit', l.debit
  )) INTO payload
  FROM public.journal_entry_lines l
  WHERE l.journal_entry_id = original.id;

  reversal_id := public.create_journal_entry(
    original.company_id,
    COALESCE(_reversal_date, CURRENT_DATE),
    'AJUSTE',
    'REV ' || original.doc_number,
    COALESCE(_reason, 'Reverso controlado de ' || original.doc_number),
    'reversal',
    original.id,
    payload,
    true
  );

  UPDATE public.journal_entries
  SET reversed_entry_id = original.id
  WHERE id = reversal_id;

  PERFORM public.log_accounting_period_event(
    original.company_id,
    (SELECT id FROM public.accounting_periods WHERE company_id = original.company_id AND COALESCE(_reversal_date, CURRENT_DATE) BETWEEN start_date AND end_date LIMIT 1),
    'journal_reversed',
    'Reverso contable creado',
    jsonb_build_object('original_entry_id', original.id, 'reversal_entry_id', reversal_id, 'reason', _reason)
  );

  RETURN reversal_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.report_accounting_period_events(_company_id uuid, _period_id uuid DEFAULT NULL)
RETURNS TABLE(event_id uuid, period_code text, event_type text, event_description text, metadata jsonb, created_by uuid, created_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_has_permission(_company_id, 'accounting.view');

  RETURN QUERY
  SELECT
    e.id,
    p.period_code::text,
    e.event_type::text,
    e.event_description::text,
    e.metadata,
    e.created_by,
    e.created_at
  FROM public.accounting_period_events e
  LEFT JOIN public.accounting_periods p ON p.id = e.period_id
  WHERE e.company_id = _company_id
    AND (_period_id IS NULL OR e.period_id = _period_id)
  ORDER BY e.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.log_accounting_period_event(uuid, uuid, text, text, jsonb) FROM public;
REVOKE ALL ON FUNCTION public.ensure_period_for_lock(uuid, date) FROM public;
REVOKE ALL ON FUNCTION public.assert_period_open_for_operation(uuid, date, text, text) FROM public;
REVOKE ALL ON FUNCTION public.lock_accounting_period(uuid, text) FROM public;
REVOKE ALL ON FUNCTION public.reopen_accounting_period(uuid, text) FROM public;
REVOKE ALL ON FUNCTION public.reopen_accounting_period(uuid) FROM public;
REVOKE ALL ON FUNCTION public.reverse_journal_entry(uuid, date, text) FROM public;
REVOKE ALL ON FUNCTION public.report_accounting_period_events(uuid, uuid) FROM public;

GRANT EXECUTE ON FUNCTION public.lock_accounting_period(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reopen_accounting_period(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reopen_accounting_period(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_journal_entry(uuid, date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.report_accounting_period_events(uuid, uuid) TO authenticated;
