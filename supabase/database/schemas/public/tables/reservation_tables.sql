CREATE TABLE public.reservation_tables (
  reservation_id uuid                     NOT NULL,
  table_number   integer                  NOT NULL,
  created_at     timestamp with time zone DEFAULT now()
);

CREATE POLICY "Allow anon read" ON public.reservation_tables
  FOR SELECT
  USING ((auth.role() = 'anon'::text));

CREATE POLICY "Allow service_role full access" ON public.reservation_tables
  USING ((auth.role() = 'service_role'::text));

ALTER TABLE public.reservation_tables
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.reservation_tables
  ADD CONSTRAINT reservation_tables_pkey PRIMARY KEY (reservation_id, table_number);

ALTER TABLE public.reservation_tables
  ADD CONSTRAINT reservation_tables_reservation_id_fkey FOREIGN KEY (reservation_id) REFERENCES public.reservations(id) ON DELETE CASCADE;

ALTER TABLE public.reservation_tables
  ADD CONSTRAINT reservation_tables_table_number_fkey FOREIGN KEY (table_number) REFERENCES public.table_floors(table_number) ON DELETE CASCADE;

GRANT ALL ON public.reservation_tables TO anon;

GRANT ALL ON public.reservation_tables TO authenticated;

GRANT ALL ON public.reservation_tables TO service_role;