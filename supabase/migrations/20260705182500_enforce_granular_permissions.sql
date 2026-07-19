-- Fase 1.1: enforcement real de seguridad granular por modulo.
-- Esta migracion no borra datos: reemplaza policies heredadas demasiado amplias.

CREATE OR REPLACE FUNCTION public.get_my_permissions(_company_id uuid)
RETURNS TABLE(permission_code text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH denied AS (
    SELECT up.permission_code
    FROM public.user_permissions up
    WHERE up.user_id = auth.uid()
      AND up.company_id = _company_id
      AND up.effect = 'deny'
  ),
  direct_allow AS (
    SELECT up.permission_code
    FROM public.user_permissions up
    WHERE up.user_id = auth.uid()
      AND up.company_id = _company_id
      AND up.effect = 'allow'
  ),
  role_allow AS (
    SELECT rp.permission_code
    FROM public.user_roles ur
    JOIN public.role_permissions rp
      ON rp.role = ur.role
     AND (rp.company_id IS NULL OR rp.company_id = _company_id)
    WHERE ur.user_id = auth.uid()
      AND (ur.company_id IS NULL OR ur.company_id = _company_id)
  )
  SELECT DISTINCT permission_code
  FROM (
    SELECT permission_code FROM direct_allow
    UNION
    SELECT permission_code FROM role_allow
  ) allowed
  WHERE NOT EXISTS (
    SELECT 1 FROM denied d WHERE d.permission_code = allowed.permission_code
  )
  ORDER BY permission_code;
$$;

REVOKE EXECUTE ON FUNCTION public.get_my_permissions(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_permissions(uuid) TO authenticated, service_role;

-- ============================================================================
-- Maestros y bodegas
-- ============================================================================

DROP POLICY IF EXISTS "warehouses_select" ON public.warehouses;
DROP POLICY IF EXISTS "warehouses_write" ON public.warehouses;
CREATE POLICY "warehouses_select_granular" ON public.warehouses
  FOR SELECT TO authenticated
  USING (
    public.can_access_warehouse(auth.uid(), company_id, id, false)
    OR public.has_permission(auth.uid(), company_id, 'warehouses.view')
    OR public.has_permission(auth.uid(), company_id, 'warehouses.manage')
  );
CREATE POLICY "warehouses_insert_granular" ON public.warehouses
  FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(auth.uid(), company_id, 'warehouses.manage'));
CREATE POLICY "warehouses_update_granular" ON public.warehouses
  FOR UPDATE TO authenticated
  USING (public.has_permission(auth.uid(), company_id, 'warehouses.manage'))
  WITH CHECK (public.has_permission(auth.uid(), company_id, 'warehouses.manage'));
CREATE POLICY "warehouses_delete_granular" ON public.warehouses
  FOR DELETE TO authenticated
  USING (public.has_permission(auth.uid(), company_id, 'warehouses.manage'));

DROP POLICY IF EXISTS "products_select" ON public.products;
DROP POLICY IF EXISTS "products_write" ON public.products;
CREATE POLICY "products_select_granular" ON public.products
  FOR SELECT TO authenticated
  USING (
    public.has_permission(auth.uid(), company_id, 'masters.view')
    OR public.has_permission(auth.uid(), company_id, 'masters.manage')
    OR public.has_permission(auth.uid(), company_id, 'inventory.view')
    OR public.has_permission(auth.uid(), company_id, 'purchases.view')
    OR public.has_permission(auth.uid(), company_id, 'sales.view')
    OR public.has_permission(auth.uid(), company_id, 'pos.operate')
  );
CREATE POLICY "products_insert_granular" ON public.products
  FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(auth.uid(), company_id, 'masters.manage'));
CREATE POLICY "products_update_granular" ON public.products
  FOR UPDATE TO authenticated
  USING (public.has_permission(auth.uid(), company_id, 'masters.manage'))
  WITH CHECK (public.has_permission(auth.uid(), company_id, 'masters.manage'));
CREATE POLICY "products_delete_granular" ON public.products
  FOR DELETE TO authenticated
  USING (public.has_permission(auth.uid(), company_id, 'masters.manage'));

DROP POLICY IF EXISTS "cat_select" ON public.product_categories;
DROP POLICY IF EXISTS "cat_write" ON public.product_categories;
CREATE POLICY "cat_select_granular" ON public.product_categories
  FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), company_id, 'masters.view') OR public.has_permission(auth.uid(), company_id, 'masters.manage'));
CREATE POLICY "cat_write_granular" ON public.product_categories
  FOR ALL TO authenticated
  USING (public.has_permission(auth.uid(), company_id, 'masters.manage'))
  WITH CHECK (public.has_permission(auth.uid(), company_id, 'masters.manage'));

DROP POLICY IF EXISTS "brands_select" ON public.brands;
DROP POLICY IF EXISTS "brands_write" ON public.brands;
CREATE POLICY "brands_select_granular" ON public.brands
  FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), company_id, 'masters.view') OR public.has_permission(auth.uid(), company_id, 'masters.manage'));
CREATE POLICY "brands_write_granular" ON public.brands
  FOR ALL TO authenticated
  USING (public.has_permission(auth.uid(), company_id, 'masters.manage'))
  WITH CHECK (public.has_permission(auth.uid(), company_id, 'masters.manage'));

DROP POLICY IF EXISTS "tp_select" ON public.third_parties;
DROP POLICY IF EXISTS "tp_write" ON public.third_parties;
CREATE POLICY "tp_select_granular" ON public.third_parties
  FOR SELECT TO authenticated
  USING (
    public.has_permission(auth.uid(), company_id, 'masters.view')
    OR public.has_permission(auth.uid(), company_id, 'purchases.view')
    OR public.has_permission(auth.uid(), company_id, 'sales.view')
    OR public.has_permission(auth.uid(), company_id, 'treasury.view')
  );
CREATE POLICY "tp_write_granular" ON public.third_parties
  FOR ALL TO authenticated
  USING (public.has_permission(auth.uid(), company_id, 'masters.manage'))
  WITH CHECK (public.has_permission(auth.uid(), company_id, 'masters.manage'));

-- ============================================================================
-- Inventario
-- ============================================================================

DROP POLICY IF EXISTS "stock select company members" ON public.stock;
DROP POLICY IF EXISTS "stock modify company members" ON public.stock;
CREATE POLICY "stock_select_granular" ON public.stock
  FOR SELECT TO authenticated
  USING (
    public.can_access_warehouse(auth.uid(), company_id, warehouse_id, false)
    AND (
      public.has_permission(auth.uid(), company_id, 'inventory.view')
      OR public.has_permission(auth.uid(), company_id, 'reports.view')
      OR public.has_permission(auth.uid(), company_id, 'pos.operate')
    )
  );
CREATE POLICY "stock_modify_granular" ON public.stock
  FOR ALL TO authenticated
  USING (public.has_permission(auth.uid(), company_id, 'inventory.operate') AND public.can_access_warehouse(auth.uid(), company_id, warehouse_id, true))
  WITH CHECK (public.has_permission(auth.uid(), company_id, 'inventory.operate') AND public.can_access_warehouse(auth.uid(), company_id, warehouse_id, true));

DROP POLICY IF EXISTS "mov company members" ON public.inventory_movements;
CREATE POLICY "mov_select_granular" ON public.inventory_movements
  FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), company_id, 'inventory.view'));
CREATE POLICY "mov_insert_granular" ON public.inventory_movements
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_permission(auth.uid(), company_id, 'inventory.operate')
    AND (warehouse_from_id IS NULL OR public.can_access_warehouse(auth.uid(), company_id, warehouse_from_id, true))
    AND (warehouse_to_id IS NULL OR public.can_access_warehouse(auth.uid(), company_id, warehouse_to_id, true))
  );
CREATE POLICY "mov_update_granular" ON public.inventory_movements
  FOR UPDATE TO authenticated
  USING (public.has_permission(auth.uid(), company_id, 'inventory.operate'))
  WITH CHECK (
    public.has_permission(auth.uid(), company_id, 'inventory.operate')
    AND (warehouse_from_id IS NULL OR public.can_access_warehouse(auth.uid(), company_id, warehouse_from_id, true))
    AND (warehouse_to_id IS NULL OR public.can_access_warehouse(auth.uid(), company_id, warehouse_to_id, true))
  );

DROP POLICY IF EXISTS "mov lines company members" ON public.inventory_movement_lines;
CREATE POLICY "mov_lines_granular" ON public.inventory_movement_lines
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.inventory_movements m
      WHERE m.id = movement_id
        AND (public.has_permission(auth.uid(), m.company_id, 'inventory.view') OR public.has_permission(auth.uid(), m.company_id, 'inventory.operate'))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.inventory_movements m
      WHERE m.id = movement_id
        AND public.has_permission(auth.uid(), m.company_id, 'inventory.operate')
    )
  );

DROP POLICY IF EXISTS "kardex select company members" ON public.kardex;
CREATE POLICY "kardex_select_granular" ON public.kardex
  FOR SELECT TO authenticated
  USING (
    public.can_access_warehouse(auth.uid(), company_id, warehouse_id, false)
    AND (
      public.has_permission(auth.uid(), company_id, 'inventory.view')
      OR public.has_permission(auth.uid(), company_id, 'reports.view')
    )
  );

-- ============================================================================
-- Compras, ventas y POS
-- ============================================================================

DROP POLICY IF EXISTS "po_company_members" ON public.purchase_orders;
CREATE POLICY "po_select_granular" ON public.purchase_orders
  FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), company_id, 'purchases.view'));
CREATE POLICY "po_modify_granular" ON public.purchase_orders
  FOR ALL TO authenticated
  USING (public.has_permission(auth.uid(), company_id, 'purchases.operate'))
  WITH CHECK (public.has_permission(auth.uid(), company_id, 'purchases.operate') AND (warehouse_id IS NULL OR public.can_access_warehouse(auth.uid(), company_id, warehouse_id, true)));

DROP POLICY IF EXISTS "pol_via_order" ON public.purchase_order_lines;
CREATE POLICY "pol_via_order_granular" ON public.purchase_order_lines
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.purchase_orders o WHERE o.id = purchase_order_id AND (public.has_permission(auth.uid(), o.company_id, 'purchases.view') OR public.has_permission(auth.uid(), o.company_id, 'purchases.operate')))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.purchase_orders o WHERE o.id = purchase_order_id AND public.has_permission(auth.uid(), o.company_id, 'purchases.operate'))
  );

DROP POLICY IF EXISTS "pr_company_members" ON public.purchase_receipts;
CREATE POLICY "pr_select_granular" ON public.purchase_receipts
  FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), company_id, 'purchases.view'));
CREATE POLICY "pr_modify_granular" ON public.purchase_receipts
  FOR ALL TO authenticated
  USING (public.has_permission(auth.uid(), company_id, 'purchases.operate'))
  WITH CHECK (public.has_permission(auth.uid(), company_id, 'purchases.operate') AND public.can_access_warehouse(auth.uid(), company_id, warehouse_id, true));

DROP POLICY IF EXISTS "prl_via_receipt" ON public.purchase_receipt_lines;
CREATE POLICY "prl_via_receipt_granular" ON public.purchase_receipt_lines
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.purchase_receipts r WHERE r.id = receipt_id AND (public.has_permission(auth.uid(), r.company_id, 'purchases.view') OR public.has_permission(auth.uid(), r.company_id, 'purchases.operate')))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.purchase_receipts r WHERE r.id = receipt_id AND public.has_permission(auth.uid(), r.company_id, 'purchases.operate'))
  );

DROP POLICY IF EXISTS "so_company_members" ON public.sales_orders;
CREATE POLICY "so_select_granular" ON public.sales_orders
  FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), company_id, 'sales.view') OR public.has_permission(auth.uid(), company_id, 'pos.operate'));
CREATE POLICY "so_modify_granular" ON public.sales_orders
  FOR ALL TO authenticated
  USING (public.has_permission(auth.uid(), company_id, 'sales.operate') OR public.has_permission(auth.uid(), company_id, 'pos.operate'))
  WITH CHECK (
    (public.has_permission(auth.uid(), company_id, 'sales.operate') OR public.has_permission(auth.uid(), company_id, 'pos.operate'))
    AND public.can_access_warehouse(auth.uid(), company_id, warehouse_id, true)
  );

DROP POLICY IF EXISTS "sol_via_order" ON public.sales_order_lines;
CREATE POLICY "sol_via_order_granular" ON public.sales_order_lines
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.sales_orders o WHERE o.id = sales_order_id AND (public.has_permission(auth.uid(), o.company_id, 'sales.view') OR public.has_permission(auth.uid(), o.company_id, 'sales.operate') OR public.has_permission(auth.uid(), o.company_id, 'pos.operate')))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.sales_orders o WHERE o.id = sales_order_id AND (public.has_permission(auth.uid(), o.company_id, 'sales.operate') OR public.has_permission(auth.uid(), o.company_id, 'pos.operate')))
  );

DROP POLICY IF EXISTS "pos_company_members" ON public.pos_sessions;
CREATE POLICY "pos_sessions_granular" ON public.pos_sessions
  FOR ALL TO authenticated
  USING (public.has_permission(auth.uid(), company_id, 'pos.operate') AND public.can_access_warehouse(auth.uid(), company_id, warehouse_id, true))
  WITH CHECK (public.has_permission(auth.uid(), company_id, 'pos.operate') AND public.can_access_warehouse(auth.uid(), company_id, warehouse_id, true));

DROP POLICY IF EXISTS "ar_company_members" ON public.accounts_receivable;
CREATE POLICY "ar_select_granular" ON public.accounts_receivable
  FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), company_id, 'sales.view') OR public.has_permission(auth.uid(), company_id, 'treasury.view') OR public.has_permission(auth.uid(), company_id, 'reports.view'));
CREATE POLICY "ar_modify_granular" ON public.accounts_receivable
  FOR ALL TO authenticated
  USING (public.has_permission(auth.uid(), company_id, 'sales.operate') OR public.has_permission(auth.uid(), company_id, 'treasury.operate'))
  WITH CHECK (public.has_permission(auth.uid(), company_id, 'sales.operate') OR public.has_permission(auth.uid(), company_id, 'treasury.operate'));

DROP POLICY IF EXISTS "ap_company_members" ON public.accounts_payable;
CREATE POLICY "ap_select_granular" ON public.accounts_payable
  FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), company_id, 'purchases.view') OR public.has_permission(auth.uid(), company_id, 'treasury.view') OR public.has_permission(auth.uid(), company_id, 'reports.view'));
CREATE POLICY "ap_modify_granular" ON public.accounts_payable
  FOR ALL TO authenticated
  USING (public.has_permission(auth.uid(), company_id, 'purchases.operate') OR public.has_permission(auth.uid(), company_id, 'treasury.operate'))
  WITH CHECK (public.has_permission(auth.uid(), company_id, 'purchases.operate') OR public.has_permission(auth.uid(), company_id, 'treasury.operate'));

-- ============================================================================
-- Reportes, IA y finanzas: las policies de tablas se complementan con RLS.
-- Las RPCs deben mantener chequeos explicitos cuando sean SECURITY DEFINER.
-- ============================================================================
