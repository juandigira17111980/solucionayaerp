
ALTER TABLE public.third_parties
  ADD COLUMN IF NOT EXISTS tax_id text GENERATED ALWAYS AS (document_number) STORED;

ALTER TABLE public.third_parties
  ADD COLUMN IF NOT EXISTS kind text GENERATED ALWAYS AS (
    CASE
      WHEN is_client AND is_supplier THEN 'ambos'
      WHEN is_client THEN 'cliente'
      WHEN is_supplier THEN 'proveedor'
      WHEN is_employee THEN 'empleado'
      WHEN is_vendor THEN 'vendedor'
      ELSE 'otro'
    END
  ) STORED;

NOTIFY pgrst, 'reload schema';
