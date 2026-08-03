CREATE TABLE public.stations (
  id           uuid                     DEFAULT gen_random_uuid() NOT NULL,
  name         text                     NOT NULL,
  station_type text                     DEFAULT 'kitchen'::text NOT NULL,
  is_active    boolean                  DEFAULT true,
  sort_order   integer                  DEFAULT 0,
  created_at   timestamp with time zone DEFAULT now(),
  updated_at   timestamp with time zone DEFAULT now()
);

CREATE INDEX idx_stations_active ON public.stations (is_active);

CREATE INDEX idx_stations_type ON public.stations (station_type);

ALTER TABLE public.stations
  ADD CONSTRAINT stations_name_key UNIQUE (name);

ALTER TABLE public.stations
  ADD CONSTRAINT stations_pkey PRIMARY KEY (id);

ALTER TABLE public.stations
  ADD CONSTRAINT stations_station_type_check CHECK (station_type = ANY (ARRAY['kitchen'::text, 'bar'::text, 'grill'::text, 'prep'::text, 'service'::text, 'other'::text]));

GRANT ALL ON public.stations TO anon;

GRANT ALL ON public.stations TO authenticated;

GRANT ALL ON public.stations TO service_role;