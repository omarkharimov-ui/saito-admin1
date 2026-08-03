CREATE TABLE public.categories (
  id            uuid                     DEFAULT gen_random_uuid() NOT NULL,
  name          text                     NOT NULL,
  slug          text                     NOT NULL,
  image_url     text,
  created_at    timestamp with time zone DEFAULT now(),
  name_az       text,
  name_en       text,
  name_ru       text,
  category_type text                     DEFAULT 'food'::text
);

CREATE POLICY auth_read_categories ON public.categories
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY categories_select_public ON public.categories
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY categories_write_admin ON public.categories
  TO authenticated
  USING (public.is_admin_staff())
  WITH CHECK (public.is_admin_staff());

CREATE POLICY categories_write_superadmin ON public.categories
  TO authenticated
  USING (public.is_superadmin())
  WITH CHECK (public.is_superadmin());

CREATE POLICY service_full_categories ON public.categories
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY auth_modify_categories ON public.categories
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM public.staff
  WHERE ((staff.id = auth.uid()) AND (staff.role = ANY (ARRAY['superadmin'::text, 'admin'::text]))))));

ALTER TABLE public.categories
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.categories
  ADD CONSTRAINT categories_name_key UNIQUE (name);

ALTER TABLE public.categories
  ADD CONSTRAINT categories_pkey PRIMARY KEY (id);

ALTER TABLE public.categories
  ADD CONSTRAINT categories_slug_key UNIQUE (slug);

GRANT ALL ON public.categories TO anon;

GRANT ALL ON public.categories TO authenticated;

GRANT ALL ON public.categories TO service_role;