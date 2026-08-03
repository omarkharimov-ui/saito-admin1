CREATE TABLE public.campaign_rules (
  id                   uuid                     DEFAULT gen_random_uuid() NOT NULL,
  campaign_id          uuid                     NOT NULL,
  rule_type            text                     NOT NULL,
  percentage           numeric(5,2),
  fixed_amount         numeric(10,2),
  min_purchase_amount  numeric(10,2),
  buy_quantity         integer,
  pay_quantity         integer,
  free_quantity        integer,
  reward_product_id    uuid,
  reward_category_id   uuid,
  reward_same_as_buy   boolean                  DEFAULT true,
  start_time           time without time zone,
  end_time             time without time zone,
  weekdays             integer[]                DEFAULT '{1,2,3,4,5,6,7}'::integer[],
  is_recurring         boolean                  DEFAULT false,
  delivery_min_order   numeric(10,2),
  delivery_zones       text[],
  combo_id             uuid,
  combo_discount_type  text                     DEFAULT 'fixed'::text,
  combo_discount_value numeric(10,2)            DEFAULT 0,
  created_at           timestamp with time zone DEFAULT now() NOT NULL,
  updated_at           timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX idx_campaign_rules_type ON public.campaign_rules (rule_type);

CREATE INDEX idx_campaign_rules_campaign ON public.campaign_rules (campaign_id);

CREATE POLICY campaign_rules_delete ON public.campaign_rules
  FOR DELETE
  TO authenticated
  USING (true);

CREATE POLICY campaign_rules_insert ON public.campaign_rules
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY campaign_rules_select ON public.campaign_rules
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY campaign_rules_update ON public.campaign_rules
  FOR UPDATE
  TO authenticated
  USING (true);

ALTER TABLE public.campaign_rules
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.campaign_rules
  ADD CONSTRAINT campaign_rules_pkey PRIMARY KEY (id);

ALTER TABLE public.campaign_rules
  ADD CONSTRAINT campaign_rules_rule_type_check
    CHECK (rule_type = ANY (ARRAY['percentage'::text, 'fixed_amount'::text, 'buy_x_pay_y'::text, 'buy_x_get_y'::text, 'happy_hour'::text, 'free_delivery'::text, 'combo'::text]));

ALTER TABLE public.campaign_rules
  ADD CONSTRAINT campaign_rules_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id) ON DELETE CASCADE;

ALTER TABLE public.campaign_rules
  ADD CONSTRAINT campaign_rules_reward_category_id_fkey FOREIGN KEY (reward_category_id) REFERENCES public.categories(id) ON DELETE SET NULL;

ALTER TABLE public.campaign_rules
  ADD CONSTRAINT campaign_rules_combo_id_fkey FOREIGN KEY (combo_id) REFERENCES public.combos(id) ON DELETE SET NULL;

ALTER TABLE public.campaign_rules
  ADD CONSTRAINT campaign_rules_reward_product_id_fkey FOREIGN KEY (reward_product_id) REFERENCES public.products(id) ON DELETE SET NULL;

GRANT ALL ON public.campaign_rules TO anon;

GRANT ALL ON public.campaign_rules TO authenticated;

GRANT ALL ON public.campaign_rules TO service_role;