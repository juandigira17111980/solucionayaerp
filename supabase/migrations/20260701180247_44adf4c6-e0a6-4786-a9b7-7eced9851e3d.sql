
CREATE OR REPLACE FUNCTION public.admin_create_demo_company_for_user(_user_id uuid, _legal_name text, _tax_id text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_co uuid;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', _user_id::text, 'role', 'authenticated')::text, true);

  INSERT INTO public.companies (tax_id, legal_name, trade_name, address, phone, email, created_by)
  VALUES (_tax_id, _legal_name, _legal_name, 'Cra 10 #20-30, Bogotá', '+57 300 000 0000', 'demo@solucionaya.co', _user_id)
  RETURNING id INTO new_co;

  INSERT INTO public.user_companies (user_id, company_id, is_default)
  VALUES (_user_id, new_co, true) ON CONFLICT DO NOTHING;

  INSERT INTO public.user_roles (user_id, company_id, role)
  VALUES (_user_id, new_co, 'super_admin'::app_role) ON CONFLICT DO NOTHING;

  RETURN new_co;
END; $$;

REVOKE ALL ON FUNCTION public.admin_create_demo_company_for_user(uuid, text, text) FROM PUBLIC, anon, authenticated;
