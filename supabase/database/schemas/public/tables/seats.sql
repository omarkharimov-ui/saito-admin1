CREATE TABLE public.seats (
  id           uuid                     DEFAULT gen_random_uuid() NOT NULL,
  table_number integer                  NOT NULL,
  seat_number  integer                  NOT NULL,
  label        text,
  x_pos        numeric,
  y_pos        numeric,
  sort_order   integer                  DEFAULT 0,
  created_at   timestamp with time zone DEFAULT now(),
  updated_at   timestamp with time zone DEFAULT now()
);

CREATE UNIQUE INDEX idx_seats_table_seat ON public.seats (table_number, seat_number);

CREATE INDEX idx_seats_table ON public.seats (table_number);

CREATE POLICY seats_all ON public.seats
  USING (true)
  WITH CHECK (true);

ALTER TABLE public.seats
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.seats
  ADD CONSTRAINT seats_pkey PRIMARY KEY (id);

GRANT ALL ON public.seats TO anon;

GRANT ALL ON public.seats TO authenticated;

GRANT ALL ON public.seats TO service_role;