CREATE TABLE public.couriers (
  id                    uuid                     DEFAULT gen_random_uuid() NOT NULL,
  name                  text                     NOT NULL,
  phone                 text,
  vehicle_type          text                     DEFAULT 'car'::text,
  is_active             boolean                  DEFAULT true,
  current_order_id      uuid,
  last_location_lat     numeric,
  last_location_lng     numeric,
  last_location_at      timestamp with time zone,
  total_deliveries      integer                  DEFAULT 0,
  avg_delivery_time_min numeric,
  rating                numeric(3,2),
  notes                 text,
  created_at            timestamp with time zone DEFAULT now(),
  updated_at            timestamp with time zone DEFAULT now()
);

CREATE INDEX idx_couriers_current_order ON public.couriers (current_order_id)
  WHERE current_order_id IS NOT NULL;

CREATE INDEX idx_couriers_is_active ON public.couriers (is_active)
  WHERE is_active = true;

CREATE POLICY "Allow authenticated CRUD couriers" ON public.couriers
  USING ((auth.role() = 'authenticated'::text))
  WITH CHECK ((auth.role() = 'authenticated'::text));

CREATE POLICY "Allow authenticated read couriers" ON public.couriers
  FOR SELECT
  USING ((auth.role() = 'authenticated'::text));

ALTER TABLE public.couriers
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.couriers
  ADD CONSTRAINT couriers_pkey PRIMARY KEY (id);

ALTER TABLE public.couriers
  ADD CONSTRAINT couriers_vehicle_type_check CHECK (vehicle_type = ANY (ARRAY['car'::text, 'motorcycle'::text, 'bicycle'::text, 'walking'::text]));

ALTER TABLE public.couriers
  ADD CONSTRAINT couriers_current_order_id_fkey FOREIGN KEY (current_order_id) REFERENCES public.orders(id) ON DELETE SET NULL;

GRANT ALL ON public.couriers TO anon;

GRANT ALL ON public.couriers TO authenticated;

GRANT ALL ON public.couriers TO service_role;