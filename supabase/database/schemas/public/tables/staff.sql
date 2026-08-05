CREATE TABLE public.staff (
  id          uuid                     DEFAULT gen_random_uuid() NOT NULL,
  name        text                     NOT NULL,
  role        text                     NOT NULL,
  shift       text                     DEFAULT 'full_time'::text,
  phone       text                     DEFAULT ''::text,
  created_at  timestamp with time zone DEFAULT now(),
  full_name   text,
  pin_hash    text,
  is_active   boolean                  DEFAULT true,
  email       text,
  hourly_rate numeric                  DEFAULT 5
);

CREATE POLICY auth_modify_staff ON public.staff
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM public.staff staff_1
  WHERE ((staff_1.id = auth.uid()) AND (staff_1.role = 'superadmin'::text)))));

CREATE POLICY auth_read_staff ON public.staff
  FOR SELECT
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM public.staff s2
  WHERE ((s2.id = auth.uid()) AND (s2.role = ANY (ARRAY['superadmin'::text, 'admin'::text]))))));

CREATE POLICY service_full_staff ON public.staff
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY staff_all_superadmin ON public.staff
  TO authenticated
  USING (public.is_superadmin())
  WITH CHECK (public.is_superadmin());

ALTER TABLE public.staff
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.staff
  ADD CONSTRAINT staff_pkey PRIMARY KEY (id);

GRANT ALL ON public.staff TO anon;

GRANT ALL ON public.staff TO authenticated;

GRANT ALL ON public.staff TO service_role;