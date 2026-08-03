CREATE TABLE public.suppliers (
  id                    uuid                     DEFAULT gen_random_uuid() NOT NULL,
  name                  text                     NOT NULL,
  contact_person        text,
  phone                 text,
  email                 text,
  address               text,
  tax_id                text,
  notes                 text,
  status                text                     DEFAULT 'active'::text NOT NULL,
  score                 integer,
  total_orders          integer                  DEFAULT 0 NOT NULL,
  on_time_delivery_rate numeric(5,2),
  avg_price_stability   numeric(5,2),
  created_at            timestamp with time zone DEFAULT now() NOT NULL,
  updated_at            timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX idx_suppliers_name ON public.suppliers (name);

CREATE INDEX idx_suppliers_status ON public.suppliers (status);

CREATE TRIGGER trg_suppliers_updated_at
  BEFORE UPDATE ON public.suppliers
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY auth_modify_suppliers ON public.suppliers
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM public.staff
  WHERE ((staff.id = auth.uid()) AND (staff.role = ANY (ARRAY['superadmin'::text, 'admin'::text]))))));

CREATE POLICY auth_read_suppliers ON public.suppliers
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY service_full_suppliers ON public.suppliers
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY suppliers_all ON public.suppliers
  USING (true)
  WITH CHECK (true);

ALTER TABLE public.suppliers
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.suppliers
  ADD CONSTRAINT suppliers_pkey PRIMARY KEY (id);

ALTER TABLE public.suppliers
  ADD CONSTRAINT suppliers_status_check CHECK (status = ANY (ARRAY['active'::text, 'inactive'::text]));

GRANT ALL ON public.suppliers TO anon;

GRANT ALL ON public.suppliers TO authenticated;

GRANT ALL ON public.suppliers TO service_role;