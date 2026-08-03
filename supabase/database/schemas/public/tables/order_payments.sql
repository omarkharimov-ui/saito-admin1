CREATE TABLE public.order_payments (
  id                 uuid                     DEFAULT gen_random_uuid() NOT NULL,
  order_id           uuid                     NOT NULL,
  amount             numeric(12,2)            NOT NULL,
  payment_method     text                     NOT NULL,
  reference          text,
  performed_by       uuid,
  created_at         timestamp with time zone DEFAULT now(),
  method             text,
  currency           text,
  status             text,
  transaction_id     text,
  split_group_id     uuid,
  is_partial         boolean                  DEFAULT false,
  is_refund          boolean                  DEFAULT false,
  reference_order_id uuid,
  created_by         uuid
);

CREATE INDEX idx_order_payments_order ON public.order_payments (order_id);

CREATE INDEX idx_order_payments_method ON public.order_payments (payment_method);

CREATE POLICY "Allow anon read" ON public.order_payments
  FOR SELECT
  USING ((auth.role() = 'anon'::text));

CREATE POLICY "Allow service_role full access" ON public.order_payments
  USING ((auth.role() = 'service_role'::text));

CREATE POLICY order_payments_insert ON public.order_payments
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY order_payments_select ON public.order_payments
  FOR SELECT
  TO authenticated
  USING (true);

ALTER TABLE public.order_payments
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.order_payments
  ADD CONSTRAINT order_payments_pkey PRIMARY KEY (id);

ALTER TABLE public.order_payments
  ADD CONSTRAINT order_payments_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;

GRANT ALL ON public.order_payments TO anon;

GRANT ALL ON public.order_payments TO authenticated;

GRANT ALL ON public.order_payments TO service_role;