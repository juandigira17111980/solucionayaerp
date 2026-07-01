
-- ============ ENUMS ============
CREATE TYPE public.movement_type AS ENUM ('entrada','salida','traslado','ajuste_positivo','ajuste_negativo');
CREATE TYPE public.movement_status AS ENUM ('borrador','confirmado','anulado');
CREATE TYPE public.kardex_direction AS ENUM ('in','out');

-- ============ STOCK ============
CREATE TABLE public.stock (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  quantity numeric(18,4) NOT NULL DEFAULT 0,
  avg_cost numeric(18,4) NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (warehouse_id, product_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock TO authenticated;
GRANT ALL ON public.stock TO service_role;
ALTER TABLE public.stock ENABLE ROW LEVEL SECURITY;
CREATE POLICY "stock select company members" ON public.stock FOR SELECT TO authenticated
  USING (public.is_company_member(auth.uid(), company_id));
CREATE POLICY "stock modify company members" ON public.stock FOR ALL TO authenticated
  USING (public.is_company_member(auth.uid(), company_id))
  WITH CHECK (public.is_company_member(auth.uid(), company_id));
CREATE INDEX idx_stock_company ON public.stock(company_id);
CREATE INDEX idx_stock_wh_prod ON public.stock(warehouse_id, product_id);

-- ============ LOTS ============
CREATE TABLE public.product_lots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  lot_code text NOT NULL,
  expires_at date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, lot_code)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_lots TO authenticated;
GRANT ALL ON public.product_lots TO service_role;
ALTER TABLE public.product_lots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lots company members" ON public.product_lots FOR ALL TO authenticated
  USING (public.is_company_member(auth.uid(), company_id))
  WITH CHECK (public.is_company_member(auth.uid(), company_id));

-- ============ MOVEMENTS ============
CREATE TABLE public.inventory_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  doc_number text NOT NULL,
  movement_type public.movement_type NOT NULL,
  status public.movement_status NOT NULL DEFAULT 'borrador',
  movement_date date NOT NULL DEFAULT current_date,
  warehouse_from_id uuid REFERENCES public.warehouses(id),
  warehouse_to_id uuid REFERENCES public.warehouses(id),
  third_party_id uuid REFERENCES public.third_parties(id),
  reference text,
  notes text,
  created_by uuid REFERENCES auth.users(id),
  confirmed_by uuid REFERENCES auth.users(id),
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, doc_number)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_movements TO authenticated;
GRANT ALL ON public.inventory_movements TO service_role;
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mov company members" ON public.inventory_movements FOR ALL TO authenticated
  USING (public.is_company_member(auth.uid(), company_id))
  WITH CHECK (public.is_company_member(auth.uid(), company_id));
CREATE INDEX idx_mov_company_date ON public.inventory_movements(company_id, movement_date DESC);
CREATE TRIGGER trg_mov_updated_at BEFORE UPDATE ON public.inventory_movements
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ MOVEMENT LINES ============
CREATE TABLE public.inventory_movement_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  movement_id uuid NOT NULL REFERENCES public.inventory_movements(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id),
  quantity numeric(18,4) NOT NULL CHECK (quantity > 0),
  unit_cost numeric(18,4) NOT NULL DEFAULT 0,
  lot_id uuid REFERENCES public.product_lots(id),
  serial_number text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_movement_lines TO authenticated;
GRANT ALL ON public.inventory_movement_lines TO service_role;
ALTER TABLE public.inventory_movement_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mov lines company members" ON public.inventory_movement_lines FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.inventory_movements m
    WHERE m.id = movement_id AND public.is_company_member(auth.uid(), m.company_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.inventory_movements m
    WHERE m.id = movement_id AND public.is_company_member(auth.uid(), m.company_id)));
CREATE INDEX idx_mov_lines_movement ON public.inventory_movement_lines(movement_id);
CREATE INDEX idx_mov_lines_product ON public.inventory_movement_lines(product_id);

-- ============ KARDEX ============
CREATE TABLE public.kardex (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  movement_id uuid NOT NULL REFERENCES public.inventory_movements(id) ON DELETE CASCADE,
  movement_line_id uuid REFERENCES public.inventory_movement_lines(id) ON DELETE CASCADE,
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id),
  product_id uuid NOT NULL REFERENCES public.products(id),
  lot_id uuid REFERENCES public.product_lots(id),
  movement_date date NOT NULL,
  direction public.kardex_direction NOT NULL,
  quantity numeric(18,4) NOT NULL,
  unit_cost numeric(18,4) NOT NULL,
  total_cost numeric(18,4) NOT NULL,
  balance_qty numeric(18,4) NOT NULL,
  balance_avg_cost numeric(18,4) NOT NULL,
  balance_value numeric(18,4) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.kardex TO authenticated;
GRANT ALL ON public.kardex TO service_role;
ALTER TABLE public.kardex ENABLE ROW LEVEL SECURITY;
CREATE POLICY "kardex select company members" ON public.kardex FOR SELECT TO authenticated
  USING (public.is_company_member(auth.uid(), company_id));
CREATE INDEX idx_kardex_prod_wh ON public.kardex(product_id, warehouse_id, created_at);
CREATE INDEX idx_kardex_company ON public.kardex(company_id, movement_date DESC);

-- ============ CONFIRM FUNCTION (weighted average) ============
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
BEGIN
  SELECT * INTO m FROM public.inventory_movements WHERE id = _movement_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Movimiento no encontrado'; END IF;
  IF NOT public.is_company_member(auth.uid(), m.company_id) THEN
    RAISE EXCEPTION 'Sin permisos sobre esta empresa';
  END IF;
  IF m.status <> 'borrador' THEN RAISE EXCEPTION 'Solo se confirman movimientos en borrador'; END IF;

  -- Validate warehouses per type
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

  FOR ln IN SELECT * FROM public.inventory_movement_lines WHERE movement_id = _movement_id LOOP
    -- ============= OUTGOING (from warehouse_from) =============
    IF m.movement_type IN ('salida','ajuste_negativo','traslado') THEN
      SELECT quantity, avg_cost INTO cur_qty, cur_cost FROM public.stock
        WHERE warehouse_id = m.warehouse_from_id AND product_id = ln.product_id FOR UPDATE;
      IF NOT FOUND THEN cur_qty := 0; cur_cost := 0; END IF;
      IF cur_qty < ln.quantity THEN
        RAISE EXCEPTION 'Stock insuficiente para producto % en bodega origen (disp: %, req: %)',
          ln.product_id, cur_qty, ln.quantity;
      END IF;
      use_cost := cur_cost; -- outgoing at current avg cost
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

    -- ============= INCOMING (to warehouse_to) =============
    IF m.movement_type IN ('entrada','ajuste_positivo','traslado') THEN
      use_cost := CASE
        WHEN m.movement_type = 'traslado' THEN COALESCE(
          (SELECT avg_cost FROM public.kardex WHERE movement_line_id = ln.id AND direction='out' ORDER BY created_at DESC LIMIT 1),
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
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_inventory_movement(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.confirm_inventory_movement(uuid) TO authenticated;

-- ============ DOC NUMBER HELPER ============
CREATE OR REPLACE FUNCTION public.next_movement_number(_company_id uuid, _type public.movement_type)
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
    WHEN 'entrada' THEN 'EN'
    WHEN 'salida' THEN 'SA'
    WHEN 'traslado' THEN 'TR'
    WHEN 'ajuste_positivo' THEN 'AP'
    WHEN 'ajuste_negativo' THEN 'AN'
  END;
  SELECT COALESCE(MAX(NULLIF(regexp_replace(doc_number, '^' || prefix || '-', ''), '')::int), 0) + 1
    INTO n
    FROM public.inventory_movements
    WHERE company_id = _company_id AND movement_type = _type
      AND doc_number ~ ('^' || prefix || '-[0-9]+$');
  RETURN prefix || '-' || lpad(n::text, 6, '0');
END;
$$;
GRANT EXECUTE ON FUNCTION public.next_movement_number(uuid, public.movement_type) TO authenticated;
