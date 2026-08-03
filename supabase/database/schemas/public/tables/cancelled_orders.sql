CREATE TABLE public.cancelled_orders (
  id           uuid                     DEFAULT gen_random_uuid() NOT NULL,
  order_id     uuid,
  table_number integer,
  total_amount numeric(10,2)            DEFAULT 0 NOT NULL,
  reason       character varying(50)    NOT NULL,
  reason_text  character varying(255),
  items        jsonb,
  created_at   timestamp with time zone DEFAULT now()
);

CREATE POLICY auth_read_cancelled_orders ON public.cancelled_orders
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY cancelled_orders_insert_staff ON public.cancelled_orders
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin_staff());

CREATE POLICY cancelled_orders_select_staff ON public.cancelled_orders
  FOR SELECT
  TO authenticated
  USING (public.is_admin_staff());

CREATE POLICY service_full_cancelled_orders ON public.cancelled_orders
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY auth_modify_cancelled_orders ON public.cancelled_orders
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM public.staff
  WHERE ((staff.id = auth.uid()) AND (staff.role = ANY (ARRAY['superadmin'::text, 'admin'::text, 'cashier'::text, 'kitchen'::text]))))));

ALTER TABLE public.cancelled_orders
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.cancelled_orders
  ADD CONSTRAINT cancelled_orders_pkey PRIMARY KEY (id);

ALTER TABLE public.cancelled_orders
  ADD CONSTRAINT cancelled_orders_reason_check
    CHECK
    (reason::text = ANY (ARRAY['customer_refused'::character varying::text, 'quality_issue'::character varying::text, 'delay'::character varying::text, 'wrong_order'::character
    varying::text, 'other'::character varying::text]));

ALTER TABLE public.cancelled_orders
  ADD CONSTRAINT cancelled_orders_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;

GRANT ALL ON public.cancelled_orders TO anon;

GRANT ALL ON public.cancelled_orders TO authenticated;

GRANT ALL ON public.cancelled_orders TO service_role;