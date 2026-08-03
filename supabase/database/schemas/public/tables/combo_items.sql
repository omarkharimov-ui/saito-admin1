CREATE TABLE public.combo_items (
  id         uuid                     DEFAULT gen_random_uuid() NOT NULL,
  combo_id   uuid                     NOT NULL,
  product_id uuid                     NOT NULL,
  quantity   integer                  DEFAULT 1 NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  variant_id uuid
);

CREATE INDEX idx_combo_items_product_id ON public.combo_items (product_id);

CREATE INDEX idx_combo_items_combo_id ON public.combo_items (combo_id);

CREATE POLICY combo_items_delete ON public.combo_items
  FOR DELETE
  USING (true);

CREATE POLICY combo_items_insert ON public.combo_items
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY combo_items_select ON public.combo_items
  FOR SELECT
  USING (true);

CREATE POLICY combo_items_select_public ON public.combo_items
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY combo_items_update ON public.combo_items
  FOR UPDATE
  USING (true);

CREATE POLICY combo_items_write_superadmin ON public.combo_items
  TO authenticated
  USING (public.is_superadmin())
  WITH CHECK (public.is_superadmin());

ALTER TABLE public.combo_items
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.combo_items
  ADD CONSTRAINT combo_items_pkey PRIMARY KEY (id);

ALTER TABLE public.combo_items
  ADD CONSTRAINT combo_items_combo_id_fkey FOREIGN KEY (combo_id) REFERENCES public.combos(id) ON DELETE CASCADE;

ALTER TABLE public.combo_items
  ADD CONSTRAINT combo_items_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES public.product_variants(id) ON DELETE SET NULL;

ALTER TABLE public.combo_items
  ADD CONSTRAINT combo_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;

GRANT ALL ON public.combo_items TO anon;

GRANT ALL ON public.combo_items TO authenticated;

GRANT ALL ON public.combo_items TO service_role;