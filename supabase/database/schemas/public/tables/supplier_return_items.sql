CREATE TABLE public.supplier_return_items (
  id                 uuid                     DEFAULT gen_random_uuid() NOT NULL,
  supplier_return_id uuid                     NOT NULL,
  ingredient_id      uuid                     NOT NULL,
  quantity           numeric(12,3)            NOT NULL,
  unit_cost          numeric(12,4)            DEFAULT 0 NOT NULL,
  total_cost         numeric(12,2)            DEFAULT 0 NOT NULL,
  reason             text,
  created_at         timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX idx_supplier_return_items_return ON public.supplier_return_items (supplier_return_id);

CREATE POLICY supplier_return_items_insert ON public.supplier_return_items
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY supplier_return_items_select ON public.supplier_return_items
  FOR SELECT
  USING (true);

CREATE POLICY supplier_return_items_update ON public.supplier_return_items
  FOR UPDATE
  USING (true);

ALTER TABLE public.supplier_return_items
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.supplier_return_items
  ADD CONSTRAINT supplier_return_items_ingredient_id_fkey FOREIGN KEY (ingredient_id) REFERENCES public.ingredients(id) ON DELETE RESTRICT;

ALTER TABLE public.supplier_return_items
  ADD CONSTRAINT supplier_return_items_pkey PRIMARY KEY (id);

ALTER TABLE public.supplier_return_items
  ADD CONSTRAINT supplier_return_items_quantity_check CHECK (quantity > 0::numeric);

ALTER TABLE public.supplier_return_items
  ADD CONSTRAINT supplier_return_items_supplier_return_id_fkey FOREIGN KEY (supplier_return_id) REFERENCES public.supplier_returns(id) ON DELETE CASCADE;

GRANT ALL ON public.supplier_return_items TO anon;

GRANT ALL ON public.supplier_return_items TO authenticated;

GRANT ALL ON public.supplier_return_items TO service_role;