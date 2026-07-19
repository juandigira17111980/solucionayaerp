-- ============================================================
-- FASE 7: DOCUMENTOS COMERCIALES Y FACTURACION
-- ============================================================

DO $$
BEGIN
  CREATE TYPE public.commercial_document_type AS ENUM ('cotizacion', 'pedido', 'remision', 'factura');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE public.commercial_document_status AS ENUM ('borrador', 'emitido', 'convertido', 'anulado');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.commercial_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  doc_type public.commercial_document_type NOT NULL,
  doc_number text NOT NULL,
  status public.commercial_document_status NOT NULL DEFAULT 'borrador',
  customer_id uuid REFERENCES public.third_parties(id) ON DELETE RESTRICT,
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE RESTRICT,
  issue_date date NOT NULL DEFAULT CURRENT_DATE,
  due_date date,
  payment_method public.payment_method NOT NULL DEFAULT 'credito',
  currency text NOT NULL DEFAULT 'COP',
  subtotal numeric(18,2) NOT NULL DEFAULT 0,
  tax_amount numeric(18,2) NOT NULL DEFAULT 0,
  discount_amount numeric(18,2) NOT NULL DEFAULT 0,
  total numeric(18,2) NOT NULL DEFAULT 0,
  source_document_id uuid REFERENCES public.commercial_documents(id) ON DELETE SET NULL,
  sales_order_id uuid REFERENCES public.sales_orders(id) ON DELETE SET NULL,
  notes text,
  terms text,
  print_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id),
  issued_by uuid REFERENCES auth.users(id),
  issued_at timestamptz,
  voided_by uuid REFERENCES auth.users(id),
  voided_at timestamptz,
  void_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, doc_type, doc_number)
);

CREATE TABLE IF NOT EXISTS public.commercial_document_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.commercial_documents(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  description text,
  quantity numeric(18,4) NOT NULL CHECK (quantity > 0),
  unit_price numeric(18,4) NOT NULL DEFAULT 0,
  tax_percent numeric(6,2) NOT NULL DEFAULT 0,
  discount_percent numeric(6,2) NOT NULL DEFAULT 0,
  subtotal numeric(18,2) NOT NULL DEFAULT 0,
  tax_amount numeric(18,2) NOT NULL DEFAULT 0,
  discount_amount numeric(18,2) NOT NULL DEFAULT 0,
  total numeric(18,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.commercial_document_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  document_id uuid NOT NULL REFERENCES public.commercial_documents(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  event_description text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.commercial_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commercial_document_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commercial_document_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "commercial_documents_select_granular" ON public.commercial_documents;
CREATE POLICY "commercial_documents_select_granular" ON public.commercial_documents
  FOR SELECT TO authenticated
  USING (
    (public.has_permission(auth.uid(), company_id, 'sales.view') OR public.has_permission(auth.uid(), company_id, 'sales.operate') OR public.has_permission(auth.uid(), company_id, 'reports.view'))
    AND public.can_access_warehouse(auth.uid(), company_id, warehouse_id, false)
  );

DROP POLICY IF EXISTS "commercial_documents_modify_granular" ON public.commercial_documents;
CREATE POLICY "commercial_documents_modify_granular" ON public.commercial_documents
  FOR ALL TO authenticated
  USING (
    public.has_permission(auth.uid(), company_id, 'sales.operate')
    AND public.can_access_warehouse(auth.uid(), company_id, warehouse_id, true)
  )
  WITH CHECK (
    public.has_permission(auth.uid(), company_id, 'sales.operate')
    AND public.can_access_warehouse(auth.uid(), company_id, warehouse_id, true)
  );

DROP POLICY IF EXISTS "commercial_document_lines_via_document" ON public.commercial_document_lines;
CREATE POLICY "commercial_document_lines_via_document" ON public.commercial_document_lines
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.commercial_documents d
      WHERE d.id = document_id
        AND (public.has_permission(auth.uid(), d.company_id, 'sales.view') OR public.has_permission(auth.uid(), d.company_id, 'sales.operate') OR public.has_permission(auth.uid(), d.company_id, 'reports.view'))
        AND public.can_access_warehouse(auth.uid(), d.company_id, d.warehouse_id, false)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.commercial_documents d
      WHERE d.id = document_id
        AND public.has_permission(auth.uid(), d.company_id, 'sales.operate')
        AND public.can_access_warehouse(auth.uid(), d.company_id, d.warehouse_id, true)
    )
  );

DROP POLICY IF EXISTS "commercial_document_events_select_granular" ON public.commercial_document_events;
CREATE POLICY "commercial_document_events_select_granular" ON public.commercial_document_events
  FOR SELECT TO authenticated
  USING (
    public.has_permission(auth.uid(), company_id, 'sales.view')
    OR public.has_permission(auth.uid(), company_id, 'sales.operate')
    OR public.has_permission(auth.uid(), company_id, 'reports.view')
  );

DROP POLICY IF EXISTS "commercial_document_events_insert_granular" ON public.commercial_document_events;
CREATE POLICY "commercial_document_events_insert_granular" ON public.commercial_document_events
  FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(auth.uid(), company_id, 'sales.operate'));

CREATE INDEX IF NOT EXISTS idx_commercial_documents_company_date ON public.commercial_documents(company_id, issue_date DESC);
CREATE INDEX IF NOT EXISTS idx_commercial_documents_customer ON public.commercial_documents(customer_id);
CREATE INDEX IF NOT EXISTS idx_commercial_documents_source ON public.commercial_documents(source_document_id);
CREATE INDEX IF NOT EXISTS idx_commercial_documents_sale ON public.commercial_documents(sales_order_id);
CREATE INDEX IF NOT EXISTS idx_commercial_document_lines_document ON public.commercial_document_lines(document_id);
CREATE INDEX IF NOT EXISTS idx_commercial_document_events_document ON public.commercial_document_events(document_id, created_at DESC);

DROP TRIGGER IF EXISTS trg_commercial_documents_updated_at ON public.commercial_documents;
CREATE TRIGGER trg_commercial_documents_updated_at
  BEFORE UPDATE ON public.commercial_documents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.next_commercial_document_number(
  _company_id uuid,
  _doc_type public.commercial_document_type
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  prefix text;
  n int;
BEGIN
  prefix := CASE _doc_type
    WHEN 'cotizacion' THEN 'COT'
    WHEN 'pedido' THEN 'PED'
    WHEN 'remision' THEN 'REM'
    WHEN 'factura' THEN 'FAC'
    ELSE 'DOC'
  END;

  SELECT COALESCE(MAX(NULLIF(regexp_replace(doc_number, '^' || prefix || '-', ''), '')::int), 0) + 1
  INTO n
  FROM public.commercial_documents
  WHERE company_id = _company_id
    AND doc_type = _doc_type
    AND doc_number ~ ('^' || prefix || '-[0-9]+$');

  RETURN prefix || '-' || lpad(n::text, 6, '0');
END;
$$;

CREATE OR REPLACE FUNCTION public.log_commercial_document_event(
  _document_id uuid,
  _event_type text,
  _event_description text,
  _metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d public.commercial_documents%ROWTYPE;
  event_id uuid;
BEGIN
  SELECT * INTO d FROM public.commercial_documents WHERE id = _document_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Documento comercial no encontrado'; END IF;

  INSERT INTO public.commercial_document_events (
    company_id, document_id, event_type, event_description, metadata, created_by
  ) VALUES (
    d.company_id, d.id, _event_type, _event_description, COALESCE(_metadata, '{}'::jsonb), auth.uid()
  ) RETURNING id INTO event_id;

  RETURN event_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_commercial_document_period()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_period_open_for_operation(NEW.company_id, NEW.issue_date, 'documento comercial', NEW.doc_number);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_commercial_document_period ON public.commercial_documents;
CREATE TRIGGER trg_guard_commercial_document_period
  BEFORE INSERT OR UPDATE ON public.commercial_documents
  FOR EACH ROW
  WHEN (NEW.status <> 'anulado')
  EXECUTE FUNCTION public.guard_commercial_document_period();

CREATE OR REPLACE FUNCTION public.recalculate_commercial_document_totals(_document_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.commercial_documents d
  SET subtotal = COALESCE(t.subtotal, 0),
      tax_amount = COALESCE(t.tax_amount, 0),
      discount_amount = COALESCE(t.discount_amount, 0),
      total = COALESCE(t.total, 0)
  FROM (
    SELECT
      document_id,
      SUM(subtotal)::numeric(18,2) AS subtotal,
      SUM(tax_amount)::numeric(18,2) AS tax_amount,
      SUM(discount_amount)::numeric(18,2) AS discount_amount,
      SUM(total)::numeric(18,2) AS total
    FROM public.commercial_document_lines
    WHERE document_id = _document_id
    GROUP BY document_id
  ) t
  WHERE d.id = _document_id AND t.document_id = d.id;

  UPDATE public.commercial_documents
  SET subtotal = 0, tax_amount = 0, discount_amount = 0, total = 0
  WHERE id = _document_id
    AND NOT EXISTS (SELECT 1 FROM public.commercial_document_lines WHERE document_id = _document_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.build_commercial_document_payload(_document_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  payload jsonb;
BEGIN
  SELECT jsonb_build_object(
    'document', jsonb_build_object(
      'id', d.id,
      'type', d.doc_type,
      'number', d.doc_number,
      'status', d.status,
      'issue_date', d.issue_date,
      'due_date', d.due_date,
      'payment_method', d.payment_method,
      'currency', d.currency,
      'subtotal', d.subtotal,
      'tax_amount', d.tax_amount,
      'discount_amount', d.discount_amount,
      'total', d.total,
      'notes', d.notes,
      'terms', d.terms
    ),
    'company', jsonb_build_object(
      'id', c.id,
      'legal_name', c.legal_name,
      'trade_name', c.trade_name,
      'tax_id', c.tax_id,
      'email', c.email,
      'phone', c.phone
    ),
    'customer', jsonb_build_object(
      'id', tp.id,
      'legal_name', tp.legal_name,
      'trade_name', tp.trade_name,
      'tax_id', tp.tax_id,
      'email', tp.email,
      'phone', tp.phone
    ),
    'warehouse', jsonb_build_object('id', w.id, 'name', w.name),
    'lines', COALESCE(jsonb_agg(jsonb_build_object(
      'product_id', l.product_id,
      'sku', p.sku,
      'name', p.name,
      'description', COALESCE(l.description, p.name),
      'quantity', l.quantity,
      'unit_price', l.unit_price,
      'tax_percent', l.tax_percent,
      'discount_percent', l.discount_percent,
      'subtotal', l.subtotal,
      'tax_amount', l.tax_amount,
      'discount_amount', l.discount_amount,
      'total', l.total
    ) ORDER BY l.created_at, l.id) FILTER (WHERE l.id IS NOT NULL), '[]'::jsonb)
  ) INTO payload
  FROM public.commercial_documents d
  JOIN public.companies c ON c.id = d.company_id
  LEFT JOIN public.third_parties tp ON tp.id = d.customer_id
  JOIN public.warehouses w ON w.id = d.warehouse_id
  LEFT JOIN public.commercial_document_lines l ON l.document_id = d.id
  LEFT JOIN public.products p ON p.id = l.product_id
  WHERE d.id = _document_id
  GROUP BY d.id, c.id, tp.id, w.id;

  IF payload IS NULL THEN RAISE EXCEPTION 'Documento comercial no encontrado'; END IF;
  RETURN payload;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_commercial_document(
  _company_id uuid,
  _doc_type public.commercial_document_type,
  _customer_id uuid,
  _warehouse_id uuid,
  _issue_date date,
  _due_date date,
  _payment_method public.payment_method,
  _lines jsonb,
  _notes text DEFAULT NULL,
  _terms text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  doc_id uuid;
  doc_num text;
  item RECORD;
  product_row RECORD;
  base_amount numeric(18,4);
  discount_amount numeric(18,4);
  tax_amount numeric(18,4);
BEGIN
  PERFORM public.assert_has_permission(_company_id, 'sales.operate');

  IF NOT public.can_access_warehouse(auth.uid(), _company_id, _warehouse_id, true) THEN
    RAISE EXCEPTION 'Sin permisos operativos sobre la bodega del documento';
  END IF;

  PERFORM public.assert_period_open_for_operation(_company_id, COALESCE(_issue_date, CURRENT_DATE), 'documento comercial', NULL);

  IF _doc_type = 'factura' AND _payment_method = 'credito' AND _customer_id IS NULL THEN
    RAISE EXCEPTION 'Las facturas a credito requieren cliente';
  END IF;

  IF _lines IS NULL OR jsonb_typeof(_lines) <> 'array' OR jsonb_array_length(_lines) = 0 THEN
    RAISE EXCEPTION 'El documento requiere al menos una linea';
  END IF;

  doc_num := public.next_commercial_document_number(_company_id, _doc_type);

  INSERT INTO public.commercial_documents (
    company_id, doc_type, doc_number, customer_id, warehouse_id, issue_date,
    due_date, payment_method, notes, terms, created_by
  ) VALUES (
    _company_id, _doc_type, doc_num, _customer_id, _warehouse_id, COALESCE(_issue_date, CURRENT_DATE),
    _due_date, COALESCE(_payment_method, 'credito'), NULLIF(_notes, ''), NULLIF(_terms, ''), auth.uid()
  ) RETURNING id INTO doc_id;

  FOR item IN
    SELECT
      (x.value->>'product_id')::uuid AS product_id,
      NULLIF(x.value->>'description', '') AS description,
      COALESCE((x.value->>'quantity')::numeric, 0) AS quantity,
      COALESCE((x.value->>'unit_price')::numeric, 0) AS unit_price,
      COALESCE((x.value->>'tax_percent')::numeric, 0) AS tax_percent,
      COALESCE((x.value->>'discount_percent')::numeric, 0) AS discount_percent
    FROM jsonb_array_elements(_lines) AS x(value)
  LOOP
    IF item.product_id IS NULL OR item.quantity <= 0 OR item.unit_price < 0 THEN
      RAISE EXCEPTION 'Linea comercial invalida';
    END IF;

    SELECT p.id, p.company_id, p.sku, p.name, p.is_sellable
    INTO product_row
    FROM public.products p
    WHERE p.id = item.product_id AND p.company_id = _company_id;

    IF NOT FOUND OR product_row.is_sellable IS NOT TRUE THEN
      RAISE EXCEPTION 'Producto % no esta habilitado para documentos comerciales', COALESCE(product_row.sku, item.product_id::text);
    END IF;

    base_amount := item.quantity * item.unit_price;
    discount_amount := base_amount * item.discount_percent / 100;
    tax_amount := (base_amount - discount_amount) * item.tax_percent / 100;

    INSERT INTO public.commercial_document_lines (
      document_id, product_id, description, quantity, unit_price,
      tax_percent, discount_percent, subtotal, discount_amount, tax_amount, total
    ) VALUES (
      doc_id, item.product_id, COALESCE(item.description, product_row.name), item.quantity, item.unit_price,
      item.tax_percent, item.discount_percent, base_amount, discount_amount, tax_amount,
      base_amount - discount_amount + tax_amount
    );
  END LOOP;

  PERFORM public.recalculate_commercial_document_totals(doc_id);
  PERFORM public.log_commercial_document_event(doc_id, 'creado', 'Documento comercial creado en borrador', jsonb_build_object('doc_type', _doc_type));

  RETURN doc_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.issue_commercial_document(_document_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d public.commercial_documents%ROWTYPE;
  so_id uuid;
  sale_doc text;
BEGIN
  SELECT * INTO d FROM public.commercial_documents WHERE id = _document_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Documento comercial no encontrado'; END IF;

  PERFORM public.assert_has_permission(d.company_id, 'sales.operate');

  IF NOT public.can_access_warehouse(auth.uid(), d.company_id, d.warehouse_id, true) THEN
    RAISE EXCEPTION 'Sin permisos operativos sobre la bodega del documento';
  END IF;

  PERFORM public.assert_period_open_for_operation(d.company_id, d.issue_date, 'emision documento comercial', d.doc_number);

  IF d.status <> 'borrador' THEN
    RAISE EXCEPTION 'Solo se emiten documentos en borrador';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.commercial_document_lines WHERE document_id = d.id) THEN
    RAISE EXCEPTION 'El documento no tiene lineas';
  END IF;

  IF d.doc_type = 'factura' THEN
    IF d.payment_method = 'credito' AND d.customer_id IS NULL THEN
      RAISE EXCEPTION 'Las facturas a credito requieren cliente';
    END IF;

    sale_doc := public.next_sales_number(d.company_id, 'sale');
    INSERT INTO public.sales_orders (
      company_id, doc_number, customer_id, warehouse_id, channel, order_date,
      due_date, currency, subtotal, tax_amount, discount_amount, total,
      payment_method, status, notes, created_by
    ) VALUES (
      d.company_id, sale_doc, d.customer_id, d.warehouse_id, 'venta', d.issue_date,
      d.due_date, d.currency, d.subtotal, d.tax_amount, d.discount_amount, d.total,
      d.payment_method, 'borrador', 'Factura comercial ' || d.doc_number, auth.uid()
    ) RETURNING id INTO so_id;

    INSERT INTO public.sales_order_lines (
      sales_order_id, product_id, quantity, unit_price, tax_percent,
      discount_percent, subtotal
    )
    SELECT
      so_id, product_id, quantity, unit_price, tax_percent,
      discount_percent, subtotal
    FROM public.commercial_document_lines
    WHERE document_id = d.id;

    PERFORM public.confirm_sales_order(so_id);
  END IF;

  UPDATE public.commercial_documents
  SET status = 'emitido',
      issued_by = auth.uid(),
      issued_at = now(),
      sales_order_id = COALESCE(so_id, sales_order_id),
      print_payload = public.build_commercial_document_payload(id)
  WHERE id = d.id;

  PERFORM public.log_commercial_document_event(
    d.id,
    'emitido',
    CASE WHEN d.doc_type = 'factura' THEN 'Factura emitida y venta confirmada' ELSE 'Documento comercial emitido' END,
    jsonb_build_object('sales_order_id', so_id)
  );

  RETURN COALESCE(so_id, d.id);
END;
$$;

CREATE OR REPLACE FUNCTION public.convert_commercial_document(
  _document_id uuid,
  _target_type public.commercial_document_type
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d public.commercial_documents%ROWTYPE;
  new_id uuid;
  new_num text;
BEGIN
  SELECT * INTO d FROM public.commercial_documents WHERE id = _document_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Documento comercial no encontrado'; END IF;

  PERFORM public.assert_has_permission(d.company_id, 'sales.operate');

  IF d.status NOT IN ('borrador', 'emitido') THEN
    RAISE EXCEPTION 'Solo se convierten documentos activos';
  END IF;

  IF NOT (
    (d.doc_type = 'cotizacion' AND _target_type IN ('pedido', 'factura')) OR
    (d.doc_type = 'pedido' AND _target_type IN ('remision', 'factura')) OR
    (d.doc_type = 'remision' AND _target_type = 'factura')
  ) THEN
    RAISE EXCEPTION 'Flujo documental no permitido: % a %', d.doc_type, _target_type;
  END IF;

  PERFORM public.assert_period_open_for_operation(d.company_id, CURRENT_DATE, 'conversion documento comercial', d.doc_number);

  new_num := public.next_commercial_document_number(d.company_id, _target_type);

  INSERT INTO public.commercial_documents (
    company_id, doc_type, doc_number, status, customer_id, warehouse_id,
    issue_date, due_date, payment_method, currency, subtotal, tax_amount,
    discount_amount, total, source_document_id, notes, terms, created_by
  ) VALUES (
    d.company_id, _target_type, new_num, 'borrador', d.customer_id, d.warehouse_id,
    CURRENT_DATE, d.due_date, d.payment_method, d.currency, d.subtotal, d.tax_amount,
    d.discount_amount, d.total, d.id, d.notes, d.terms, auth.uid()
  ) RETURNING id INTO new_id;

  INSERT INTO public.commercial_document_lines (
    document_id, product_id, description, quantity, unit_price,
    tax_percent, discount_percent, subtotal, tax_amount, discount_amount, total
  )
  SELECT
    new_id, product_id, description, quantity, unit_price,
    tax_percent, discount_percent, subtotal, tax_amount, discount_amount, total
  FROM public.commercial_document_lines
  WHERE document_id = d.id;

  UPDATE public.commercial_documents SET status = 'convertido' WHERE id = d.id;

  PERFORM public.log_commercial_document_event(d.id, 'convertido', 'Documento convertido', jsonb_build_object('target_type', _target_type, 'target_document_id', new_id));
  PERFORM public.log_commercial_document_event(new_id, 'creado_por_conversion', 'Documento creado desde conversion', jsonb_build_object('source_document_id', d.id, 'source_type', d.doc_type));

  RETURN new_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.void_commercial_document(
  _document_id uuid,
  _reason text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d public.commercial_documents%ROWTYPE;
BEGIN
  SELECT * INTO d FROM public.commercial_documents WHERE id = _document_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Documento comercial no encontrado'; END IF;

  PERFORM public.assert_has_permission(d.company_id, 'sales.operate');
  PERFORM public.assert_period_open_for_operation(d.company_id, d.issue_date, 'anulacion documento comercial', d.doc_number);

  IF d.status = 'anulado' THEN RAISE EXCEPTION 'El documento ya esta anulado'; END IF;
  IF d.status = 'convertido' THEN RAISE EXCEPTION 'No se anula un documento convertido; anula o revierte el documento destino'; END IF;
  IF NULLIF(_reason, '') IS NULL THEN RAISE EXCEPTION 'La anulacion requiere motivo'; END IF;
  IF d.sales_order_id IS NOT NULL THEN
    RAISE EXCEPTION 'La factura ya genero venta confirmada; requiere nota credito o reverso controlado';
  END IF;

  UPDATE public.commercial_documents
  SET status = 'anulado',
      voided_by = auth.uid(),
      voided_at = now(),
      void_reason = _reason
  WHERE id = d.id;

  PERFORM public.log_commercial_document_event(d.id, 'anulado', 'Documento comercial anulado', jsonb_build_object('reason', _reason));
  RETURN d.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.report_commercial_documents(
  _company_id uuid,
  _from date DEFAULT NULL,
  _to date DEFAULT NULL,
  _doc_type public.commercial_document_type DEFAULT NULL,
  _status public.commercial_document_status DEFAULT NULL
)
RETURNS TABLE(
  id uuid,
  doc_type public.commercial_document_type,
  doc_number text,
  status public.commercial_document_status,
  issue_date date,
  due_date date,
  customer_name text,
  warehouse_name text,
  payment_method public.payment_method,
  subtotal numeric,
  tax_amount numeric,
  discount_amount numeric,
  total numeric,
  source_document_id uuid,
  sales_order_id uuid,
  issued_at timestamptz,
  voided_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_any_permission(_company_id, ARRAY['sales.view', 'sales.operate', 'reports.view']);

  RETURN QUERY
  SELECT
    d.id, d.doc_type, d.doc_number, d.status, d.issue_date, d.due_date,
    COALESCE(tp.trade_name, tp.legal_name, 'Consumidor final') AS customer_name,
    w.name AS warehouse_name,
    d.payment_method, d.subtotal, d.tax_amount, d.discount_amount, d.total,
    d.source_document_id, d.sales_order_id, d.issued_at, d.voided_at
  FROM public.commercial_documents d
  JOIN public.warehouses w ON w.id = d.warehouse_id
  LEFT JOIN public.third_parties tp ON tp.id = d.customer_id
  WHERE d.company_id = _company_id
    AND (_from IS NULL OR d.issue_date >= _from)
    AND (_to IS NULL OR d.issue_date <= _to)
    AND (_doc_type IS NULL OR d.doc_type = _doc_type)
    AND (_status IS NULL OR d.status = _status)
    AND public.can_access_warehouse(auth.uid(), d.company_id, d.warehouse_id, false)
  ORDER BY d.issue_date DESC, d.created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_commercial_document_payload(_document_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d public.commercial_documents%ROWTYPE;
BEGIN
  SELECT * INTO d FROM public.commercial_documents WHERE id = _document_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Documento comercial no encontrado'; END IF;

  PERFORM public.assert_any_permission(d.company_id, ARRAY['sales.view', 'sales.operate', 'reports.view']);
  RETURN public.build_commercial_document_payload(_document_id);
END;
$$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.commercial_documents TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.commercial_document_lines TO authenticated;
GRANT SELECT, INSERT ON public.commercial_document_events TO authenticated;
GRANT ALL ON public.commercial_documents TO service_role;
GRANT ALL ON public.commercial_document_lines TO service_role;
GRANT ALL ON public.commercial_document_events TO service_role;

REVOKE ALL ON FUNCTION public.next_commercial_document_number(uuid, public.commercial_document_type) FROM public;
REVOKE ALL ON FUNCTION public.create_commercial_document(uuid, public.commercial_document_type, uuid, uuid, date, date, public.payment_method, jsonb, text, text) FROM public;
REVOKE ALL ON FUNCTION public.issue_commercial_document(uuid) FROM public;
REVOKE ALL ON FUNCTION public.convert_commercial_document(uuid, public.commercial_document_type) FROM public;
REVOKE ALL ON FUNCTION public.void_commercial_document(uuid, text) FROM public;
REVOKE ALL ON FUNCTION public.report_commercial_documents(uuid, date, date, public.commercial_document_type, public.commercial_document_status) FROM public;
REVOKE ALL ON FUNCTION public.get_commercial_document_payload(uuid) FROM public;

GRANT EXECUTE ON FUNCTION public.next_commercial_document_number(uuid, public.commercial_document_type) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_commercial_document(uuid, public.commercial_document_type, uuid, uuid, date, date, public.payment_method, jsonb, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.issue_commercial_document(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.convert_commercial_document(uuid, public.commercial_document_type) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.void_commercial_document(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.report_commercial_documents(uuid, date, date, public.commercial_document_type, public.commercial_document_status) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_commercial_document_payload(uuid) TO authenticated, service_role;
