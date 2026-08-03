CREATE TABLE public.kitchen_schedule (
  id             uuid                     DEFAULT extensions.uuid_generate_v4() NOT NULL,
  reservation_id uuid,
  table_number   integer,
  order_id       uuid,
  scheduled_at   timestamp with time zone,
  guest_count    integer,
  status         text                     DEFAULT 'pending'::text,
  created_at     timestamp with time zone DEFAULT now(),
  updated_at     timestamp with time zone DEFAULT now() NOT NULL
);

CREATE POLICY kitchen_schedule_select ON public.kitchen_schedule
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY kitchen_schedule_write ON public.kitchen_schedule
  TO authenticated
  USING (public.is_admin_staff())
  WITH CHECK (public.is_admin_staff());

ALTER TABLE public.kitchen_schedule
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.kitchen_schedule
  ADD CONSTRAINT kitchen_schedule_pkey PRIMARY KEY (id);

ALTER TABLE public.kitchen_schedule
  ADD CONSTRAINT kitchen_schedule_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id);

ALTER TABLE public.kitchen_schedule
  ADD CONSTRAINT kitchen_schedule_reservation_id_fkey FOREIGN KEY (reservation_id) REFERENCES public.reservations(id);

GRANT ALL ON public.kitchen_schedule TO anon;

GRANT ALL ON public.kitchen_schedule TO authenticated;

GRANT ALL ON public.kitchen_schedule TO service_role;