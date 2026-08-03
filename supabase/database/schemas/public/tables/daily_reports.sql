CREATE TABLE public.daily_reports (
  id              uuid                     DEFAULT gen_random_uuid() NOT NULL,
  report_date     date                     DEFAULT CURRENT_DATE NOT NULL,
  total_revenue   numeric                  DEFAULT 0,
  total_orders    integer                  DEFAULT 0,
  aov             numeric                  DEFAULT 0,
  items_sold      integer                  DEFAULT 0,
  cash_total      numeric                  DEFAULT 0,
  card_total      numeric                  DEFAULT 0,
  tips_total      numeric                  DEFAULT 0,
  discounts_total numeric                  DEFAULT 0,
  voids_count     integer                  DEFAULT 0,
  voids_amount    numeric                  DEFAULT 0,
  tax_collected   numeric                  DEFAULT 0,
  starting_cash   numeric                  DEFAULT 0,
  expected_cash   numeric                  DEFAULT 0,
  actual_cash     numeric                  DEFAULT 0,
  cash_difference numeric                  DEFAULT 0,
  cogs            numeric                  DEFAULT 0,
  labor_cost      numeric                  DEFAULT 0,
  raw_data        jsonb                    DEFAULT '{}'::jsonb,
  closed_at       timestamp with time zone,
  closed_by       uuid,
  created_at      timestamp with time zone DEFAULT now()
);

CREATE UNIQUE INDEX idx_daily_reports_date ON public.daily_reports (report_date);

CREATE POLICY service_full_daily_reports ON public.daily_reports
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY auth_read_daily_reports ON public.daily_reports
  FOR SELECT
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM public.staff
  WHERE ((staff.id = auth.uid()) AND (staff.role = ANY (ARRAY['superadmin'::text, 'admin'::text]))))));

ALTER TABLE public.daily_reports
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.daily_reports
  ADD CONSTRAINT daily_reports_pkey PRIMARY KEY (id);

GRANT ALL ON public.daily_reports TO anon;

GRANT ALL ON public.daily_reports TO authenticated;

GRANT ALL ON public.daily_reports TO service_role;