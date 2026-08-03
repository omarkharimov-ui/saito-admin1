CREATE TABLE public.campaigns (
  id                    uuid                     DEFAULT gen_random_uuid() NOT NULL,
  title                 text                     NOT NULL,
  description           text,
  type                  text                     NOT NULL,
  target_type           text                     NOT NULL,
  target_id             uuid,
  discount_value        numeric(10,2),
  status                text                     DEFAULT 'active'::text,
  image_url             text,
  created_at            timestamp with time zone DEFAULT now(),
  start_time            text,
  end_time              text,
  end_date              date,
  translations          jsonb,
  title_az              text,
  title_en              text,
  title_ru              text,
  start_date            date,
  priority              integer                  DEFAULT 0,
  min_purchase_amount   numeric(10,2)            DEFAULT 0,
  min_items             integer                  DEFAULT 0,
  applicable_categories text[]                   DEFAULT '{}'::text[],
  applicable_products   text[]                   DEFAULT '{}'::text[],
  combo_id              uuid,
  max_discount_amount   numeric(10,2),
  current_uses          integer                  DEFAULT 0,
  max_uses              integer                  DEFAULT 0,
  label                 text,
  badge_color           text                     DEFAULT '#D4AF37'::text,
  buy_quantity          integer                  DEFAULT 1,
  get_quantity          integer                  DEFAULT 1,
  get_same_product      boolean                  DEFAULT true,
  get_product_id        uuid,
  get_category_id       uuid,
  max_uses_per_customer integer,
  max_uses_per_day      integer,
  target_customer_type  text                     DEFAULT 'all'::text,
  min_visit_count       integer                  DEFAULT 0,
  applicable_days       integer[]                DEFAULT '{1,2,3,4,5,6,7}'::integer[],
  applicable_tables     integer[],
  applicable_rooms      text[],
  stackable             boolean                  DEFAULT false,
  stack_with_ids        uuid[],
  combo_discount_type   text                     DEFAULT 'fixed'::text,
  combo_discount_value  numeric(10,2)            DEFAULT 0,
  name                  text,
  exclusive             boolean                  DEFAULT false,
  max_uses_per_order    integer,
  min_order_amount      numeric(10,2),
  max_order_amount      numeric(10,2),
  customer_tags         text[],
  dining_type           text[]                   DEFAULT '{dine_in,takeaway,delivery}'::text[],
  table_numbers         integer[],
  branch_id             uuid,
  auto_apply            boolean                  DEFAULT true,
  requires_coupon       boolean                  DEFAULT false,
  coupon_code           text,
  is_active             boolean                  DEFAULT true,
  deleted_at            timestamp with time zone,
  updated_at            timestamp with time zone DEFAULT now()
);

CREATE INDEX idx_campaigns_buy_get ON public.campaigns (buy_quantity, get_quantity);

CREATE INDEX idx_campaigns_dates ON public.campaigns (status, start_date, end_date);

CREATE INDEX idx_campaigns_is_active ON public.campaigns (is_active);

CREATE INDEX idx_campaigns_priority ON public.campaigns (priority DESC NULLS LAST);

CREATE INDEX idx_campaigns_deleted_at ON public.campaigns (deleted_at);

CREATE INDEX idx_campaigns_target_customer ON public.campaigns (target_customer_type);

CREATE INDEX idx_campaigns_active ON public.campaigns (status)
  WHERE status = 'active'::text;

CREATE INDEX idx_campaigns_status ON public.campaigns (status);

CREATE INDEX idx_campaigns_combo ON public.campaigns (combo_id);

CREATE TRIGGER trigger_check_campaign_expiry
  BEFORE INSERT OR UPDATE ON public.campaigns
  FOR EACH ROW
  EXECUTE FUNCTION public.check_campaign_expiry();

CREATE POLICY campaigns_delete ON public.campaigns
  FOR DELETE
  TO authenticated
  USING (true);

CREATE POLICY campaigns_insert ON public.campaigns
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY campaigns_select ON public.campaigns
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY campaigns_select_public ON public.campaigns
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY campaigns_update ON public.campaigns
  FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY campaigns_update_anon_happy_hour ON public.campaigns
  FOR UPDATE
  TO anon
  USING (((TYPE = 'HAPPY_HOUR'::text) AND (status = 'active'::text)))
  WITH CHECK ((status = 'inactive'::text));

CREATE POLICY campaigns_write_admin ON public.campaigns
  TO authenticated
  USING (public.is_admin_staff())
  WITH CHECK (public.is_admin_staff());

CREATE POLICY campaigns_write_staff ON public.campaigns
  TO authenticated
  USING (public.is_admin_staff())
  WITH CHECK (public.is_admin_staff());

ALTER TABLE public.campaigns
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.campaigns
  ADD CONSTRAINT campaigns_pkey PRIMARY KEY (id);

ALTER TABLE public.campaigns
  ADD CONSTRAINT campaigns_type_check CHECK (type = ANY (ARRAY['BOGO'::text, 'BUY2GET1'::text, 'PERCENTAGE'::text, 'HAPPY_HOUR'::text, 'FREE_DELIVERY'::text]));

ALTER TABLE public.campaigns
  ADD CONSTRAINT campaigns_get_category_id_fkey FOREIGN KEY (get_category_id) REFERENCES public.categories(id) ON DELETE SET NULL;

ALTER TABLE public.campaigns
  ADD CONSTRAINT campaigns_get_product_id_fkey FOREIGN KEY (get_product_id) REFERENCES public.products(id) ON DELETE SET NULL;

GRANT ALL ON public.campaigns TO anon;

GRANT ALL ON public.campaigns TO authenticated;

GRANT ALL ON public.campaigns TO service_role;