CREATE TABLE public.shifts (
  id            uuid                     DEFAULT gen_random_uuid() NOT NULL,
  staff_id      uuid                     NOT NULL,
  report_date   date                     DEFAULT CURRENT_DATE NOT NULL,
  opened_at     timestamp with time zone DEFAULT now() NOT NULL,
  closed_at     timestamp with time zone,
  starting_cash numeric                  DEFAULT 0 NOT NULL,
  expected_cash numeric                  DEFAULT 0 NOT NULL,
  actual_cash   numeric                  DEFAULT 0 NOT NULL,
  difference    numeric                  DEFAULT 0 NOT NULL,
  notes         text,
  created_at    timestamp with time zone DEFAULT now()
);

CREATE POLICY service_full_shifts ON public.shifts
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY auth_modify_shifts ON public.shifts
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM public.staff
  WHERE ((staff.id = auth.uid()) AND (staff.role = ANY (ARRAY['superadmin'::text, 'admin'::text, 'cashier'::text]))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM public.staff
  WHERE ((staff.id = auth.uid()) AND (staff.role = ANY (ARRAY['superadmin'::text, 'admin'::text, 'cashier'::text]))))));

CREATE POLICY auth_read_shifts ON public.shifts
  FOR SELECT
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM public.staff
  WHERE ((staff.id = auth.uid()) AND (staff.role = ANY (ARRAY['superadmin'::text, 'admin'::text, 'cashier'::text]))))));

ALTER TABLE public.shifts
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.shifts
  ADD CONSTRAINT shifts_pkey PRIMARY KEY (id);

GRANT ALL ON public.shifts TO anon;

GRANT ALL ON public.shifts TO authenticated;

GRANT ALL ON public.shifts TO service_role;