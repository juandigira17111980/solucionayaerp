
CREATE OR REPLACE FUNCTION public.confirm_inventory_movement(_movement_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    IF m.movement_type IN ('salida','ajuste_negativo','traslado') THEN
      SELECT quantity, avg_cost INTO cur_qty, cur_cost FROM public.stock
        WHERE warehouse_id = m.warehouse_from_id AND product_id = ln.product_id FOR UPDATE;
      IF NOT FOUND THEN cur_qty := 0; cur_cost := 0; END IF;
      IF cur_qty < ln.quantity THEN
        RAISE EXCEPTION 'Stock insuficiente para producto % en bodega origen (disp: %, req: %)',
          ln.product_id, cur_qty, ln.quantity;
      END IF;
      use_cost := cur_cost;
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

    IF m.movement_type IN ('entrada','ajuste_positivo','traslado') THEN
      use_cost := CASE
        WHEN m.movement_type = 'traslado' THEN COALESCE(
          (SELECT unit_cost FROM public.kardex WHERE movement_line_id = ln.id AND direction='out' ORDER BY created_at DESC LIMIT 1),
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
$function$;
