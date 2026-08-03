CREATE TABLE public.purchase_order_items (
  id                uuid                     DEFAULT gen_random_uuid() NOT NULL,
  purchase_order_id uuid                     NOT NULL,
  ingredient_id     uuid,
  product_name      text                     NOT NULL,
  quantity          numeric(10,2)            NOT NULL,
  unit              text                     NOT NULL,
  unit_cost         numeric(10,2)            NOT NULL,
  total_cost        numeric(10,2)            NOT NULL,
  received_quantity numeric(10,2)            DEFAULT 0 NOT NULL,
  created_at        timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX idx_po_items_purchase_order ON public.purchase_order_items (purchase_order_id);

CREATE INDEX idx_po_items_ingredient ON public.purchase_order_items (ingredient_id);

CREATE POLICY purchase_order_items_all ON public.purchase_order_items
  USING (true)
  WITH CHECK (true);

ALTER TABLE public.purchase_order_items
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.purchase_order_items
  ADD CONSTRAINT purchase_order_items_ingredient_id_fkey FOREIGN KEY (ingredient_id) REFERENCES public.ingredients(id) ON DELETE SET NULL;

ALTER TABLE public.purchase_order_items
  ADD CONSTRAINT purchase_order_items_pkey PRIMARY KEY (id);

ALTER TABLE public.purchase_order_items
  ADD CONSTRAINT purchase_order_items_purchase_order_id_fkey FOREIGN KEY (purchase_order_id) REFERENCES public.purchase_orders(id) ON DELETE CASCADE;

GRANT ALL ON public.purchase_order_items TO anon;

GRANT ALL ON public.purchase_order_items TO authenticated;

GRANT ALL ON public.purchase_order_items TO service_role;