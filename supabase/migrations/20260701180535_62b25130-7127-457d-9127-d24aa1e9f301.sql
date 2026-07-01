
CREATE OR REPLACE FUNCTION public.confirm_expense(_expense_id uuid)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  e public.expenses%ROWTYPE;
  v_ap_id uuid := NULL; ap_doc text;
  v_tx_id uuid := NULL; tx_doc text;
  je_id uuid; je_doc text;
  gasto_acc uuid; cxp_acc uuid; banco_acc uuid; iva_acc uuid;
BEGIN
  SELECT * INTO e FROM public.expenses WHERE id=_expense_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Gasto no encontrado'; END IF;
  IF NOT public.is_company_member(auth.uid(), e.company_id) THEN RAISE EXCEPTION 'Sin permisos'; END IF;
  IF e.status <> 'borrador' THEN RAISE EXCEPTION 'Solo se confirman gastos en borrador'; END IF;
  IF e.total <= 0 THEN RAISE EXCEPTION 'El total del gasto debe ser mayor a cero'; END IF;

  gasto_acc := e.expense_account_id;
  IF gasto_acc IS NULL THEN
    SELECT id INTO gasto_acc FROM public.chart_of_accounts WHERE company_id=e.company_id AND code='5' ORDER BY code LIMIT 1;
  END IF;
  SELECT id INTO cxp_acc FROM public.chart_of_accounts WHERE company_id=e.company_id AND code='2205' LIMIT 1;
  SELECT id INTO iva_acc FROM public.chart_of_accounts WHERE company_id=e.company_id AND code='2408' LIMIT 1;

  IF e.payment_method = 'credito' THEN
    ap_doc := public.next_purchase_number(e.company_id, 'payable');
    INSERT INTO public.accounts_payable(company_id, doc_number, supplier_id,
      supplier_invoice, invoice_date, due_date, currency,
      total_amount, paid_amount, balance, status, created_by)
    VALUES (e.company_id, ap_doc, e.supplier_id,
      e.supplier_invoice, e.expense_date, COALESCE(e.due_date, e.expense_date), e.currency,
      e.total, 0, e.total, 'pendiente', auth.uid())
    RETURNING id INTO v_ap_id;
  ELSE
    IF e.bank_account_id IS NULL THEN RAISE EXCEPTION 'Se requiere cuenta bancaria para pagos directos'; END IF;
    tx_doc := public.next_treasury_number(e.company_id, 'pago');
    INSERT INTO public.treasury_transactions(company_id, doc_number, txn_type,
      bank_account_id, third_party_id, txn_date, payment_method, amount,
      reference, notes, status, created_by, confirmed_at, confirmed_by)
    VALUES (e.company_id, tx_doc, 'pago',
      e.bank_account_id, e.supplier_id, e.expense_date, e.payment_method::payment_method, e.total,
      'Gasto ' || e.doc_number, e.description, 'confirmado', auth.uid(), now(), auth.uid())
    RETURNING id INTO v_tx_id;
    UPDATE public.bank_accounts SET current_balance = current_balance - e.total WHERE id = e.bank_account_id;
    SELECT id INTO banco_acc FROM public.chart_of_accounts WHERE company_id=e.company_id AND code='1110' LIMIT 1;
  END IF;

  IF gasto_acc IS NOT NULL THEN
    je_doc := public.next_accounting_number(e.company_id, 'journal');
    INSERT INTO public.journal_entries(company_id, doc_number, entry_date,
      reference, description, source_type, source_id, status, created_by)
    VALUES (e.company_id, je_doc, e.expense_date,
      'GA ' || e.doc_number, COALESCE(e.description, 'Gasto ' || e.doc_number),
      'gasto', e.id, 'borrador', auth.uid())
    RETURNING id INTO je_id;

    INSERT INTO public.journal_entry_lines(journal_entry_id, account_id, third_party_id, description, debit, credit)
      VALUES (je_id, gasto_acc, e.supplier_id, e.category, e.subtotal, 0);
    IF e.tax_amount > 0 AND iva_acc IS NOT NULL THEN
      INSERT INTO public.journal_entry_lines(journal_entry_id, account_id, third_party_id, description, debit, credit)
        VALUES (je_id, iva_acc, e.supplier_id, 'IVA', e.tax_amount, 0);
    ELSIF e.tax_amount > 0 THEN
      UPDATE public.journal_entry_lines SET debit = debit + e.tax_amount
        WHERE journal_entry_id = je_id AND account_id = gasto_acc;
    END IF;

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
    ap_id = v_ap_id, treasury_txn_id = v_tx_id, journal_entry_id = je_id,
    confirmed_at = now(), confirmed_by = auth.uid()
  WHERE id = _expense_id;

  RETURN _expense_id;
END; $function$;
