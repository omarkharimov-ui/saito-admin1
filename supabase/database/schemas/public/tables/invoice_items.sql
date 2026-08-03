CREATE TABLE public.invoice_items (
  id                     uuid                     DEFAULT gen_random_uuid() NOT NULL,
  invoice_id             uuid                     NOT NULL,
  purchase_order_item_id uuid,
  product_name           text                     NOT NULL,
  quantity               numeric(12,3)            DEFAULT 0 NOT NULL,
  unit                   text                     DEFAULT 'gram'::text NOT NULL,
  unit_cost              numeric(12,4)            DEFAULT 0 NOT NULL,
  total_cost             numeric(12,2)            DEFAULT 0 NOT NULL,
  matched                boolean                  DEFAULT false,
  variance_quantity      numeric(12,3)            DEFAULT 0,
  variance_cost          numeric(12,2)            DEFAULT 0,
  created_at             timestamp with time zone DEFAULT now()
);

CREATE INDEX idx_invoice_items_invoice ON public.invoice_items (invoice_id);

CREATE POLICY "Authenticated users can insert invoice_items" ON public.invoice_items
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can read invoice_items" ON public.invoice_items
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can update invoice_items" ON public.invoice_items
  FOR UPDATE
  TO authenticated
  USING (true);

ALTER TABLE public.invoice_items
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.invoice_items
  ADD CONSTRAINT invoice_items_pkey PRIMARY KEY (id);

ALTER TABLE public.invoice_items
  ADD CONSTRAINT invoice_items_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.invoices(id) ON DELETE CASCADE;

ALTER TABLE public.invoice_items
  ADD CONSTRAINT invoice_items_purchase_order_item_id_fkey FOREIGN KEY (purchase_order_item_id) REFERENCES public.purchase_order_items(id) ON DELETE SET NULL;

GRANT ALL ON public.invoice_items TO anon;

GRANT ALL ON public.invoice_items TO authenticated;

GRANT ALL ON public.invoice_items TO service_role;