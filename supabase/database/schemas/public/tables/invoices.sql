CREATE TABLE public.invoices (
  id                uuid                     DEFAULT gen_random_uuid() NOT NULL,
  supplier_id       uuid                     NOT NULL,
  purchase_order_id uuid,
  invoice_number    text                     NOT NULL,
  invoice_date      date,
  total_amount      numeric(12,2)            DEFAULT 0 NOT NULL,
  tax_amount        numeric(12,2)            DEFAULT 0,
  currency          text                     DEFAULT 'AZN'::text,
  status            text                     DEFAULT 'pending'::text NOT NULL,
  notes             text,
  ocr_raw           jsonb,
  created_at        timestamp with time zone DEFAULT now(),
  updated_at        timestamp with time zone DEFAULT now(),
  applied_at        timestamp with time zone
);

CREATE INDEX idx_invoices_supplier ON public.invoices (supplier_id);

CREATE INDEX idx_invoices_status ON public.invoices (status);

CREATE INDEX idx_invoices_po ON public.invoices (purchase_order_id);

CREATE TRIGGER trg_invoices_updated_at
  BEFORE UPDATE ON public.invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.update_invoices_updated_at();

CREATE POLICY "Authenticated users can insert invoices" ON public.invoices
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can read invoices" ON public.invoices
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can update invoices" ON public.invoices
  FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY auth_read_invoices ON public.invoices
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY service_full_invoices ON public.invoices
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY auth_modify_invoices ON public.invoices
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM public.staff
  WHERE ((staff.id = auth.uid()) AND (staff.role = ANY (ARRAY['superadmin'::text, 'admin'::text]))))));

ALTER TABLE public.invoices
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_pkey PRIMARY KEY (id);

ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_status_check
    CHECK
    (status = ANY (ARRAY['draft'::text, 'matched'::text, 'needs_review'::text, 'approved'::text, 'applied'::text, 'rejected'::text, 'rolled_back'::text,
    'partially_applied'::text]));

ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_purchase_order_id_fkey FOREIGN KEY (purchase_order_id) REFERENCES public.purchase_orders(id) ON DELETE SET NULL;

ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON DELETE CASCADE;

GRANT ALL ON public.invoices TO anon;

GRANT ALL ON public.invoices TO authenticated;

GRANT ALL ON public.invoices TO service_role;