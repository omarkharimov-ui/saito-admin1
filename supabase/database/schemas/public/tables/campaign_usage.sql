CREATE TABLE public.campaign_usage (
  id              uuid                     DEFAULT gen_random_uuid() NOT NULL,
  campaign_id     uuid                     NOT NULL,
  order_id        uuid                     NOT NULL,
  discount_amount numeric                  DEFAULT 0,
  discount_type   text,
  created_at      timestamp with time zone DEFAULT now() NOT NULL,
  customer_id     uuid,
  items_count     integer                  DEFAULT 1 NOT NULL,
  order_amount    numeric(10,2),
  free_items      integer                  DEFAULT 0 NOT NULL,
  rule_type       text
);

CREATE INDEX idx_campaign_usage_order ON public.campaign_usage (order_id);

CREATE INDEX idx_campaign_usage_campaign ON public.campaign_usage (campaign_id);

CREATE POLICY service_full_campaign_usage ON public.campaign_usage
  TO service_role
  USING (true)
  WITH CHECK (true);

ALTER TABLE public.campaign_usage
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.campaign_usage
  ADD CONSTRAINT campaign_usage_campaign_id_order_id_key UNIQUE (campaign_id, order_id);

ALTER TABLE public.campaign_usage
  ADD CONSTRAINT campaign_usage_pkey PRIMARY KEY (id);

ALTER TABLE public.campaign_usage
  ADD CONSTRAINT campaign_usage_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id) ON DELETE CASCADE;

ALTER TABLE public.campaign_usage
  ADD CONSTRAINT campaign_usage_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE SET NULL;

ALTER TABLE public.campaign_usage
  ADD CONSTRAINT campaign_usage_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;

GRANT ALL ON public.campaign_usage TO anon;

GRANT ALL ON public.campaign_usage TO authenticated;

GRANT ALL ON public.campaign_usage TO service_role;