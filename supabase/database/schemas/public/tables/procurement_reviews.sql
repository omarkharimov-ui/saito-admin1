CREATE TABLE public.procurement_reviews (
  id                      uuid                     DEFAULT gen_random_uuid() NOT NULL,
  purchase_order_id       uuid,
  invoice_id              uuid,
  product_name            text                     NOT NULL,
  quantity                numeric(12,3)            DEFAULT 0,
  unit                    text                     DEFAULT 'gram'::text,
  unit_cost               numeric(12,4)            DEFAULT 0,
  suggested_ingredient_id uuid,
  match_confidence        numeric(4,2),
  status                  text                     DEFAULT 'pending'::text NOT NULL,
  notes                   text,
  created_at              timestamp with time zone DEFAULT now(),
  severity                text                     DEFAULT 'medium'::text NOT NULL
);

CREATE INDEX idx_procurement_reviews_po ON public.procurement_reviews (purchase_order_id);

CREATE INDEX idx_procurement_reviews_status ON public.procurement_reviews (status);

CREATE POLICY "Authenticated full access procurement_reviews" ON public.procurement_reviews
  TO authenticated
  USING (true)
  WITH CHECK (true);

ALTER TABLE public.procurement_reviews
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.procurement_reviews
  ADD CONSTRAINT procurement_reviews_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.invoices(id) ON DELETE SET NULL;

ALTER TABLE public.procurement_reviews
  ADD CONSTRAINT procurement_reviews_pkey PRIMARY KEY (id);

ALTER TABLE public.procurement_reviews
  ADD CONSTRAINT procurement_reviews_severity_check CHECK (severity = ANY (ARRAY['critical'::text, 'high'::text, 'medium'::text, 'low'::text]));

ALTER TABLE public.procurement_reviews
  ADD CONSTRAINT procurement_reviews_status_check CHECK (status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'mapped'::text, 'rolled_back'::text]));

ALTER TABLE public.procurement_reviews
  ADD CONSTRAINT procurement_reviews_suggested_ingredient_id_fkey FOREIGN KEY (suggested_ingredient_id) REFERENCES public.ingredients(id) ON DELETE SET NULL;

ALTER TABLE public.procurement_reviews
  ADD CONSTRAINT procurement_reviews_purchase_order_id_fkey FOREIGN KEY (purchase_order_id) REFERENCES public.purchase_orders(id) ON DELETE SET NULL;

GRANT ALL ON public.procurement_reviews TO anon;

GRANT ALL ON public.procurement_reviews TO authenticated;

GRANT ALL ON public.procurement_reviews TO service_role;