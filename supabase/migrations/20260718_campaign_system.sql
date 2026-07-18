-- ============================================================================
-- Campaign System: Full Schema + RLS + RPC
-- Run in Supabase Dashboard → SQL Editor
-- ============================================================================

-- ─── 1. CAMPAIGNS TABLE: Add missing columns ───
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS priority INTEGER DEFAULT 0;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS stackable BOOLEAN DEFAULT false;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS exclusive BOOLEAN DEFAULT false;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS max_uses INTEGER;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS max_uses_per_customer INTEGER;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS max_uses_per_day INTEGER;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS max_uses_per_order INTEGER;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS min_order_amount NUMERIC;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS max_order_amount NUMERIC;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS min_purchase_amount NUMERIC;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS min_items INTEGER;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS max_discount_amount NUMERIC;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS current_uses INTEGER DEFAULT 0;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS start_date DATE;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS customer_tags TEXT[] DEFAULT '{}';
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS dining_type TEXT[] DEFAULT '{dine_in,takeaway,delivery}';
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS table_numbers INTEGER[] DEFAULT '{}';
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS branch_id UUID;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS auto_apply BOOLEAN DEFAULT true;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS requires_coupon BOOLEAN DEFAULT false;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS coupon_code TEXT;

-- Add start_date if missing (column was named differently)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'campaigns' AND column_name = 'start_date') THEN
    ALTER TABLE campaigns ADD COLUMN start_date DATE;
  END IF;
END $$;

-- ─── 2. CAMPAIGN_RULES ───
CREATE TABLE IF NOT EXISTS campaign_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  rule_type TEXT NOT NULL DEFAULT 'percentage',
  percentage NUMERIC,
  fixed_amount NUMERIC,
  buy_quantity INTEGER,
  pay_quantity INTEGER,
  free_quantity INTEGER,
  start_time TEXT,
  end_time TEXT,
  weekdays INTEGER[] DEFAULT '{}',
  is_recurring BOOLEAN DEFAULT false,
  delivery_min_order NUMERIC,
  delivery_zones TEXT[] DEFAULT '{}',
  combo_discount_type TEXT,
  combo_discount_value NUMERIC,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_campaign_rules_campaign ON campaign_rules(campaign_id);

-- ─── 3. CAMPAIGN_TARGETS ───
CREATE TABLE IF NOT EXISTS campaign_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL DEFAULT 'product',
  target_id UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_campaign_targets_campaign ON campaign_targets(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_targets_type ON campaign_targets(target_type);
CREATE INDEX IF NOT EXISTS idx_campaign_targets_target ON campaign_targets(target_id);

-- ─── 4. CAMPAIGN_SCHEDULES ───
CREATE TABLE IF NOT EXISTS campaign_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  start_date DATE,
  end_date DATE,
  start_time TEXT,
  end_time TEXT,
  weekdays INTEGER[] DEFAULT '{}',
  is_recurring BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_campaign_schedules_campaign ON campaign_schedules(campaign_id);

-- ─── 5. ORDERS: Add campaign columns ───
ALTER TABLE orders ADD COLUMN IF NOT EXISTS campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_amount NUMERIC DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_type TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_id UUID;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_name TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_phone TEXT;

-- ─── 6. PRODUCTS: Add discount_price ───
ALTER TABLE products ADD COLUMN IF NOT EXISTS discount_price NUMERIC;

-- ─── 7. INDEXES ───
CREATE INDEX IF NOT EXISTS idx_campaigns_priority ON campaigns(priority DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_campaigns_is_active ON campaigns(is_active);
CREATE INDEX IF NOT EXISTS idx_campaigns_deleted_at ON campaigns(deleted_at);
CREATE INDEX IF NOT EXISTS idx_orders_campaign ON orders(campaign_id);

-- ─── 8. RLS POLICIES ───
ALTER TABLE campaign_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_schedules ENABLE ROW LEVEL SECURITY;

-- Campaign rules: full access for authenticated
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'campaign_rules' AND policyname = 'campaign_rules_select') THEN
    CREATE POLICY campaign_rules_select ON campaign_rules FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'campaign_rules' AND policyname = 'campaign_rules_insert') THEN
    CREATE POLICY campaign_rules_insert ON campaign_rules FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'campaign_rules' AND policyname = 'campaign_rules_update') THEN
    CREATE POLICY campaign_rules_update ON campaign_rules FOR UPDATE TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'campaign_rules' AND policyname = 'campaign_rules_delete') THEN
    CREATE POLICY campaign_rules_delete ON campaign_rules FOR DELETE TO authenticated USING (true);
  END IF;
END $$;

-- Campaign targets
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'campaign_targets' AND policyname = 'campaign_targets_select') THEN
    CREATE POLICY campaign_targets_select ON campaign_targets FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'campaign_targets' AND policyname = 'campaign_targets_insert') THEN
    CREATE POLICY campaign_targets_insert ON campaign_targets FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'campaign_targets' AND policyname = 'campaign_targets_update') THEN
    CREATE POLICY campaign_targets_update ON campaign_targets FOR UPDATE TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'campaign_targets' AND policyname = 'campaign_targets_delete') THEN
    CREATE POLICY campaign_targets_delete ON campaign_targets FOR DELETE TO authenticated USING (true);
  END IF;
END $$;

-- Campaign schedules
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'campaign_schedules' AND policyname = 'campaign_schedules_select') THEN
    CREATE POLICY campaign_schedules_select ON campaign_schedules FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'campaign_schedules' AND policyname = 'campaign_schedules_insert') THEN
    CREATE POLICY campaign_schedules_insert ON campaign_schedules FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'campaign_schedules' AND policyname = 'campaign_schedules_update') THEN
    CREATE POLICY campaign_schedules_update ON campaign_schedules FOR UPDATE TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'campaign_schedules' AND policyname = 'campaign_schedules_delete') THEN
    CREATE POLICY campaign_schedules_delete ON campaign_schedules FOR DELETE TO authenticated USING (true);
  END IF;
END $$;

-- Also ensure campaigns table itself has RLS policies
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'campaigns' AND policyname = 'campaigns_select') THEN
    CREATE POLICY campaigns_select ON campaigns FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'campaigns' AND policyname = 'campaigns_insert') THEN
    CREATE POLICY campaigns_insert ON campaigns FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'campaigns' AND policyname = 'campaigns_update') THEN
    CREATE POLICY campaigns_update ON campaigns FOR UPDATE TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'campaigns' AND policyname = 'campaigns_delete') THEN
    CREATE POLICY campaigns_delete ON campaigns FOR DELETE TO authenticated USING (true);
  END IF;
END $$;

-- ─── 9. UPDATE auto_apply_campaigns RPC ───
-- Updated to use normalized tables (campaign_rules + campaign_targets)
CREATE OR REPLACE FUNCTION auto_apply_campaigns(p_order_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order RECORD;
  v_campaign RECORD;
  v_rule RECORD;
  v_total_amount NUMERIC;
  v_item_count INTEGER;
  v_discount NUMERIC := 0;
  v_product_ids TEXT[];
  v_category_ids TEXT[];
BEGIN
  SELECT * INTO v_order FROM orders WHERE id = p_order_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('applied', false, 'reason', 'ORDER_NOT_FOUND');
  END IF;

  SELECT COALESCE(SUM(COALESCE(total_price, unit_price * quantity)), 0), COUNT(*)
  INTO v_total_amount, v_item_count
  FROM order_items WHERE order_id = p_order_id;
  IF v_item_count = 0 THEN
    RETURN jsonb_build_object('applied', false, 'reason', 'NO_ITEMS');
  END IF;

  SELECT ARRAY_AGG(DISTINCT oi.product_id::text) FILTER (WHERE oi.product_id IS NOT NULL),
         ARRAY_AGG(DISTINCT p.category_id::text) FILTER (WHERE p.category_id IS NOT NULL)
  INTO v_product_ids, v_category_ids
  FROM order_items oi
  LEFT JOIN products p ON p.id = oi.product_id
  WHERE oi.order_id = p_order_id;

  -- Find best matching active campaign via normalized tables
  SELECT c.* INTO v_campaign
  FROM campaigns c
  WHERE c.is_active = true
    AND c.deleted_at IS NULL
    AND (c.max_uses IS NULL OR c.current_uses < c.max_uses)
    AND (c.start_date IS NULL OR c.start_date <= CURRENT_DATE)
    AND (c.end_date IS NULL OR c.end_date >= CURRENT_DATE)
    AND EXISTS (
      SELECT 1 FROM campaign_targets ct
      WHERE ct.campaign_id = c.id
        AND (
          ct.target_type = 'category' AND ct.target_id::text = ANY(COALESCE(v_category_ids, ARRAY[]::TEXT[]))
          OR ct.target_type = 'product' AND ct.target_id::text = ANY(COALESCE(v_product_ids, ARRAY[]::TEXT[]))
        )
    )
  ORDER BY c.priority DESC NULLS LAST
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('applied', false, 'reason', 'NO_MATCHING_CAMPAIGN');
  END IF;

  -- Get the rule
  SELECT * INTO v_rule FROM campaign_rules WHERE campaign_id = v_campaign.id LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('applied', false, 'reason', 'NO_RULE');
  END IF;

  -- Calculate discount based on rule type
  IF v_rule.rule_type IN ('percentage', 'happy_hour') THEN
    v_discount := v_total_amount * (COALESCE(v_rule.percentage, 0) / 100.0);
  ELSIF v_rule.rule_type = 'fixed_amount' THEN
    v_discount := LEAST(COALESCE(v_rule.fixed_amount, 0), v_total_amount);
  ELSIF v_rule.rule_type IN ('buy_x_pay_y', 'buy_x_get_y') THEN
    -- Simplified: discount = price of free items
    v_discount := 0;
  ELSIF v_rule.rule_type = 'free_delivery' THEN
    v_discount := 0; -- delivery fee handled elsewhere
  END IF;

  IF v_campaign.max_discount_amount IS NOT NULL AND v_discount > v_campaign.max_discount_amount THEN
    v_discount := v_campaign.max_discount_amount;
  END IF;
  v_discount := GREATEST(0, v_discount);

  -- Increment usage
  UPDATE campaigns SET current_uses = COALESCE(current_uses, 0) + 1 WHERE id = v_campaign.id;

  RETURN jsonb_build_object(
    'applied', true,
    'campaign_id', v_campaign.id,
    'discount_amount', v_discount,
    'discount_type', v_campaign.type
  );
END;
$$;

GRANT EXECUTE ON FUNCTION auto_apply_campaigns(UUID) TO authenticated, anon;
