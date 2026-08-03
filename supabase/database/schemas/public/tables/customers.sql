CREATE TABLE public.customers (
  id            uuid                     DEFAULT gen_random_uuid() NOT NULL,
  name          text                     NOT NULL,
  phone         text,
  total_visits  integer                  DEFAULT 1,
  total_spent   numeric                  DEFAULT 0,
  last_order_at timestamp with time zone,
  created_at    timestamp with time zone DEFAULT now()
);

CREATE POLICY customers_insert_staff ON public.customers
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin_staff());

ALTER TABLE public.customers
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.customers
  ADD CONSTRAINT customers_pkey PRIMARY KEY (id);

GRANT ALL ON public.customers TO anon;

GRANT ALL ON public.customers TO authenticated;

GRANT ALL ON public.customers TO service_role;