CREATE TABLE public.cash_drawer_logs (
  id            uuid                     DEFAULT gen_random_uuid() NOT NULL,
  shift_id      uuid                     NOT NULL,
  staff_id      uuid                     NOT NULL,
  action        text                     NOT NULL,
  amount        numeric                  DEFAULT 0 NOT NULL,
  description   text,
  starting_cash numeric                  DEFAULT 0 NOT NULL,
  expected_cash numeric                  DEFAULT 0 NOT NULL,
  actual_cash   numeric                  DEFAULT 0 NOT NULL,
  difference    numeric                  DEFAULT 0 NOT NULL,
  opened_at     timestamp with time zone DEFAULT now() NOT NULL,
  closed_at     timestamp with time zone,
  notes         text,
  created_at    timestamp with time zone DEFAULT now()
);

CREATE POLICY service_full_cash_drawer_logs ON public.cash_drawer_logs
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY auth_modify_cash_drawer_logs ON public.cash_drawer_logs
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM public.staff
  WHERE ((staff.id = auth.uid()) AND (staff.role = ANY (ARRAY['superadmin'::text, 'admin'::text, 'cashier'::text]))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM public.staff
  WHERE ((staff.id = auth.uid()) AND (staff.role = ANY (ARRAY['superadmin'::text, 'admin'::text, 'cashier'::text]))))));

CREATE POLICY auth_read_cash_drawer_logs ON public.cash_drawer_logs
  FOR SELECT
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM public.staff
  WHERE ((staff.id = auth.uid()) AND (staff.role = ANY (ARRAY['superadmin'::text, 'admin'::text, 'cashier'::text]))))));

ALTER TABLE public.cash_drawer_logs
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.cash_drawer_logs
  ADD CONSTRAINT cash_drawer_logs_pkey PRIMARY KEY (id);

GRANT ALL ON public.cash_drawer_logs TO anon;

GRANT ALL ON public.cash_drawer_logs TO authenticated;

GRANT ALL ON public.cash_drawer_logs TO service_role;