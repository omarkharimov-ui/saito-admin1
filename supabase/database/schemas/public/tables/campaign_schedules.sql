CREATE TABLE public.campaign_schedules (
  id           uuid                     DEFAULT gen_random_uuid() NOT NULL,
  campaign_id  uuid                     NOT NULL,
  start_date   date,
  end_date     date,
  start_time   time without time zone,
  end_time     time without time zone,
  weekdays     integer[]                DEFAULT '{1,2,3,4,5,6,7}'::integer[],
  is_recurring boolean                  DEFAULT false,
  created_at   timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX idx_campaign_schedules_campaign ON public.campaign_schedules (campaign_id);

CREATE POLICY campaign_schedules_delete ON public.campaign_schedules
  FOR DELETE
  TO authenticated
  USING (true);

CREATE POLICY campaign_schedules_insert ON public.campaign_schedules
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY campaign_schedules_select ON public.campaign_schedules
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY campaign_schedules_update ON public.campaign_schedules
  FOR UPDATE
  TO authenticated
  USING (true);

ALTER TABLE public.campaign_schedules
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.campaign_schedules
  ADD CONSTRAINT campaign_schedules_pkey PRIMARY KEY (id);

ALTER TABLE public.campaign_schedules
  ADD CONSTRAINT campaign_schedules_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id) ON DELETE CASCADE;

GRANT ALL ON public.campaign_schedules TO anon;

GRANT ALL ON public.campaign_schedules TO authenticated;

GRANT ALL ON public.campaign_schedules TO service_role;