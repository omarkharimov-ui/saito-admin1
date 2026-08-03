CREATE TABLE public.reservations_archive (
  id                   uuid                     DEFAULT gen_random_uuid() NOT NULL,
  reservation_id       uuid                     NOT NULL,
  name                 text,
  phone                text,
  guests               integer,
  date                 date,
  "time"               text,
  note                 text,
  status               text,
  table_number         integer,
  table_ids            text[]                   DEFAULT '{}'::text[],
  pre_order_items      jsonb                    DEFAULT '[]'::jsonb,
  pre_order_total      numeric                  DEFAULT 0,
  kitchen_scheduled_at timestamp with time zone,
  checked_in_at        timestamp with time zone,
  completed_at         timestamp with time zone,
  archived_at          timestamp with time zone DEFAULT now(),
  archived_reason      text,
  created_at           timestamp with time zone DEFAULT now(),
  updated_at           timestamp with time zone DEFAULT now()
);

CREATE POLICY reservations_archive_insert ON public.reservations_archive
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin_staff());

CREATE POLICY reservations_archive_select ON public.reservations_archive
  FOR SELECT
  TO authenticated
  USING (true);

ALTER TABLE public.reservations_archive
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.reservations_archive
  ADD CONSTRAINT reservations_archive_pkey PRIMARY KEY (id);

ALTER TABLE public.reservations_archive
  ADD CONSTRAINT reservations_archive_reservation_id_key UNIQUE (reservation_id);

GRANT ALL ON public.reservations_archive TO anon;

GRANT ALL ON public.reservations_archive TO authenticated;

GRANT ALL ON public.reservations_archive TO service_role;