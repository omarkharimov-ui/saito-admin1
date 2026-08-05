-- Add customer addresses table for delivery autocomplete

CREATE TABLE public.customer_addresses (
  id              uuid                     DEFAULT gen_random_uuid() NOT NULL,
  customer_id     uuid                     NOT NULL,
  label           text,
  address_line1   text                     NOT NULL,
  address_line2   text,
  district        text,
  street          text,
  building        text,
  floor           text,
  apartment       text,
  intercom        text,
  zone            text,
  delivery_fee    numeric(10,2)            DEFAULT 0,
  is_default      boolean                  DEFAULT false,
  last_used_at    timestamp with time zone,
  created_at      timestamp with time zone DEFAULT now() NOT NULL,
  updated_at      timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX idx_customer_addresses_customer ON public.customer_addresses (customer_id);
CREATE INDEX idx_customer_addresses_zone ON public.customer_addresses (zone);

ALTER TABLE public.customer_addresses
  ADD CONSTRAINT customer_addresses_pkey PRIMARY KEY (id);

ALTER TABLE public.customer_addresses
  ADD CONSTRAINT customer_addresses_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE;

ALTER TABLE public.customer_addresses
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY service_full_customer_addresses ON public.customer_addresses
  TO service_role
  USING (true)
  WITH CHECK (true);

GRANT ALL ON public.customer_addresses TO service_role;
