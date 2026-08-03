CREATE TABLE public.product_modifiers (
  id           uuid                     DEFAULT gen_random_uuid() NOT NULL,
  product_id   uuid                     NOT NULL,
  name         text                     NOT NULL,
  price        numeric(10,2)            DEFAULT 0 NOT NULL,
  is_available boolean                  DEFAULT true,
  translations jsonb,
  created_at   timestamp with time zone DEFAULT now(),
  name_az      text,
  name_en      text,
  name_ru      text
);

CREATE POLICY product_modifiers_select_public ON public.product_modifiers
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY product_modifiers_write_staff ON public.product_modifiers
  TO authenticated
  USING (public.is_admin_staff())
  WITH CHECK (public.is_admin_staff());

CREATE POLICY product_modifiers_write_superadmin ON public.product_modifiers
  TO authenticated
  USING (public.is_superadmin())
  WITH CHECK (public.is_superadmin());

ALTER TABLE public.product_modifiers
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.product_modifiers
  ADD CONSTRAINT product_modifiers_pkey PRIMARY KEY (id);

ALTER TABLE public.product_modifiers
  ADD CONSTRAINT product_modifiers_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;

GRANT ALL ON public.product_modifiers TO anon;

GRANT ALL ON public.product_modifiers TO authenticated;

GRANT ALL ON public.product_modifiers TO service_role;