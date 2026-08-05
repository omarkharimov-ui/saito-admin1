-- Add delivery zones with pricing and rules

CREATE TABLE public.delivery_zones (
  id              uuid                     DEFAULT gen_random_uuid() NOT NULL,
  name            text                     NOT NULL,
  description     text,
  district        text                     NOT NULL,
  radius_km       numeric(6,2)             DEFAULT 5,
  min_order_amount numeric(10,2)           DEFAULT 0,
  delivery_fee    numeric(10,2)            DEFAULT 0,
  free_delivery_above numeric(10,2)       DEFAULT NULL,
  estimated_minutes integer                DEFAULT 30,
  is_active       boolean                  DEFAULT true,
  priority        integer                  DEFAULT 0,
  created_at      timestamp with time zone DEFAULT now() NOT NULL,
  updated_at      timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX idx_delivery_zones_district ON public.delivery_zones (district);
CREATE INDEX idx_delivery_zones_active ON public.delivery_zones (is_active);

ALTER TABLE public.delivery_zones
  ADD CONSTRAINT delivery_zones_pkey PRIMARY KEY (id);

ALTER TABLE public.delivery_zones
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY service_full_delivery_zones ON public.delivery_zones
  TO service_role
  USING (true)
  WITH CHECK (true);

GRANT ALL ON public.delivery_zones TO service_role;
