-- =====================================================
-- SOLUCIONA YA ERP - Fase 1: Seguridad granular
-- =====================================================

-- Catalogo de permisos por modulo y accion.
CREATE TABLE IF NOT EXISTS public.permissions (
  code text PRIMARY KEY,
  module text NOT NULL,
  action text NOT NULL,
  description text NOT NULL,
  is_system boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (module, action)
);

GRANT SELECT ON public.permissions TO authenticated;
GRANT ALL ON public.permissions TO service_role;
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "permissions_read_authenticated" ON public.permissions;
CREATE POLICY "permissions_read_authenticated" ON public.permissions
  FOR SELECT TO authenticated
  USING (true);

-- Permisos asignados a roles. company_id NULL representa plantilla global.
CREATE TABLE IF NOT EXISTS public.role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role public.app_role NOT NULL,
  permission_code text NOT NULL REFERENCES public.permissions(code) ON DELETE CASCADE,
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE (role, permission_code, company_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.role_permissions TO authenticated;
GRANT ALL ON public.role_permissions TO service_role;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

-- Excepciones directas por usuario. effect=false niega aunque el rol permita.
CREATE TABLE IF NOT EXISTS public.user_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  permission_code text NOT NULL REFERENCES public.permissions(code) ON DELETE CASCADE,
  effect boolean NOT NULL DEFAULT true,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE (user_id, company_id, permission_code)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_permissions TO authenticated;
GRANT ALL ON public.user_permissions TO service_role;
ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;

-- Acceso granular por bodega/punto de venta.
CREATE TABLE IF NOT EXISTS public.user_warehouse_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
  can_view boolean NOT NULL DEFAULT true,
  can_operate boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE (user_id, warehouse_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_warehouse_access TO authenticated;
GRANT ALL ON public.user_warehouse_access TO service_role;
ALTER TABLE public.user_warehouse_access ENABLE ROW LEVEL SECURITY;

-- Invitaciones funcionales. La creacion real del usuario auth sigue fuera del cliente.
CREATE TABLE IF NOT EXISTS public.security_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  email text NOT NULL,
  role public.app_role NOT NULL DEFAULT 'usuario',
  status text NOT NULL DEFAULT 'pendiente' CHECK (status IN ('pendiente','aceptada','revocada','expirada')),
  invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  accepted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, email, status)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.security_invitations TO authenticated;
GRANT ALL ON public.security_invitations TO service_role;
ALTER TABLE public.security_invitations ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS trg_security_invitations_updated_at ON public.security_invitations;
CREATE TRIGGER trg_security_invitations_updated_at
  BEFORE UPDATE ON public.security_invitations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Indices criticos.
CREATE INDEX IF NOT EXISTS idx_role_permissions_company ON public.role_permissions(company_id, role);
CREATE INDEX IF NOT EXISTS idx_user_permissions_user_company ON public.user_permissions(user_id, company_id);
CREATE INDEX IF NOT EXISTS idx_user_warehouse_access_user_company ON public.user_warehouse_access(user_id, company_id);
CREATE INDEX IF NOT EXISTS idx_security_invitations_company ON public.security_invitations(company_id, status);

-- Helper interno para administrar seguridad de una empresa sin depender de has_permission.
CREATE OR REPLACE FUNCTION public.can_manage_company_security(_company_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _company_id IS NULL OR auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role = 'super_admin'
  ) OR EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role = 'admin'
      AND (ur.company_id IS NULL OR ur.company_id = _company_id)
  ) OR EXISTS (
    SELECT 1
    FROM public.user_permissions up
    WHERE up.user_id = auth.uid()
      AND up.company_id = _company_id
      AND up.permission_code = 'security.manage'
      AND up.effect = true
  );
END;
$$;

-- Evaluacion granular de permisos. Deny directo gana sobre allow por rol.
CREATE OR REPLACE FUNCTION public.has_permission(
  _user_id uuid,
  _company_id uuid,
  _permission_code text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _user_id IS DISTINCT FROM auth.uid() THEN
    RETURN false;
  END IF;

  IF _company_id IS NULL OR _permission_code IS NULL THEN
    RETURN false;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = 'super_admin'
  ) THEN
    RETURN true;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.user_companies
    WHERE user_id = _user_id AND company_id = _company_id
  ) THEN
    RETURN false;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.user_permissions up
    WHERE up.user_id = _user_id
      AND up.company_id = _company_id
      AND up.permission_code = _permission_code
      AND up.effect = false
  ) THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.user_permissions up
    WHERE up.user_id = _user_id
      AND up.company_id = _company_id
      AND up.permission_code = _permission_code
      AND up.effect = true
  ) OR EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.role_permissions rp
      ON rp.role = ur.role
     AND rp.permission_code = _permission_code
     AND (rp.company_id IS NULL OR rp.company_id = _company_id)
    WHERE ur.user_id = _user_id
      AND (ur.company_id IS NULL OR ur.company_id = _company_id)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.can_access_warehouse(
  _user_id uuid,
  _company_id uuid,
  _warehouse_id uuid,
  _operate boolean DEFAULT false
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _user_id IS DISTINCT FROM auth.uid() THEN
    RETURN false;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = 'super_admin'
  ) THEN
    RETURN true;
  END IF;

  IF public.has_permission(_user_id, _company_id, 'warehouses.manage') THEN
    RETURN true;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.user_warehouse_access uwa
    WHERE uwa.user_id = _user_id
      AND uwa.company_id = _company_id
      AND uwa.warehouse_id = _warehouse_id
      AND uwa.can_view = true
      AND (_operate = false OR uwa.can_operate = true)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.log_security_event(
  _company_id uuid,
  _action text,
  _entity text,
  _entity_id text DEFAULT NULL,
  _changes jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_id uuid;
BEGIN
  IF NOT public.is_company_member(auth.uid(), _company_id) THEN
    RAISE EXCEPTION 'Sin permisos sobre esta empresa';
  END IF;

  INSERT INTO public.audit_logs(user_id, company_id, action, entity, entity_id, changes)
  VALUES (auth.uid(), _company_id, _action, _entity, _entity_id, _changes)
  RETURNING id INTO new_id;

  RETURN new_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.can_manage_company_security(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_permission(uuid, uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_access_warehouse(uuid, uuid, uuid, boolean) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.log_security_event(uuid, text, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_company_security(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_permission(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_warehouse(uuid, uuid, uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_security_event(uuid, text, text, text, jsonb) TO authenticated;

-- Policies de administracion granular.
DROP POLICY IF EXISTS "role_permissions_select" ON public.role_permissions;
CREATE POLICY "role_permissions_select" ON public.role_permissions
  FOR SELECT TO authenticated
  USING (company_id IS NULL OR public.is_company_member(auth.uid(), company_id));

DROP POLICY IF EXISTS "role_permissions_manage" ON public.role_permissions;
CREATE POLICY "role_permissions_manage" ON public.role_permissions
  FOR ALL TO authenticated
  USING (company_id IS NOT NULL AND public.can_manage_company_security(company_id))
  WITH CHECK (company_id IS NOT NULL AND public.can_manage_company_security(company_id));

DROP POLICY IF EXISTS "user_permissions_select" ON public.user_permissions;
CREATE POLICY "user_permissions_select" ON public.user_permissions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.can_manage_company_security(company_id));

DROP POLICY IF EXISTS "user_permissions_manage" ON public.user_permissions;
CREATE POLICY "user_permissions_manage" ON public.user_permissions
  FOR ALL TO authenticated
  USING (public.can_manage_company_security(company_id))
  WITH CHECK (public.can_manage_company_security(company_id));

DROP POLICY IF EXISTS "user_warehouse_access_select" ON public.user_warehouse_access;
CREATE POLICY "user_warehouse_access_select" ON public.user_warehouse_access
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.can_manage_company_security(company_id));

DROP POLICY IF EXISTS "user_warehouse_access_manage" ON public.user_warehouse_access;
CREATE POLICY "user_warehouse_access_manage" ON public.user_warehouse_access
  FOR ALL TO authenticated
  USING (public.can_manage_company_security(company_id))
  WITH CHECK (public.can_manage_company_security(company_id));

DROP POLICY IF EXISTS "security_invitations_select" ON public.security_invitations;
CREATE POLICY "security_invitations_select" ON public.security_invitations
  FOR SELECT TO authenticated
  USING (public.can_manage_company_security(company_id) OR lower(email) = lower((auth.jwt() ->> 'email')));

DROP POLICY IF EXISTS "security_invitations_manage" ON public.security_invitations;
CREATE POLICY "security_invitations_manage" ON public.security_invitations
  FOR ALL TO authenticated
  USING (public.can_manage_company_security(company_id))
  WITH CHECK (public.can_manage_company_security(company_id));

-- Permitir administracion segura de roles y membresias existentes.
GRANT INSERT, UPDATE, DELETE ON public.user_roles TO authenticated;

DROP POLICY IF EXISTS "user_roles_manage_security" ON public.user_roles;
CREATE POLICY "user_roles_manage_security" ON public.user_roles
  FOR ALL TO authenticated
  USING (
    company_id IS NOT NULL
    AND role <> 'super_admin'
    AND public.can_manage_company_security(company_id)
  )
  WITH CHECK (
    company_id IS NOT NULL
    AND role <> 'super_admin'
    AND public.can_manage_company_security(company_id)
  );

DROP POLICY IF EXISTS "profiles_select_security" ON public.profiles;
CREATE POLICY "profiles_select_security" ON public.profiles
  FOR SELECT TO authenticated
  USING (
    auth.uid() = id
    OR EXISTS (
      SELECT 1
      FROM public.user_companies uc_self
      JOIN public.user_companies uc_target ON uc_target.company_id = uc_self.company_id
      WHERE uc_self.user_id = auth.uid()
        AND uc_target.user_id = profiles.id
        AND public.can_manage_company_security(uc_self.company_id)
    )
  );

DROP POLICY IF EXISTS "user_companies_manage_security" ON public.user_companies;
CREATE POLICY "user_companies_manage_security" ON public.user_companies
  FOR ALL TO authenticated
  USING (public.can_manage_company_security(company_id))
  WITH CHECK (public.can_manage_company_security(company_id));

-- Endurecer policy heredada: un usuario no debe poder agregarse a cualquier empresa.
DROP POLICY IF EXISTS "user_companies_insert" ON public.user_companies;
CREATE POLICY "user_companies_insert_managed" ON public.user_companies
  FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_company_security(company_id));

DROP POLICY IF EXISTS "user_companies_update" ON public.user_companies;
CREATE POLICY "user_companies_update_managed" ON public.user_companies
  FOR UPDATE TO authenticated
  USING (public.can_manage_company_security(company_id))
  WITH CHECK (public.can_manage_company_security(company_id));

DROP POLICY IF EXISTS "user_companies_delete" ON public.user_companies;
CREATE POLICY "user_companies_delete_managed" ON public.user_companies
  FOR DELETE TO authenticated
  USING (public.can_manage_company_security(company_id));

-- Semilla del catalogo de permisos.
INSERT INTO public.permissions (code, module, action, description) VALUES
  ('dashboard.view', 'dashboard', 'view', 'Ver dashboard y resumen operativo'),
  ('companies.view', 'companies', 'view', 'Ver empresas asignadas'),
  ('companies.manage', 'companies', 'manage', 'Crear y administrar empresas'),
  ('security.view', 'security', 'view', 'Ver configuracion de seguridad'),
  ('security.manage', 'security', 'manage', 'Administrar usuarios, roles y permisos'),
  ('warehouses.view', 'warehouses', 'view', 'Ver bodegas y puntos de venta'),
  ('warehouses.manage', 'warehouses', 'manage', 'Administrar bodegas y accesos'),
  ('masters.view', 'masters', 'view', 'Ver maestros de productos, terceros y catalogos'),
  ('masters.manage', 'masters', 'manage', 'Administrar maestros de productos, terceros y catalogos'),
  ('inventory.view', 'inventory', 'view', 'Ver existencias, kardex y movimientos'),
  ('inventory.operate', 'inventory', 'operate', 'Crear y confirmar movimientos de inventario'),
  ('purchases.view', 'purchases', 'view', 'Ver compras, recepciones y CxP'),
  ('purchases.operate', 'purchases', 'operate', 'Crear y aprobar compras/recepciones'),
  ('sales.view', 'sales', 'view', 'Ver ventas y CxC'),
  ('sales.operate', 'sales', 'operate', 'Crear y confirmar ventas'),
  ('pos.operate', 'pos', 'operate', 'Operar punto de venta y turnos de caja'),
  ('treasury.view', 'treasury', 'view', 'Ver tesoreria, cuentas y movimientos'),
  ('treasury.operate', 'treasury', 'operate', 'Registrar cobros, pagos y transferencias'),
  ('accounting.view', 'accounting', 'view', 'Ver contabilidad'),
  ('accounting.operate', 'accounting', 'operate', 'Crear y confirmar asientos contables'),
  ('payroll.view', 'payroll', 'view', 'Ver nomina'),
  ('payroll.operate', 'payroll', 'operate', 'Liquidar nomina'),
  ('reports.view', 'reports', 'view', 'Ver reportes e indicadores'),
  ('ai.use', 'ai', 'use', 'Usar asistente IA y alertas')
ON CONFLICT (code) DO UPDATE
SET module = EXCLUDED.module,
    action = EXCLUDED.action,
    description = EXCLUDED.description;

-- Plantillas globales de permisos por rol.
INSERT INTO public.role_permissions (role, permission_code, company_id)
SELECT 'super_admin'::public.app_role, code, NULL FROM public.permissions
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role, permission_code, company_id)
SELECT 'admin'::public.app_role, code, NULL FROM public.permissions
WHERE code <> 'companies.manage'
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role, permission_code, company_id) VALUES
  ('gerente', 'dashboard.view', NULL),
  ('gerente', 'companies.view', NULL),
  ('gerente', 'warehouses.view', NULL),
  ('gerente', 'masters.view', NULL),
  ('gerente', 'inventory.view', NULL),
  ('gerente', 'purchases.view', NULL),
  ('gerente', 'sales.view', NULL),
  ('gerente', 'treasury.view', NULL),
  ('gerente', 'accounting.view', NULL),
  ('gerente', 'payroll.view', NULL),
  ('gerente', 'reports.view', NULL),
  ('gerente', 'ai.use', NULL),
  ('contador', 'dashboard.view', NULL),
  ('contador', 'companies.view', NULL),
  ('contador', 'purchases.view', NULL),
  ('contador', 'sales.view', NULL),
  ('contador', 'treasury.view', NULL),
  ('contador', 'treasury.operate', NULL),
  ('contador', 'accounting.view', NULL),
  ('contador', 'accounting.operate', NULL),
  ('contador', 'payroll.view', NULL),
  ('contador', 'reports.view', NULL),
  ('vendedor', 'dashboard.view', NULL),
  ('vendedor', 'companies.view', NULL),
  ('vendedor', 'masters.view', NULL),
  ('vendedor', 'sales.view', NULL),
  ('vendedor', 'sales.operate', NULL),
  ('vendedor', 'pos.operate', NULL),
  ('comprador', 'dashboard.view', NULL),
  ('comprador', 'companies.view', NULL),
  ('comprador', 'masters.view', NULL),
  ('comprador', 'purchases.view', NULL),
  ('comprador', 'purchases.operate', NULL),
  ('bodeguero', 'dashboard.view', NULL),
  ('bodeguero', 'companies.view', NULL),
  ('bodeguero', 'warehouses.view', NULL),
  ('bodeguero', 'masters.view', NULL),
  ('bodeguero', 'inventory.view', NULL),
  ('bodeguero', 'inventory.operate', NULL),
  ('usuario', 'dashboard.view', NULL),
  ('usuario', 'companies.view', NULL)
ON CONFLICT DO NOTHING;
