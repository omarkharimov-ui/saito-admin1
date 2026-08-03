CREATE TABLE public.stock_count_items (
  id             uuid                     DEFAULT gen_random_uuid() NOT NULL,
  stock_count_id uuid                     NOT NULL,
  ingredient_id  uuid                     NOT NULL,
  system_qty     numeric(12,3)            NOT NULL,
  actual_qty     numeric(12,3)            NOT NULL,
  variance       numeric(12,3)            DEFAULT 0 NOT NULL,
  unit_cost      numeric(12,4),
  variance_cost  numeric(12,2)            DEFAULT 0,
  notes          text,
  created_at     timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX idx_stock_count_items_count ON public.stock_count_items (stock_count_id);

CREATE INDEX idx_stock_count_items_ingredient ON public.stock_count_items (ingredient_id);

CREATE POLICY stock_count_items_delete ON public.stock_count_items
  FOR DELETE
  USING (true);

CREATE POLICY stock_count_items_insert ON public.stock_count_items
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY stock_count_items_select ON public.stock_count_items
  FOR SELECT
  USING (true);

CREATE POLICY stock_count_items_update ON public.stock_count_items
  FOR UPDATE
  USING (true);

ALTER TABLE public.stock_count_items
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.stock_count_items
  ADD CONSTRAINT stock_count_items_actual_qty_check CHECK (actual_qty >= 0::numeric);

ALTER TABLE public.stock_count_items
  ADD CONSTRAINT stock_count_items_ingredient_id_fkey FOREIGN KEY (ingredient_id) REFERENCES public.ingredients(id) ON DELETE RESTRICT;

ALTER TABLE public.stock_count_items
  ADD CONSTRAINT stock_count_items_pkey PRIMARY KEY (id);

ALTER TABLE public.stock_count_items
  ADD CONSTRAINT stock_count_items_stock_count_id_fkey FOREIGN KEY (stock_count_id) REFERENCES public.stock_counts(id) ON DELETE CASCADE;

GRANT ALL ON public.stock_count_items TO anon;

GRANT ALL ON public.stock_count_items TO authenticated;

GRANT ALL ON public.stock_count_items TO service_role;