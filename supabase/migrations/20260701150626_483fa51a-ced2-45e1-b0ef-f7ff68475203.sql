
-- ============================================================
-- FASE 3: COMPRAS
-- ============================================================

CREATE TYPE public.purchase_order_status AS ENUM (
  'borrador', 'aprobada', 'parcial', 'recibida', 'cancelada'
);

CREATE TYPE public.purchase_receipt_status AS ENUM (
  'borrador', 'confirmada', 'cancelada'
);

CREATE TYPE public.ap_status AS ENUM (
  'pendiente', 'parcial', 'pagada', 'anulada'
);

-- ============================================================
-- PURCHASE ORDERS
-- ============================================================
CREATE TABLE public.purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  doc_number text NOT NULL,
  supplier_id uuid NOT NULL REFERENCES public.third_parties(id) ON DELETE RESTRICT,
  warehouse_id uuid REFERENCES public.warehouses(id) ON DELETE RESTRICT,
  order_date date NOT NULL DEFAULT CURRENT_DATE,
  expected_date date,
  currency text NOT NULL DEFAULT 'COP',
  subtotal numeric(18,2) NOT NULL DEFAULT 0,
  tax_amount numeric(18,2) NOT NULL DEFAULT 0,
  discount_amount numeric(18,2) NOT NULL DEFAULT 0,
  total numeric(18,2) NOT NULL DEFAULT 0,
  status public.purchase_order_status NOT NULL DEFAULT 'borrador',
  notes text,
  created_by uuid REFERENCES auth.users(id),
  approved_by uuid REFERENCES auth.users(id),
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, doc_number)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_orders TO authenticated;
GRANT ALL ON public.purchase_orders TO service_role;
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "po_company_members" ON public.purchase_orders
  FOR ALL TO authenticated
  USING (public.is_company_member(auth.uid(), company_id))
  WITH CHECK (public.is_company_member(auth.uid(), company_id));

CREATE TRIGGER trg_po_updated_at BEFORE UPDATE ON public.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_po_company ON public.purchase_orders(company_id, order_date DESC);
CREATE INDEX idx_po_supplier ON public.purchase_orders(supplier_id);

-- ============================================================
-- PURCHASE ORDER LINES
-- ============================================================
CREATE TABLE public.purchase_order_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  quantity numeric(18,4) NOT NULL CHECK (quantity > 0),
  received_quantity numeric(18,4) NOT NULL DEFAULT 0,
  unit_cost numeric(18,4) NOT NULL DEFAULT 0,
  tax_percent numeric(6,2) NOT NULL DEFAULT 0,
  discount_percent numeric(6,2) NOT NULL DEFAULT 0,
  subtotal numeric(18,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_order_lines TO authenticated;
GRANT ALL ON public.purchase_order_lines TO service_role;
ALTER TABLE public.purchase_order_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pol_via_order" ON public.purchase_order_lines
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.purchase_orders o WHERE o.id = purchase_order_id AND public.is_company_member(auth.uid(), o.company_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.purchase_orders o WHERE o.id = purchase_order_id AND public.is_company_member(auth.uid(), o.company_id)));

CREATE INDEX idx_pol_order ON public.purchase_order_lines(purchase_order_id);

-- ============================================================
-- PURCHASE RECEIPTS
-- ============================================================
CREATE TABLE public.purchase_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  doc_number text NOT NULL,
  purchase_order_id uuid REFERENCES public.purchase_orders(id) ON DELETE RESTRICT,
  supplier_id uuid NOT NULL REFERENCES public.third_parties(id) ON DELETE RESTRICT,
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE RESTRICT,
  receipt_date date NOT NULL DEFAULT CURRENT_DATE,
  supplier_invoice text,
  invoice_date date,
  due_date date,
  inventory_movement_id uuid REFERENCES public.inventory_movements(id) ON DELETE SET NULL,
  status public.purchase_receipt_status NOT NULL DEFAULT 'borrador',
  total numeric(18,2) NOT NULL DEFAULT 0,
  notes text,
  created_by uuid REFERENCES auth.users(id),
  confirmed_by uuid REFERENCES auth.users(id),
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, doc_number)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_receipts TO authenticated;
GRANT ALL ON public.purchase_receipts TO service_role;
ALTER TABLE public.purchase_receipts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pr_company_members" ON public.purchase_receipts
  FOR ALL TO authenticated
  USING (public.is_company_member(auth.uid(), company_id))
  WITH CHECK (public.is_company_member(auth.uid(), company_id));

CREATE TRIGGER trg_pr_updated_at BEFORE UPDATE ON public.purchase_receipts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_pr_company ON public.purchase_receipts(company_id, receipt_date DESC);
CREATE INDEX idx_pr_order ON public.purchase_receipts(purchase_order_id);

-- ============================================================
-- PURCHASE RECEIPT LINES
-- ============================================================
CREATE TABLE public.purchase_receipt_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_id uuid NOT NULL REFERENCES public.purchase_receipts(id) ON DELETE CASCADE,
  purchase_order_line_id uuid REFERENCES public.purchase_order_lines(id) ON DELETE SET NULL,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  quantity numeric(18,4) NOT NULL CHECK (quantity > 0),
  unit_cost numeric(18,4) NOT NULL DEFAULT 0,
  subtotal numeric(18,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_receipt_lines TO authenticated;
GRANT ALL ON public.purchase_receipt_lines TO service_role;
ALTER TABLE public.purchase_receipt_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "prl_via_receipt" ON public.purchase_receipt_lines
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.purchase_receipts r WHERE r.id = receipt_id AND public.is_company_member(auth.uid(), r.company_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.purchase_receipts r WHERE r.id = receipt_id AND public.is_company_member(auth.uid(), r.company_id)));

CREATE INDEX idx_prl_receipt ON public.purchase_receipt_lines(receipt_id);

-- ============================================================
-- ACCOUNTS PAYABLE
-- ============================================================
CREATE TABLE public.accounts_payable (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  doc_number text NOT NULL,
  supplier_id uuid NOT NULL REFERENCES public.third_parties(id) ON DELETE RESTRICT,
  receipt_id uuid REFERENCES public.purchase_receipts(id) ON DELETE SET NULL,
  supplier_invoice text,
  invoice_date date NOT NULL DEFAULT CURRENT_DATE,
  due_date date,
  currency text NOT NULL DEFAULT 'COP',
  total_amount numeric(18,2) NOT NULL DEFAULT 0,
  paid_amount numeric(18,2) NOT NULL DEFAULT 0,
  balance numeric(18,2) NOT NULL DEFAULT 0,
  status public.ap_status NOT NULL DEFAULT 'pendiente',
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, doc_number)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.accounts_payable TO authenticated;
GRANT ALL ON public.accounts_payable TO service_role;
ALTER TABLE public.accounts_payable ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ap_company_members" ON public.accounts_payable
  FOR ALL TO authenticated
  USING (public.is_company_member(auth.uid(), company_id))
  WITH CHECK (public.is_company_member(auth.uid(), company_id));

CREATE TRIGGER trg_ap_updated_at BEFORE UPDATE ON public.accounts_payable
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_ap_company ON public.accounts_payable(company_id, invoice_date DESC);
CREATE INDEX idx_ap_supplier ON public.accounts_payable(supplier_id);
CREATE INDEX idx_ap_status ON public.accounts_payable(status) WHERE status IN ('pendiente','parcial');

-- ============================================================
-- FUNCTIONS
-- ============================================================

CREATE OR REPLACE FUNCTION public.next_purchase_number(_company_id uuid, _kind text)
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
    WHEN 'order' THEN 'OC'
    WHEN 'receipt' THEN 'REC'
    WHEN 'payable' THEN 'CXP'
    ELSE 'DOC'
  END;

  IF _kind = 'order' THEN
    SELECT COALESCE(MAX(NULLIF(regexp_replace(doc_number, '^OC-', ''), '')::int), 0) + 1 INTO n
      FROM public.purchase_orders
      WHERE company_id = _company_id AND doc_number ~ '^OC-[0-9]+$';
  ELSIF _kind = 'receipt' THEN
    SELECT COALESCE(MAX(NULLIF(regexp_replace(doc_number, '^REC-', ''), '')::int), 0) + 1 INTO n
      FROM public.purchase_receipts
      WHERE company_id = _company_id AND doc_number ~ '^REC-[0-9]+$';
  ELSIF _kind = 'payable' THEN
    SELECT COALESCE(MAX(NULLIF(regexp_replace(doc_number, '^CXP-', ''), '')::int), 0) + 1 INTO n
      FROM public.accounts_payable
      WHERE company_id = _company_id AND doc_number ~ '^CXP-[0-9]+$';
  ELSE
    n := 1;
  END IF;

  RETURN prefix || '-' || lpad(n::text, 6, '0');
END;
$$;

-- Confirm receipt: creates inventory movement (entrada), updates PO received qty, creates AP
CREATE OR REPLACE FUNCTION public.confirm_purchase_receipt(_receipt_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.purchase_receipts%ROWTYPE;
  ln RECORD;
  mov_id uuid;
  mov_doc text;
  ap_id uuid;
  ap_doc text;
  totals numeric(18,2) := 0;
BEGIN
  SELECT * INTO r FROM public.purchase_receipts WHERE id = _receipt_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Recepción no encontrada'; END IF;
  IF NOT public.is_company_member(auth.uid(), r.company_id) THEN
    RAISE EXCEPTION 'Sin permisos sobre esta empresa';
  END IF;
  IF r.status <> 'borrador' THEN RAISE EXCEPTION 'Solo se confirman recepciones en borrador'; END IF;

  -- 1) Create inventory movement (entrada) in draft
  mov_doc := public.next_movement_number(r.company_id, 'entrada');
  INSERT INTO public.inventory_movements (
    company_id, doc_number, movement_type, warehouse_to_id,
    third_party_id, movement_date, reference, notes, status, created_by
  ) VALUES (
    r.company_id, mov_doc, 'entrada', r.warehouse_id,
    r.supplier_id, r.receipt_date,
    'REC ' || r.doc_number, 'Recepción de compra ' || r.doc_number,
    'borrador', auth.uid()
  ) RETURNING id INTO mov_id;

  -- 2) Copy lines into movement lines
  FOR ln IN SELECT * FROM public.purchase_receipt_lines WHERE receipt_id = _receipt_id LOOP
    INSERT INTO public.inventory_movement_lines (movement_id, product_id, quantity, unit_cost)
      VALUES (mov_id, ln.product_id, ln.quantity, ln.unit_cost);

    -- Update received qty on PO line if linked
    IF ln.purchase_order_line_id IS NOT NULL THEN
      UPDATE public.purchase_order_lines
        SET received_quantity = received_quantity + ln.quantity
        WHERE id = ln.purchase_order_line_id;
    END IF;

    totals := totals + (ln.quantity * ln.unit_cost);
  END LOOP;

  -- 3) Confirm the inventory movement (updates stock + kardex)
  PERFORM public.confirm_inventory_movement(mov_id);

  -- 4) Update PO status if applicable
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

  -- 5) Create Account Payable
  ap_doc := public.next_purchase_number(r.company_id, 'payable');
  INSERT INTO public.accounts_payable (
    company_id, doc_number, supplier_id, receipt_id,
    supplier_invoice, invoice_date, due_date, currency,
    total_amount, paid_amount, balance, status, created_by
  ) VALUES (
    r.company_id, ap_doc, r.supplier_id, r.id,
    r.supplier_invoice, COALESCE(r.invoice_date, r.receipt_date), r.due_date, 'COP',
    totals, 0, totals, 'pendiente', auth.uid()
  ) RETURNING id INTO ap_id;

  -- 6) Update receipt
  UPDATE public.purchase_receipts
    SET status = 'confirmada',
        inventory_movement_id = mov_id,
        total = totals,
        confirmed_at = now(),
        confirmed_by = auth.uid()
    WHERE id = _receipt_id;

  RETURN ap_id;
END;
$$;

-- Recalculate PO totals
CREATE OR REPLACE FUNCTION public.recalc_purchase_order_totals(_po_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub numeric(18,2) := 0;
  v_tax numeric(18,2) := 0;
  v_disc numeric(18,2) := 0;
BEGIN
  SELECT
    COALESCE(SUM(quantity * unit_cost), 0),
    COALESCE(SUM(quantity * unit_cost * tax_percent / 100.0), 0),
    COALESCE(SUM(quantity * unit_cost * discount_percent / 100.0), 0)
  INTO v_sub, v_tax, v_disc
  FROM public.purchase_order_lines
  WHERE purchase_order_id = _po_id;

  UPDATE public.purchase_orders
    SET subtotal = v_sub,
        tax_amount = v_tax,
        discount_amount = v_disc,
        total = v_sub + v_tax - v_disc
    WHERE id = _po_id;
END;
$$;
