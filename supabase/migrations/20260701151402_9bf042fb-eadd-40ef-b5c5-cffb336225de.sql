
-- ============================================================
-- FASE 4: VENTAS + POS
-- ============================================================

CREATE TYPE public.sales_order_status AS ENUM (
  'borrador', 'confirmada', 'anulada'
);

CREATE TYPE public.sales_channel AS ENUM (
  'pos', 'venta'
);

CREATE TYPE public.payment_method AS ENUM (
  'efectivo', 'tarjeta', 'transferencia', 'credito', 'mixto', 'otro'
);

CREATE TYPE public.ar_status AS ENUM (
  'pendiente', 'parcial', 'cobrada', 'anulada'
);

CREATE TYPE public.pos_session_status AS ENUM (
  'abierta', 'cerrada'
);

-- ============================================================
-- SALES ORDERS
-- ============================================================
CREATE TABLE public.sales_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  doc_number text NOT NULL,
  customer_id uuid REFERENCES public.third_parties(id) ON DELETE RESTRICT,
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE RESTRICT,
  pos_session_id uuid,
  channel public.sales_channel NOT NULL DEFAULT 'venta',
  order_date date NOT NULL DEFAULT CURRENT_DATE,
  due_date date,
  currency text NOT NULL DEFAULT 'COP',
  subtotal numeric(18,2) NOT NULL DEFAULT 0,
  tax_amount numeric(18,2) NOT NULL DEFAULT 0,
  discount_amount numeric(18,2) NOT NULL DEFAULT 0,
  total numeric(18,2) NOT NULL DEFAULT 0,
  paid_amount numeric(18,2) NOT NULL DEFAULT 0,
  balance numeric(18,2) NOT NULL DEFAULT 0,
  payment_method public.payment_method NOT NULL DEFAULT 'efectivo',
  status public.sales_order_status NOT NULL DEFAULT 'borrador',
  inventory_movement_id uuid REFERENCES public.inventory_movements(id) ON DELETE SET NULL,
  notes text,
  created_by uuid REFERENCES auth.users(id),
  confirmed_by uuid REFERENCES auth.users(id),
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, doc_number)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_orders TO authenticated;
GRANT ALL ON public.sales_orders TO service_role;
ALTER TABLE public.sales_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "so_company_members" ON public.sales_orders
  FOR ALL TO authenticated
  USING (public.is_company_member(auth.uid(), company_id))
  WITH CHECK (public.is_company_member(auth.uid(), company_id));

CREATE TRIGGER trg_so_updated_at BEFORE UPDATE ON public.sales_orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_so_company ON public.sales_orders(company_id, order_date DESC);
CREATE INDEX idx_so_customer ON public.sales_orders(customer_id);
CREATE INDEX idx_so_session ON public.sales_orders(pos_session_id);

-- ============================================================
-- SALES ORDER LINES
-- ============================================================
CREATE TABLE public.sales_order_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_order_id uuid NOT NULL REFERENCES public.sales_orders(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  quantity numeric(18,4) NOT NULL CHECK (quantity > 0),
  unit_price numeric(18,4) NOT NULL DEFAULT 0,
  unit_cost numeric(18,4) NOT NULL DEFAULT 0,
  tax_percent numeric(6,2) NOT NULL DEFAULT 0,
  discount_percent numeric(6,2) NOT NULL DEFAULT 0,
  subtotal numeric(18,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_order_lines TO authenticated;
GRANT ALL ON public.sales_order_lines TO service_role;
ALTER TABLE public.sales_order_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sol_via_order" ON public.sales_order_lines
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.sales_orders o WHERE o.id = sales_order_id AND public.is_company_member(auth.uid(), o.company_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.sales_orders o WHERE o.id = sales_order_id AND public.is_company_member(auth.uid(), o.company_id)));

CREATE INDEX idx_sol_order ON public.sales_order_lines(sales_order_id);

-- ============================================================
-- POS SESSIONS
-- ============================================================
CREATE TABLE public.pos_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  doc_number text NOT NULL,
  cashier_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE RESTRICT,
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  opening_amount numeric(18,2) NOT NULL DEFAULT 0,
  expected_amount numeric(18,2) NOT NULL DEFAULT 0,
  counted_amount numeric(18,2) NOT NULL DEFAULT 0,
  difference numeric(18,2) NOT NULL DEFAULT 0,
  total_sales numeric(18,2) NOT NULL DEFAULT 0,
  status public.pos_session_status NOT NULL DEFAULT 'abierta',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, doc_number)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pos_sessions TO authenticated;
GRANT ALL ON public.pos_sessions TO service_role;
ALTER TABLE public.pos_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pos_company_members" ON public.pos_sessions
  FOR ALL TO authenticated
  USING (public.is_company_member(auth.uid(), company_id))
  WITH CHECK (public.is_company_member(auth.uid(), company_id));

CREATE TRIGGER trg_pos_updated_at BEFORE UPDATE ON public.pos_sessions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_pos_company ON public.pos_sessions(company_id, opened_at DESC);
CREATE INDEX idx_pos_open ON public.pos_sessions(cashier_id) WHERE status = 'abierta';

ALTER TABLE public.sales_orders
  ADD CONSTRAINT sales_orders_pos_session_fk
  FOREIGN KEY (pos_session_id) REFERENCES public.pos_sessions(id) ON DELETE SET NULL;

-- ============================================================
-- ACCOUNTS RECEIVABLE
-- ============================================================
CREATE TABLE public.accounts_receivable (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  doc_number text NOT NULL,
  customer_id uuid NOT NULL REFERENCES public.third_parties(id) ON DELETE RESTRICT,
  sales_order_id uuid REFERENCES public.sales_orders(id) ON DELETE SET NULL,
  invoice_date date NOT NULL DEFAULT CURRENT_DATE,
  due_date date,
  currency text NOT NULL DEFAULT 'COP',
  total_amount numeric(18,2) NOT NULL DEFAULT 0,
  paid_amount numeric(18,2) NOT NULL DEFAULT 0,
  balance numeric(18,2) NOT NULL DEFAULT 0,
  status public.ar_status NOT NULL DEFAULT 'pendiente',
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, doc_number)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.accounts_receivable TO authenticated;
GRANT ALL ON public.accounts_receivable TO service_role;
ALTER TABLE public.accounts_receivable ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ar_company_members" ON public.accounts_receivable
  FOR ALL TO authenticated
  USING (public.is_company_member(auth.uid(), company_id))
  WITH CHECK (public.is_company_member(auth.uid(), company_id));

CREATE TRIGGER trg_ar_updated_at BEFORE UPDATE ON public.accounts_receivable
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_ar_company ON public.accounts_receivable(company_id, invoice_date DESC);
CREATE INDEX idx_ar_customer ON public.accounts_receivable(customer_id);
CREATE INDEX idx_ar_status ON public.accounts_receivable(status) WHERE status IN ('pendiente','parcial');

-- ============================================================
-- FUNCTIONS
-- ============================================================
CREATE OR REPLACE FUNCTION public.next_sales_number(_company_id uuid, _kind text)
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
    WHEN 'sale' THEN 'VT'
    WHEN 'pos' THEN 'POS'
    WHEN 'ar' THEN 'CXC'
    ELSE 'DOC'
  END;

  IF _kind = 'sale' THEN
    SELECT COALESCE(MAX(NULLIF(regexp_replace(doc_number, '^VT-', ''), '')::int), 0) + 1 INTO n
      FROM public.sales_orders
      WHERE company_id = _company_id AND doc_number ~ '^VT-[0-9]+$';
  ELSIF _kind = 'pos' THEN
    SELECT COALESCE(MAX(NULLIF(regexp_replace(doc_number, '^POS-', ''), '')::int), 0) + 1 INTO n
      FROM public.pos_sessions
      WHERE company_id = _company_id AND doc_number ~ '^POS-[0-9]+$';
  ELSIF _kind = 'ar' THEN
    SELECT COALESCE(MAX(NULLIF(regexp_replace(doc_number, '^CXC-', ''), '')::int), 0) + 1 INTO n
      FROM public.accounts_receivable
      WHERE company_id = _company_id AND doc_number ~ '^CXC-[0-9]+$';
  ELSE
    n := 1;
  END IF;

  RETURN prefix || '-' || lpad(n::text, 6, '0');
END;
$$;

-- Confirm sales order: generates inventory outbound + AR (if credit)
CREATE OR REPLACE FUNCTION public.confirm_sales_order(_sales_order_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s public.sales_orders%ROWTYPE;
  ln RECORD;
  mov_id uuid;
  mov_doc text;
  ar_id uuid := NULL;
  ar_doc text;
  stock_cost numeric(18,4);
BEGIN
  SELECT * INTO s FROM public.sales_orders WHERE id = _sales_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Venta no encontrada'; END IF;
  IF NOT public.is_company_member(auth.uid(), s.company_id) THEN
    RAISE EXCEPTION 'Sin permisos sobre esta empresa';
  END IF;
  IF s.status <> 'borrador' THEN RAISE EXCEPTION 'Solo se confirman ventas en borrador'; END IF;

  -- 1) Create inventory movement (salida) in draft
  mov_doc := public.next_movement_number(s.company_id, 'salida');
  INSERT INTO public.inventory_movements (
    company_id, doc_number, movement_type, warehouse_from_id,
    third_party_id, movement_date, reference, notes, status, created_by
  ) VALUES (
    s.company_id, mov_doc, 'salida', s.warehouse_id,
    s.customer_id, s.order_date,
    'VT ' || s.doc_number, 'Venta ' || s.doc_number,
    'borrador', auth.uid()
  ) RETURNING id INTO mov_id;

  -- 2) Copy sales lines, capturing avg cost from stock
  FOR ln IN SELECT * FROM public.sales_order_lines WHERE sales_order_id = _sales_order_id LOOP
    SELECT avg_cost INTO stock_cost FROM public.stock
      WHERE warehouse_id = s.warehouse_id AND product_id = ln.product_id;
    stock_cost := COALESCE(stock_cost, 0);

    INSERT INTO public.inventory_movement_lines (movement_id, product_id, quantity, unit_cost)
      VALUES (mov_id, ln.product_id, ln.quantity, stock_cost);

    UPDATE public.sales_order_lines SET unit_cost = stock_cost WHERE id = ln.id;
  END LOOP;

  -- 3) Confirm inventory movement (validates stock, updates kardex)
  PERFORM public.confirm_inventory_movement(mov_id);

  -- 4) Create AR if credit
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

  -- 5) Update sales order
  UPDATE public.sales_orders SET
    status = 'confirmada',
    inventory_movement_id = mov_id,
    paid_amount = CASE WHEN payment_method = 'credito' THEN 0 ELSE total END,
    balance = CASE WHEN payment_method = 'credito' THEN total ELSE 0 END,
    confirmed_at = now(),
    confirmed_by = auth.uid()
  WHERE id = _sales_order_id;

  -- 6) Update POS session totals if applicable
  IF s.pos_session_id IS NOT NULL THEN
    UPDATE public.pos_sessions
      SET total_sales = total_sales + s.total,
          expected_amount = expected_amount + CASE WHEN s.payment_method = 'efectivo' THEN s.total ELSE 0 END
      WHERE id = s.pos_session_id;
  END IF;

  RETURN COALESCE(ar_id, mov_id);
END;
$$;

-- Close POS session
CREATE OR REPLACE FUNCTION public.close_pos_session(_session_id uuid, _counted numeric)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p public.pos_sessions%ROWTYPE;
BEGIN
  SELECT * INTO p FROM public.pos_sessions WHERE id = _session_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Turno no encontrado'; END IF;
  IF NOT public.is_company_member(auth.uid(), p.company_id) THEN
    RAISE EXCEPTION 'Sin permisos sobre esta empresa';
  END IF;
  IF p.status <> 'abierta' THEN RAISE EXCEPTION 'El turno ya está cerrado'; END IF;

  UPDATE public.pos_sessions SET
    status = 'cerrada',
    closed_at = now(),
    counted_amount = _counted,
    difference = _counted - (opening_amount + expected_amount)
  WHERE id = _session_id;
END;
$$;
