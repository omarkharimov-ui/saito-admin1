CREATE TABLE public.product_variants (
  id                uuid                     DEFAULT extensions.uuid_generate_v4() NOT NULL,
  product_id        uuid,
  name              text                     NOT NULL,
  price             numeric(10,2)            NOT NULL,
  discount_price    numeric(10,2),
  image_url         text,
  is_default        boolean                  DEFAULT false,
  created_at        timestamp with time zone DEFAULT now(),
  variant_type      text,
  description       text,
  ingredients       text,
  is_special        boolean                  DEFAULT false NOT NULL,
  is_spicy          boolean                  DEFAULT false NOT NULL,
  parent_variant_id uuid,
  translations      jsonb,
  is_in_stock       boolean                  DEFAULT true,
  views_count       integer                  DEFAULT 0,
  name_az           text,
  name_en           text,
  name_ru           text
);

CREATE POLICY product_variants_select_public ON public.product_variants
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY product_variants_write_staff ON public.product_variants
  TO authenticated
  USING (public.is_admin_staff())
  WITH CHECK (public.is_admin_staff());

CREATE POLICY product_variants_write_superadmin ON public.product_variants
  TO authenticated
  USING (public.is_superadmin())
  WITH CHECK (public.is_superadmin());

ALTER TABLE public.product_variants
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.product_variants
  ADD CONSTRAINT product_variants_pkey PRIMARY KEY (id);

ALTER TABLE public.product_variants
  ADD CONSTRAINT product_variants_parent_variant_id_fkey FOREIGN KEY (parent_variant_id) REFERENCES public.product_variants(id) ON DELETE CASCADE;

ALTER TABLE public.product_variants
  ADD CONSTRAINT product_variants_variant_type_check CHECK (variant_type = ANY (ARRAY['olcu'::text, 'nov'::text]));

ALTER TABLE public.product_variants
  ADD CONSTRAINT product_variants_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;

GRANT ALL ON public.product_variants TO anon;

GRANT ALL ON public.product_variants TO authenticated;

GRANT ALL ON public.product_variants TO service_role;