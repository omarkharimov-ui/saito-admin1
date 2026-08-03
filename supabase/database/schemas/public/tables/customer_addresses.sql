CREATE TABLE public.customer_addresses (
  id             uuid                     DEFAULT gen_random_uuid() NOT NULL,
  customer_id    uuid,
  address_line   text                     NOT NULL,
  address_line2  text,
  city           text                     DEFAULT 'Bakı'::text,
  district       text,
  landmark       text,
  delivery_notes text,
  lat            numeric,
  lng            numeric,
  is_default     boolean                  DEFAULT false,
  created_at     timestamp with time zone DEFAULT now(),
  updated_at     timestamp with time zone DEFAULT now()
);

CREATE INDEX idx_customer_addresses_customer ON public.customer_addresses (customer_id);

CREATE POLICY "Allow authenticated CRUD customer_addresses" ON public.customer_addresses
  USING ((auth.role() = 'authenticated'::text))
  WITH CHECK ((auth.role() = 'authenticated'::text));

CREATE POLICY "Allow authenticated read customer_addresses" ON public.customer_addresses
  FOR SELECT
  USING ((auth.role() = 'authenticated'::text));

ALTER TABLE public.customer_addresses
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.customer_addresses
  ADD CONSTRAINT customer_addresses_pkey PRIMARY KEY (id);

ALTER TABLE public.customer_addresses
  ADD CONSTRAINT customer_addresses_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE;

GRANT ALL ON public.customer_addresses TO anon;

GRANT ALL ON public.customer_addresses TO authenticated;

GRANT ALL ON public.customer_addresses TO service_role;