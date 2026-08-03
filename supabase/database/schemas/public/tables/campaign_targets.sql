CREATE TABLE public.campaign_targets (
  id          uuid                     DEFAULT gen_random_uuid() NOT NULL,
  campaign_id uuid                     NOT NULL,
  target_type text                     NOT NULL,
  target_id   uuid,
  created_at  timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX idx_campaign_targets_type ON public.campaign_targets (target_type, target_id);

CREATE INDEX idx_campaign_targets_target ON public.campaign_targets (target_id);

CREATE INDEX idx_campaign_targets_campaign ON public.campaign_targets (campaign_id);

CREATE POLICY campaign_targets_delete ON public.campaign_targets
  FOR DELETE
  TO authenticated
  USING (true);

CREATE POLICY campaign_targets_insert ON public.campaign_targets
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY campaign_targets_select ON public.campaign_targets
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY campaign_targets_update ON public.campaign_targets
  FOR UPDATE
  TO authenticated
  USING (true);

ALTER TABLE public.campaign_targets
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.campaign_targets
  ADD CONSTRAINT campaign_targets_pkey PRIMARY KEY (id);

ALTER TABLE public.campaign_targets
  ADD CONSTRAINT campaign_targets_target_type_check CHECK (target_type = ANY (ARRAY['product'::text, 'category'::text, 'whole_order'::text, 'combo'::text]));

ALTER TABLE public.campaign_targets
  ADD CONSTRAINT campaign_targets_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id) ON DELETE CASCADE;

GRANT ALL ON public.campaign_targets TO anon;

GRANT ALL ON public.campaign_targets TO authenticated;

GRANT ALL ON public.campaign_targets TO service_role;