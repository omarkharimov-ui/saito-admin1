CREATE TABLE public.campaign_products (
  campaign_id uuid                     NOT NULL,
  product_id  uuid                     NOT NULL,
  created_at  timestamp with time zone DEFAULT now() NOT NULL
);

CREATE POLICY campaign_products_select_public ON public.campaign_products
  FOR SELECT
  USING (true);

CREATE POLICY campaign_products_write_admin ON public.campaign_products
  TO authenticated
  USING (public.is_admin_staff())
  WITH CHECK (public.is_admin_staff());

CREATE POLICY service_full_campaign_products ON public.campaign_products
  TO service_role
  USING (true)
  WITH CHECK (true);

ALTER TABLE public.campaign_products
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.campaign_products
  ADD CONSTRAINT campaign_products_pkey PRIMARY KEY (campaign_id, product_id);

ALTER TABLE public.campaign_products
  ADD CONSTRAINT campaign_products_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id) ON DELETE CASCADE;

ALTER TABLE public.campaign_products
  ADD CONSTRAINT campaign_products_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;

GRANT ALL ON public.campaign_products TO anon;

GRANT ALL ON public.campaign_products TO authenticated;

GRANT ALL ON public.campaign_products TO service_role;