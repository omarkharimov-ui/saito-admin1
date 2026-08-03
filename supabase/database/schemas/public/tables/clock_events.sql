CREATE TABLE public.clock_events (
  id        uuid                     DEFAULT gen_random_uuid() NOT NULL,
  staff_id  uuid                     NOT NULL,
  clock_in  timestamp with time zone DEFAULT now(),
  clock_out timestamp with time zone,
  note      text
);

CREATE INDEX idx_clock_staff ON public.clock_events (staff_id);

CREATE POLICY auth_read_clock_events ON public.clock_events
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY service_full_clock_events ON public.clock_events
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY auth_modify_clock_events ON public.clock_events
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM public.staff
  WHERE ((staff.id = auth.uid()) AND (staff.role = ANY (ARRAY['superadmin'::text, 'admin'::text]))))));

ALTER TABLE public.clock_events
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.clock_events
  ADD CONSTRAINT clock_events_pkey PRIMARY KEY (id);

ALTER TABLE public.clock_events
  ADD CONSTRAINT clock_events_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES auth.users(id) ON DELETE CASCADE;

GRANT ALL ON public.clock_events TO anon;

GRANT ALL ON public.clock_events TO authenticated;

GRANT ALL ON public.clock_events TO service_role;