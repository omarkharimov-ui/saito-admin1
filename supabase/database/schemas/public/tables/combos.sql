CREATE TABLE public.combos (
  id             uuid                     DEFAULT gen_random_uuid() NOT NULL,
  name           text                     NOT NULL,
  description    text,
  price          numeric(10,2)            DEFAULT 0 NOT NULL,
  discount_price numeric(10,2),
  image_url      text,
  is_in_stock    boolean                  DEFAULT true,
  is_active      boolean                  DEFAULT true,
  views_count    integer                  DEFAULT 0,
  translations   jsonb,
  created_at     timestamp with time zone DEFAULT now(),
  description_az text,
  description_ru text,
  description_en text,
  name_az        text,
  name_ru        text,
  name_en        text,
  updated_at     timestamp with time zone DEFAULT now(),
  category_id    uuid
);

CREATE TRIGGER update_combos_updated_at
  BEFORE UPDATE ON public.combos
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY combos_select_public ON public.combos
  FOR SELECT
  TO anon, authenticated
  USING (((COALESCE(is_active, true) = true) AND (COALESCE(is_in_stock, true) = true)));

CREATE POLICY combos_select_staff ON public.combos
  FOR SELECT
  TO authenticated
  USING (public.is_any_staff());

CREATE POLICY combos_write_staff ON public.combos
  TO authenticated
  USING (public.is_admin_staff())
  WITH CHECK (public.is_admin_staff());

CREATE POLICY combos_write_superadmin ON public.combos
  TO authenticated
  USING (public.is_superadmin())
  WITH CHECK (public.is_superadmin());

ALTER TABLE public.combos
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.combos
  ADD CONSTRAINT combos_pkey PRIMARY KEY (id);

GRANT ALL ON public.combos TO anon;

GRANT ALL ON public.combos TO authenticated;

GRANT ALL ON public.combos TO service_role;