CREATE TABLE public.purchase_orders (
  id           uuid                     DEFAULT gen_random_uuid() NOT NULL,
  supplier_id  uuid                     NOT NULL,
  order_number text                     NOT NULL,
  status       text                     DEFAULT 'draft'::text NOT NULL,
  total_amount numeric(10,2)            DEFAULT 0 NOT NULL,
  notes        text,
  ordered_at   timestamp with time zone DEFAULT now() NOT NULL,
  received_at  timestamp with time zone,
  created_at   timestamp with time zone DEFAULT now() NOT NULL,
  updated_at   timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX idx_purchase_orders_supplier ON public.purchase_orders (supplier_id);

CREATE INDEX idx_purchase_orders_status ON public.purchase_orders (status);

CREATE INDEX idx_purchase_orders_number ON public.purchase_orders (order_number);

CREATE TRIGGER trg_purchase_orders_updated_at
  BEFORE UPDATE ON public.purchase_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY auth_read_purchase_orders ON public.purchase_orders
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY purchase_orders_all ON public.purchase_orders
  USING (true)
  WITH CHECK (true);

CREATE POLICY service_full_purchase_orders ON public.purchase_orders
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY auth_modify_purchase_orders ON public.purchase_orders
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM public.staff
  WHERE ((staff.id = auth.uid()) AND (staff.role = ANY (ARRAY['superadmin'::text, 'admin'::text]))))));

ALTER TABLE public.purchase_orders
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.purchase_orders
  ADD CONSTRAINT purchase_orders_pkey PRIMARY KEY (id);

ALTER TABLE public.purchase_orders
  ADD CONSTRAINT purchase_orders_status_check CHECK (status = ANY (ARRAY['draft'::text, 'sent'::text, 'partial'::text, 'received'::text, 'cancelled'::text]));

ALTER TABLE public.purchase_orders
  ADD CONSTRAINT purchase_orders_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON DELETE CASCADE;

GRANT ALL ON public.purchase_orders TO anon;

GRANT ALL ON public.purchase_orders TO authenticated;

GRANT ALL ON public.purchase_orders TO service_role;