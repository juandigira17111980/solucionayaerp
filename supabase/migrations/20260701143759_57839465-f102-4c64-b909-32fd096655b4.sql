
-- =====================================================
-- SOLUCIONA YA ERP - Fase 1: Fundaciones
-- =====================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

-- Enums
CREATE TYPE public.app_role AS ENUM (
  'super_admin', 'admin', 'gerente', 'contador',
  'vendedor', 'comprador', 'bodeguero', 'usuario'
);
CREATE TYPE public.warehouse_type AS ENUM ('bodega', 'centro_distribucion', 'punto_venta');
CREATE TYPE public.third_party_kind AS ENUM ('cliente', 'proveedor', 'vendedor', 'empleado', 'otro');
CREATE TYPE public.document_type AS ENUM ('NIT', 'CC', 'CE', 'PP', 'TI', 'RUT', 'OTRO');

-- =========== user_roles (first, needed by has_role) ===========
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  company_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role, company_id)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE POLICY "user_roles_select" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

-- =========== profiles ===========
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  email TEXT,
  avatar_url TEXT,
  phone TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_select" ON public.profiles FOR SELECT TO authenticated
  USING (auth.uid() = id OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "profiles_insert_self" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE TO authenticated
  USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE TRIGGER trg_profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data ->> 'full_name', split_part(NEW.email, '@', 1)));
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =========== companies ===========
CREATE TABLE public.companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tax_id TEXT NOT NULL UNIQUE,
  legal_name TEXT NOT NULL,
  trade_name TEXT,
  address TEXT,
  phone TEXT,
  email TEXT,
  currency_code TEXT NOT NULL DEFAULT 'COP',
  logo_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.companies TO authenticated;
GRANT ALL ON public.companies TO service_role;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.user_companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, company_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_companies TO authenticated;
GRANT ALL ON public.user_companies TO service_role;
ALTER TABLE public.user_companies ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_company_member(_user_id UUID, _company_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_companies WHERE user_id = _user_id AND company_id = _company_id)
    OR public.has_role(_user_id, 'super_admin');
$$;

CREATE POLICY "companies_select_members" ON public.companies FOR SELECT TO authenticated
  USING (public.is_company_member(auth.uid(), id));
CREATE POLICY "companies_insert" ON public.companies FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'super_admin')
    OR NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role IN ('super_admin','admin'))
  );
CREATE POLICY "companies_update_admin" ON public.companies FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "companies_delete_super_admin" ON public.companies FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "user_companies_select" ON public.user_companies FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "user_companies_insert" ON public.user_companies FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'super_admin')
    OR user_id = auth.uid()
  );
CREATE POLICY "user_companies_update" ON public.user_companies FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'super_admin')
    OR user_id = auth.uid()
  );
CREATE POLICY "user_companies_delete" ON public.user_companies FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

CREATE TRIGGER trg_companies_updated_at BEFORE UPDATE ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.bootstrap_first_admin()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (SELECT COUNT(*) FROM public.user_roles WHERE role IN ('super_admin', 'admin')) = 0 THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (auth.uid(), 'super_admin')
      ON CONFLICT DO NOTHING;
  END IF;
  INSERT INTO public.user_companies (user_id, company_id, is_default)
    VALUES (auth.uid(), NEW.id, true) ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_companies_bootstrap AFTER INSERT ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.bootstrap_first_admin();

-- =========== geografía ===========
CREATE TABLE public.countries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.countries TO authenticated;
GRANT ALL ON public.countries TO service_role;
ALTER TABLE public.countries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "countries_read" ON public.countries FOR SELECT TO authenticated USING (true);
CREATE POLICY "countries_write" ON public.countries FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));

CREATE TABLE public.departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country_id UUID NOT NULL REFERENCES public.countries(id) ON DELETE CASCADE,
  code TEXT,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (country_id, name)
);
GRANT SELECT ON public.departments TO authenticated;
GRANT ALL ON public.departments TO service_role;
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "departments_read" ON public.departments FOR SELECT TO authenticated USING (true);
CREATE POLICY "departments_write" ON public.departments FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));

CREATE TABLE public.cities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id UUID NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  code TEXT,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (department_id, name)
);
GRANT SELECT ON public.cities TO authenticated;
GRANT ALL ON public.cities TO service_role;
ALTER TABLE public.cities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cities_read" ON public.cities FOR SELECT TO authenticated USING (true);
CREATE POLICY "cities_write" ON public.cities FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));

-- =========== bodegas ===========
CREATE TABLE public.warehouses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  warehouse_type public.warehouse_type NOT NULL DEFAULT 'bodega',
  address TEXT,
  city_id UUID REFERENCES public.cities(id),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, code)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.warehouses TO authenticated;
GRANT ALL ON public.warehouses TO service_role;
ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "warehouses_select" ON public.warehouses FOR SELECT TO authenticated
  USING (public.is_company_member(auth.uid(), company_id));
CREATE POLICY "warehouses_write" ON public.warehouses FOR ALL TO authenticated
  USING (public.is_company_member(auth.uid(), company_id))
  WITH CHECK (public.is_company_member(auth.uid(), company_id));
CREATE TRIGGER trg_warehouses_updated_at BEFORE UPDATE ON public.warehouses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========== maestros producto ===========
CREATE TABLE public.product_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES public.product_categories(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  code TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_categories TO authenticated;
GRANT ALL ON public.product_categories TO service_role;
ALTER TABLE public.product_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cat_select" ON public.product_categories FOR SELECT TO authenticated
  USING (public.is_company_member(auth.uid(), company_id));
CREATE POLICY "cat_write" ON public.product_categories FOR ALL TO authenticated
  USING (public.is_company_member(auth.uid(), company_id))
  WITH CHECK (public.is_company_member(auth.uid(), company_id));
CREATE TRIGGER trg_cat_updated_at BEFORE UPDATE ON public.product_categories
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.brands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.brands TO authenticated;
GRANT ALL ON public.brands TO service_role;
ALTER TABLE public.brands ENABLE ROW LEVEL SECURITY;
CREATE POLICY "brands_select" ON public.brands FOR SELECT TO authenticated
  USING (public.is_company_member(auth.uid(), company_id));
CREATE POLICY "brands_write" ON public.brands FOR ALL TO authenticated
  USING (public.is_company_member(auth.uid(), company_id))
  WITH CHECK (public.is_company_member(auth.uid(), company_id));
CREATE TRIGGER trg_brands_updated_at BEFORE UPDATE ON public.brands
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.units_of_measure (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  symbol TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.units_of_measure TO authenticated;
GRANT ALL ON public.units_of_measure TO service_role;
ALTER TABLE public.units_of_measure ENABLE ROW LEVEL SECURITY;
CREATE POLICY "uom_read" ON public.units_of_measure FOR SELECT TO authenticated USING (true);
CREATE POLICY "uom_write" ON public.units_of_measure FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));

CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  sku TEXT NOT NULL,
  barcode TEXT,
  name TEXT NOT NULL,
  description TEXT,
  category_id UUID REFERENCES public.product_categories(id) ON DELETE SET NULL,
  brand_id UUID REFERENCES public.brands(id) ON DELETE SET NULL,
  uom_id UUID REFERENCES public.units_of_measure(id) ON DELETE SET NULL,
  cost_price NUMERIC(18,4) NOT NULL DEFAULT 0,
  sale_price NUMERIC(18,4) NOT NULL DEFAULT 0,
  tax_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
  min_stock NUMERIC(18,4) NOT NULL DEFAULT 0,
  max_stock NUMERIC(18,4),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, sku)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "products_select" ON public.products FOR SELECT TO authenticated
  USING (public.is_company_member(auth.uid(), company_id));
CREATE POLICY "products_write" ON public.products FOR ALL TO authenticated
  USING (public.is_company_member(auth.uid(), company_id))
  WITH CHECK (public.is_company_member(auth.uid(), company_id));
CREATE TRIGGER trg_products_updated_at BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_products_company_active ON public.products(company_id, is_active);
CREATE INDEX idx_products_name_trgm ON public.products USING gin (name gin_trgm_ops);

-- =========== terceros ===========
CREATE TABLE public.third_parties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  document_type public.document_type NOT NULL DEFAULT 'NIT',
  document_number TEXT NOT NULL,
  legal_name TEXT NOT NULL,
  trade_name TEXT,
  is_client BOOLEAN NOT NULL DEFAULT false,
  is_supplier BOOLEAN NOT NULL DEFAULT false,
  is_vendor BOOLEAN NOT NULL DEFAULT false,
  is_employee BOOLEAN NOT NULL DEFAULT false,
  email TEXT,
  phone TEXT,
  address TEXT,
  city_id UUID REFERENCES public.cities(id),
  credit_limit NUMERIC(18,2) NOT NULL DEFAULT 0,
  payment_terms_days INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, document_type, document_number)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.third_parties TO authenticated;
GRANT ALL ON public.third_parties TO service_role;
ALTER TABLE public.third_parties ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tp_select" ON public.third_parties FOR SELECT TO authenticated
  USING (public.is_company_member(auth.uid(), company_id));
CREATE POLICY "tp_write" ON public.third_parties FOR ALL TO authenticated
  USING (public.is_company_member(auth.uid(), company_id))
  WITH CHECK (public.is_company_member(auth.uid(), company_id));
CREATE TRIGGER trg_tp_updated_at BEFORE UPDATE ON public.third_parties
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_third_parties_company ON public.third_parties(company_id);

-- =========== auditoría ===========
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT,
  changes JSONB,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit_select_admin" ON public.audit_logs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));
CREATE POLICY "audit_insert_self" ON public.audit_logs FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE INDEX idx_audit_company_created ON public.audit_logs(company_id, created_at DESC);

-- =========== semillas ===========
INSERT INTO public.countries (code, name) VALUES
  ('CO','Colombia'), ('MX','México'), ('PE','Perú'), ('EC','Ecuador'),
  ('CL','Chile'), ('AR','Argentina'), ('ES','España'), ('US','Estados Unidos')
ON CONFLICT DO NOTHING;

INSERT INTO public.departments (country_id, code, name)
SELECT c.id, d.code, d.name FROM public.countries c
CROSS JOIN (VALUES
  ('05','Antioquia'), ('08','Atlántico'), ('11','Bogotá D.C.'), ('13','Bolívar'),
  ('15','Boyacá'), ('17','Caldas'), ('19','Cauca'), ('20','Cesar'),
  ('23','Córdoba'), ('25','Cundinamarca'), ('27','Chocó'), ('41','Huila'),
  ('44','La Guajira'), ('47','Magdalena'), ('50','Meta'), ('52','Nariño'),
  ('54','Norte de Santander'), ('63','Quindío'), ('66','Risaralda'),
  ('68','Santander'), ('70','Sucre'), ('73','Tolima'), ('76','Valle del Cauca')
) AS d(code, name)
WHERE c.code = 'CO'
ON CONFLICT DO NOTHING;

INSERT INTO public.cities (department_id, name)
SELECT d.id, c.name FROM public.departments d
JOIN (VALUES
  ('Antioquia','Medellín'), ('Antioquia','Bello'), ('Antioquia','Envigado'),
  ('Atlántico','Barranquilla'), ('Atlántico','Soledad'),
  ('Bogotá D.C.','Bogotá'), ('Bolívar','Cartagena'),
  ('Cundinamarca','Soacha'), ('Cundinamarca','Chía'), ('Cundinamarca','Zipaquirá'),
  ('Valle del Cauca','Cali'), ('Valle del Cauca','Palmira'), ('Valle del Cauca','Buenaventura'),
  ('Santander','Bucaramanga'), ('Santander','Floridablanca'),
  ('Norte de Santander','Cúcuta'), ('Risaralda','Pereira'),
  ('Caldas','Manizales'), ('Quindío','Armenia'), ('Tolima','Ibagué'),
  ('Huila','Neiva'), ('Meta','Villavicencio'), ('Nariño','Pasto'),
  ('Cauca','Popayán'), ('Magdalena','Santa Marta'), ('Córdoba','Montería')
) AS c(dept, name) ON d.name = c.dept
ON CONFLICT DO NOTHING;

INSERT INTO public.units_of_measure (code, name, symbol) VALUES
  ('UND','Unidad','und'), ('KG','Kilogramo','kg'), ('G','Gramo','g'),
  ('LT','Litro','L'), ('ML','Mililitro','ml'), ('MT','Metro','m'),
  ('CM','Centímetro','cm'), ('CJ','Caja','cj'), ('PQ','Paquete','pq'),
  ('DOC','Docena','doc'), ('PAR','Par','par'), ('SVC','Servicio','svc')
ON CONFLICT DO NOTHING;
