CREATE TABLE public.delivery_zones (
  id                      uuid                     DEFAULT gen_random_uuid() NOT NULL,
  name                    text                     NOT NULL,
  fee                     numeric                  DEFAULT 0,
  free_delivery_threshold numeric                  DEFAULT 50,
  estimated_minutes       integer                  DEFAULT 30,
  is_active               boolean                  DEFAULT true,
  created_at              timestamp with time zone DEFAULT now(),
  updated_at              timestamp with time zone DEFAULT now()
);

ALTER TABLE public.delivery_zones
  ADD CONSTRAINT delivery_zones_pkey PRIMARY KEY (id);

GRANT ALL ON public.delivery_zones TO anon;

GRANT ALL ON public.delivery_zones TO authenticated;

GRANT ALL ON public.delivery_zones TO service_role;