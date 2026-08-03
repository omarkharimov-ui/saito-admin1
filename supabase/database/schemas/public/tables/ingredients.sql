CREATE TABLE public.ingredients (
  id                    uuid                     DEFAULT gen_random_uuid() NOT NULL,
  name                  text                     NOT NULL,
  unit                  text                     NOT NULL,
  min_limit             numeric(10,2)            DEFAULT 5.00 NOT NULL,
  created_at            timestamp with time zone DEFAULT now() NOT NULL,
  current_stock         numeric(12,3)            DEFAULT 0 NOT NULL,
  critical_limit        numeric(12,3)            DEFAULT 500 NOT NULL,
  average_cost_per_unit numeric(10,4)            DEFAULT 0 NOT NULL,
  updated_at            timestamp with time zone DEFAULT now() NOT NULL,
  purchase_price        numeric                  DEFAULT 0,
  waste_percentage      numeric                  DEFAULT 0,
  cold_waste_percentage numeric                  DEFAULT 0,
  theoretical_stock     numeric                  DEFAULT 0,
  supplier_id           uuid
);

CREATE INDEX idx_ingredients_critical ON public.ingredients (critical_limit)
  WHERE critical_limit > 0::numeric;

CREATE INDEX idx_ingredients_name ON public.ingredients (name);

CREATE INDEX idx_ingredients_supplier ON public.ingredients (supplier_id);

CREATE TRIGGER trg_recalculate_costs
  AFTER UPDATE OF average_cost_per_unit ON public.ingredients
  FOR EACH ROW
  WHEN (old.average_cost_per_unit IS DISTINCT FROM new.average_cost_per_unit)
  EXECUTE FUNCTION public.recalculate_product_costs();

CREATE POLICY auth_read_ingredients ON public.ingredients
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY inv_ingredients_all ON public.ingredients
  USING (true)
  WITH CHECK (true);

CREATE POLICY service_full_ingredients ON public.ingredients
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY service_role_full_ingredients ON public.ingredients
  USING (true)
  WITH CHECK (true);

CREATE POLICY service_role_ingredients ON public.ingredients
  USING (true)
  WITH CHECK (true);

CREATE POLICY auth_modify_ingredients ON public.ingredients
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM public.staff
  WHERE ((staff.id = auth.uid()) AND (staff.role = ANY (ARRAY['superadmin'::text, 'admin'::text]))))));

ALTER TABLE public.ingredients
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.ingredients
  ADD CONSTRAINT ingredients_pkey PRIMARY KEY (id);

ALTER TABLE public.ingredients
  ADD CONSTRAINT ingredients_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON DELETE SET NULL;

GRANT ALL ON public.ingredients TO anon;

GRANT ALL ON public.ingredients TO authenticated;

GRANT ALL ON public.ingredients TO service_role;