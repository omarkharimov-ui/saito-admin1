-- ============================================================================
-- Campaign System Refactor: Restaurant Industry Standard
-- Normalized schema with separate tables per promotion type
-- ============================================================================

-- 1. Base campaigns table (keep existing, add new fields)
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS priority INTEGER DEFAULT 0;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS stackable BOOLEAN DEFAULT FALSE;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS exclusive BOOLEAN DEFAULT FALSE;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS max_uses_per_customer INTEGER;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS max_uses_per_day INTEGER;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS max_uses_per_order INTEGER;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS min_order_amount NUMERIC(10,2);
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS max_order_amount NUMERIC(10,2);
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS customer_tags TEXT[];
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS dining_type TEXT[] DEFAULT '{dine_in,takeaway,delivery}';
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS table_numbers INTEGER[];
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS branch_id UUID;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS auto_apply BOOLEAN DEFAULT TRUE;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS requires_coupon BOOLEAN DEFAULT FALSE;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS coupon_code TEXT;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- Copy title to name if name is null
UPDATE campaigns SET name = title WHERE name IS NULL AND title IS NOT NULL;

-- 2. Campaign rules table (type-specific configuration)
CREATE TABLE IF NOT EXISTS campaign_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  rule_type TEXT NOT NULL CHECK (rule_type IN ('percentage', 'fixed_amount', 'buy_x_pay_y', 'buy_x_get_y', 'happy_hour', 'free_delivery', 'combo')),
  percentage NUMERIC(5,2),
  fixed_amount NUMERIC(10,2),
  min_purchase_amount NUMERIC(10,2),
  buy_quantity INTEGER,
  pay_quantity INTEGER,
  free_quantity INTEGER,
  reward_product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  reward_category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  reward_same_as_buy BOOLEAN DEFAULT TRUE,
  start_time TIME,
  end_time TIME,
  weekdays INTEGER[] DEFAULT '{1,2,3,4,5,6,7}',
  is_recurring BOOLEAN DEFAULT FALSE,
  delivery_min_order NUMERIC(10,2),
  delivery_zones TEXT[],
  combo_id UUID REFERENCES combos(id) ON DELETE SET NULL,
  combo_discount_type TEXT DEFAULT 'fixed',
  combo_discount_value NUMERIC(10,2) DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(campaign_id, rule_type)
);

CREATE INDEX IF NOT EXISTS idx_campaign_rules_campaign ON campaign_rules(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_rules_type ON campaign_rules(rule_type);

-- 3. Campaign targets table (what the campaign applies to)
CREATE TABLE IF NOT EXISTS campaign_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('product', 'category', 'whole_order', 'combo')),
  target_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_campaign_targets_campaign ON campaign_targets(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_targets_type ON campaign_targets(target_type, target_id);

-- 4. Campaign schedules table (when the campaign is active)
CREATE TABLE IF NOT EXISTS campaign_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  start_date DATE,
  end_date DATE,
  start_time TIME,
  end_time TIME,
  weekdays INTEGER[] DEFAULT '{1,2,3,4,5,6,7}',
  is_recurring BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_campaign_schedules_campaign ON campaign_schedules(campaign_id);

-- 5. Campaign usage table (keep existing, add fields)
ALTER TABLE campaign_usage ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES customers(id) ON DELETE SET NULL;
ALTER TABLE campaign_usage ADD COLUMN IF NOT EXISTS items_count INTEGER NOT NULL DEFAULT 1;
ALTER TABLE campaign_usage ADD COLUMN IF NOT EXISTS order_amount NUMERIC(10,2);
ALTER TABLE campaign_usage ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(10,2) NOT NULL DEFAULT 0;
ALTER TABLE campaign_usage ADD COLUMN IF NOT EXISTS discount_type TEXT NOT NULL DEFAULT 'fixed';
ALTER TABLE campaign_usage ADD COLUMN IF NOT EXISTS free_items INTEGER NOT NULL DEFAULT 0;
ALTER TABLE campaign_usage ADD COLUMN IF NOT EXISTS rule_type TEXT;

-- 6. Campaign performance view
DROP VIEW IF EXISTS campaign_performance;
CREATE VIEW campaign_performance AS
SELECT 
  c.id,
  c.name as title,
  c.type,
  c.status,
  c.priority,
  COUNT(DISTINCT cu.order_id) as total_orders,
  COUNT(DISTINCT cu.customer_id) as unique_customers,
  SUM(cu.discount_amount) as total_discount_given,
  SUM(cu.items_count) as total_items_sold,
  AVG(cu.discount_amount) as avg_discount_per_order,
  MAX(cu.created_at) as last_used_at,
  c.created_at as campaign_created_at
FROM campaigns c
LEFT JOIN campaign_usage cu ON c.id = cu.campaign_id
GROUP BY c.id, c.name, c.type, c.status, c.priority, c.created_at
ORDER BY c.created_at DESC;

-- 7. Promotion Engine RPC: Calculate best campaign for a cart
CREATE OR REPLACE FUNCTION calculate_cart_campaign_discount(
  p_cart_items JSONB,
  p_customer_id UUID DEFAULT NULL,
  p_order_amount NUMERIC DEFAULT 0,
  p_dining_type TEXT DEFAULT 'dine_in',
  p_table_number INTEGER DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_campaign RECORD;
  v_rule RECORD;
  v_target RECORD;
  v_schedule RECORD;
  v_best_campaign_id UUID := NULL;
  v_best_discount NUMERIC := 0;
  v_best_free_items INTEGER := 0;
  v_best_message TEXT := '';
  v_best_rule_type TEXT := '';
  v_calc_result JSONB;
  v_now DATE := CURRENT_DATE;
  v_now_time TEXT := TO_CHAR(NOW(), 'HH24:MI');
  v_day_of_week INTEGER := EXTRACT(DOW FROM CURRENT_TIMESTAMP)::INTEGER;
  v_applicable_items JSONB := '[]'::jsonb;
  v_item JSONB;
  v_item_total NUMERIC := 0;
  v_item_count INTEGER := 0;
  v_eligible BOOLEAN;
  v_reason TEXT;
  v_usage_count INTEGER := 0;
  v_customer_usage_count INTEGER := 0;
BEGIN
  -- Iterate through all active campaigns ordered by priority
  FOR v_campaign IN
    SELECT * FROM campaigns 
    WHERE is_active = TRUE 
      AND deleted_at IS NULL
      AND (start_date IS NULL OR start_date <= v_now)
      AND (end_date IS NULL OR end_date >= v_now)
    ORDER BY priority DESC, created_at DESC
  LOOP
    -- Check schedule
    SELECT * INTO v_schedule FROM campaign_schedules 
    WHERE campaign_id = v_campaign.id 
      AND (start_date IS NULL OR start_date <= v_now)
      AND (end_date IS NULL OR end_date >= v_now)
      AND (is_recurring = TRUE OR (start_time IS NULL OR start_time <= v_now_time))
      AND (is_recurring = TRUE OR (end_time IS NULL OR end_time >= v_now_time))
      AND (weekdays IS NULL OR v_day_of_week = ANY(weekdays))
    LIMIT 1;

    IF v_campaign.start_date IS NULL AND v_campaign.end_date IS NULL AND NOT EXISTS (SELECT 1 FROM campaign_schedules WHERE campaign_id = v_campaign.id) THEN
      -- No date restrictions, always active
      v_schedule := NULL;
    ELSIF NOT FOUND THEN
      CONTINUE;
    END IF;

    -- Check usage limits
    IF v_campaign.max_uses IS NOT NULL AND v_campaign.max_uses > 0 THEN
      SELECT COUNT(*) INTO v_usage_count FROM campaign_usage WHERE campaign_id = v_campaign.id;
      IF v_usage_count >= v_campaign.max_uses THEN
        CONTINUE;
      END IF;
    END IF;

    IF v_campaign.max_uses_per_customer IS NOT NULL AND p_customer_id IS NOT NULL THEN
      SELECT COUNT(*) INTO v_customer_usage_count FROM campaign_usage WHERE campaign_id = v_campaign.id AND customer_id = p_customer_id;
      IF v_customer_usage_count >= v_campaign.max_uses_per_customer THEN
        CONTINUE;
      END IF;
    END IF;

    -- Check minimum/maximum order
    IF v_campaign.min_order_amount IS NOT NULL AND p_order_amount < v_campaign.min_order_amount THEN
      CONTINUE;
    END IF;
    IF v_campaign.max_order_amount IS NOT NULL AND p_order_amount > v_campaign.max_order_amount THEN
      CONTINUE;
    END IF;

    -- Check dining type
    IF v_campaign.dining_type IS NOT NULL AND p_dining_type != ANY(v_campaign.dining_type) THEN
      CONTINUE;
    END IF;

    -- Check table numbers
    IF v_campaign.table_numbers IS NOT NULL AND p_table_number IS NOT NULL AND p_table_number != ANY(v_campaign.table_numbers) THEN
      CONTINUE;
    END IF;

    -- Get applicable items
    SELECT jsonb_agg(item) INTO v_applicable_items
    FROM jsonb_array_elements(p_cart_items) item
    WHERE EXISTS (
      SELECT 1 FROM campaign_targets t
      WHERE t.campaign_id = v_campaign.id
        AND (
          (t.target_type = 'whole_order')
          OR (t.target_type = 'product' AND item->>'product_id' = t.target_id::text)
          OR (t.target_type = 'category' AND item->>'category_id' = t.target_id::text)
        )
    );

    IF v_applicable_items IS NULL OR jsonb_array_length(v_applicable_items) = 0 THEN
      -- If no specific targets, apply to whole order
      IF EXISTS (SELECT 1 FROM campaign_targets WHERE campaign_id = v_campaign.id AND target_type = 'whole_order') THEN
        v_applicable_items := p_cart_items;
      ELSE
        CONTINUE;
      END IF;
    END IF;

    -- Get campaign rule
    SELECT * INTO v_rule FROM campaign_rules WHERE campaign_id = v_campaign.id LIMIT 1;
    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    -- Calculate discount based on rule type
    v_calc_result := calculate_rule_discount(v_rule, v_applicable_items);
    IF (v_calc_result->>'discount_amount')::NUMERIC > v_best_discount THEN
      v_best_discount := (v_calc_result->>'discount_amount')::NUMERIC;
      v_best_free_items := (v_calc_result->>'free_items')::INTEGER;
      v_best_campaign_id := v_campaign.id;
      v_best_message := v_calc_result->>'message';
      v_best_rule_type := v_rule.rule_type;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'campaign_id', v_best_campaign_id,
    'discount_amount', ROUND(v_best_discount::NUMERIC, 2),
    'free_items', v_best_free_items,
    'message', v_best_message,
    'rule_type', v_best_rule_type
  );
END;
$$;

-- 8. Helper function: Calculate discount for a specific rule
CREATE OR REPLACE FUNCTION calculate_rule_discount(
  p_rule campaign_rules,
  p_items JSONB
) RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_discount NUMERIC := 0;
  v_free_items INTEGER := 0;
  v_message TEXT := '';
  v_item JSONB;
  v_applicable_count INTEGER := 0;
  v_sorted_items JSONB;
  v_price NUMERIC;
BEGIN
  IF p_rule.rule_type = 'percentage' THEN
    v_discount := 0;
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
      v_price := COALESCE((v_item->>'unit_price')::NUMERIC, 0);
      v_discount := v_discount + (v_price * (p_rule.percentage / 100));
    END LOOP;
    v_message := format('%s%% endirim', p_rule.percentage);

  ELSIF p_rule.rule_type = 'fixed_amount' THEN
    v_discount := LEAST(p_rule.fixed_amount, (SELECT SUM((item->>'unit_price')::NUMERIC) FROM jsonb_array_elements(p_items) item));
    v_message := format('₼%s endirim', p_rule.fixed_amount);

  ELSIF p_rule.rule_type = 'buy_x_pay_y' THEN
    v_applicable_count := (SELECT SUM((item->>'quantity')::INTEGER) FROM jsonb_array_elements(p_items) item);
    IF v_applicable_count >= p_rule.buy_quantity THEN
      v_free_items := (v_applicable_count / p_rule.buy_quantity) * (p_rule.buy_quantity - p_rule.pay_quantity);
      IF v_free_items > 0 THEN
        v_sorted_items := (SELECT jsonb_agg(item) FROM jsonb_array_elements(p_items) item ORDER BY (item->>'unit_price')::NUMERIC DESC);
        FOR v_item IN SELECT * FROM jsonb_array_elements(v_sorted_items)
        LOOP
          IF v_free_items <= 0 THEN EXIT; END IF;
          v_price := COALESCE((v_item->>'unit_price')::NUMERIC, 0);
          v_discount := v_discount + v_price;
          v_free_items := v_free_items - 1;
        END LOOP;
        v_free_items := (v_applicable_count / p_rule.buy_quantity) * (p_rule.buy_quantity - p_rule.pay_quantity);
      END IF;
      v_message := format('%s al %s ödə', p_rule.buy_quantity, p_rule.pay_quantity);
    END IF;

  ELSIF p_rule.rule_type = 'buy_x_get_y' THEN
    v_applicable_count := (SELECT SUM((item->>'quantity')::INTEGER) FROM jsonb_array_elements(p_items) item);
    IF v_applicable_count >= p_rule.buy_quantity THEN
      v_free_items := (v_applicable_count / (p_rule.buy_quantity + p_rule.free_quantity)) * p_rule.free_quantity;
      IF v_free_items > 0 THEN
        v_sorted_items := (SELECT jsonb_agg(item) FROM jsonb_array_elements(p_items) item ORDER BY (item->>'unit_price')::NUMERIC DESC);
        FOR v_item IN SELECT * FROM jsonb_array_elements(v_sorted_items)
        LOOP
          IF v_free_items <= 0 THEN EXIT; END IF;
          v_price := COALESCE((v_item->>'unit_price')::NUMERIC, 0);
          v_discount := v_discount + v_price;
          v_free_items := v_free_items - 1;
        END LOOP;
        v_free_items := (v_applicable_count / (p_rule.buy_quantity + p_rule.free_quantity)) * p_rule.free_quantity;
      END IF;
      v_message := format('%s al %s pulsuz', p_rule.buy_quantity, p_rule.free_quantity);
    END IF;

  ELSIF p_rule.rule_type = 'happy_hour' THEN
    v_discount := 0;
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
      v_price := COALESCE((v_item->>'unit_price')::NUMERIC, 0);
      v_discount := v_discount + (v_price * (COALESCE(p_rule.percentage, 0) / 100));
    END LOOP;
    v_message := format('Happy Hour: %s%%', COALESCE(p_rule.percentage, 0));

  ELSIF p_rule.rule_type = 'free_delivery' THEN
    v_discount := 0;
    v_message := 'Pulsuz çatdırılma';
  END IF;

  RETURN jsonb_build_object(
    'discount_amount', ROUND(v_discount::NUMERIC, 2),
    'free_items', v_free_items,
    'message', v_message
  );
END;
$$;

-- 9. RPC: Record campaign usage
CREATE OR REPLACE FUNCTION record_campaign_usage(
  p_campaign_id UUID,
  p_order_id UUID,
  p_customer_id UUID DEFAULT NULL,
  p_discount_amount NUMERIC DEFAULT 0,
  p_discount_type TEXT DEFAULT 'fixed',
  p_items_count INTEGER DEFAULT 1,
  p_order_amount NUMERIC DEFAULT 0,
  p_free_items INTEGER DEFAULT 0,
  p_rule_type TEXT DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO campaign_usage (
    campaign_id, order_id, customer_id, discount_amount, discount_type, items_count, order_amount, free_items, rule_type
  ) VALUES (
    p_campaign_id, p_order_id, p_customer_id, p_discount_amount, p_discount_type, p_items_count, p_order_amount, p_free_items, p_rule_type
  );

  UPDATE campaigns SET current_uses = COALESCE(current_uses, 0) + 1 WHERE id = p_campaign_id;
END;
$$;

-- 10. RPC: Check if customer is eligible for campaign
CREATE OR REPLACE FUNCTION is_customer_eligible_for_campaign(
  p_campaign_id UUID,
  p_customer_id UUID DEFAULT NULL,
  p_order_amount NUMERIC DEFAULT 0,
  p_items_count INTEGER DEFAULT 1
) RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_campaign RECORD;
  v_eligible BOOLEAN := TRUE;
  v_reason TEXT := NULL;
  v_usage_count INTEGER := 0;
BEGIN
  SELECT * INTO v_campaign FROM campaigns WHERE id = p_campaign_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('eligible', FALSE, 'reason', 'Kampaniya tapılmadı');
  END IF;

  IF NOT v_campaign.is_active THEN
    v_eligible := FALSE;
    v_reason := 'Kampaniya deaktivdir';
    RETURN jsonb_build_object('eligible', FALSE, 'reason', v_reason);
  END IF;

  IF v_campaign.max_uses IS NOT NULL AND v_campaign.max_uses > 0 THEN
    SELECT COUNT(*) INTO v_usage_count FROM campaign_usage WHERE campaign_id = p_campaign_id;
    IF v_usage_count >= v_campaign.max_uses THEN
      v_eligible := FALSE;
      v_reason := 'Kampaniya limitinə çatıldı';
      RETURN jsonb_build_object('eligible', FALSE, 'reason', v_reason);
    END IF;
  END IF;

  IF v_campaign.max_uses_per_customer IS NOT NULL AND p_customer_id IS NOT NULL THEN
    SELECT COUNT(*) INTO v_usage_count FROM campaign_usage WHERE campaign_id = p_campaign_id AND customer_id = p_customer_id;
    IF v_usage_count >= v_campaign.max_uses_per_customer THEN
      v_eligible := FALSE;
      v_reason := 'Müştəri limitinə çatıldı';
      RETURN jsonb_build_object('eligible', FALSE, 'reason', v_reason);
    END IF;
  END IF;

  IF v_campaign.min_order_amount IS NOT NULL AND p_order_amount < v_campaign.min_order_amount THEN
    v_eligible := FALSE;
    v_reason := format('Minimum sifariş: ₼%s', v_campaign.min_order_amount);
    RETURN jsonb_build_object('eligible', FALSE, 'reason', v_reason);
  END IF;

  IF v_campaign.max_order_amount IS NOT NULL AND p_order_amount > v_campaign.max_order_amount THEN
    v_eligible := FALSE;
    v_reason := format('Maksimum sifariş: ₼%s', v_campaign.max_order_amount);
    RETURN jsonb_build_object('eligible', FALSE, 'reason', v_reason);
  END IF;

  RETURN jsonb_build_object('eligible', TRUE, 'reason', NULL);
END;
$$;

-- 11. RPC: Auto-apply best campaign for an order
CREATE OR REPLACE FUNCTION auto_apply_campaigns(
  p_order_id UUID,
  p_customer_id UUID DEFAULT NULL,
  p_order_amount NUMERIC DEFAULT 0,
  p_dining_type TEXT DEFAULT 'dine_in',
  p_table_number INTEGER DEFAULT NULL,
  p_cart_items JSONB DEFAULT '[]'::jsonb
) RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_result JSONB;
  v_campaign_id UUID;
  v_discount_amount NUMERIC;
  v_free_items INTEGER;
  v_message TEXT;
  v_rule_type TEXT;
BEGIN
  SELECT * INTO v_result FROM calculate_cart_campaign_discount(p_cart_items, p_customer_id, p_order_amount, p_dining_type, p_table_number);
  
  v_campaign_id := v_result->>'campaign_id';
  v_discount_amount := (v_result->>'discount_amount')::NUMERIC;
  v_free_items := (v_result->>'free_items')::INTEGER;
  v_message := v_result->>'message';
  v_rule_type := v_result->>'rule_type';

  IF v_campaign_id IS NOT NULL THEN
    PERFORM record_campaign_usage(v_campaign_id, p_order_id, p_customer_id, v_discount_amount, 'fixed', jsonb_array_length(p_cart_items), p_order_amount, v_free_items, v_rule_type);
  END IF;

  RETURN jsonb_build_object(
    'applied', v_campaign_id IS NOT NULL,
    'campaign_id', v_campaign_id,
    'discount_amount', v_discount_amount,
    'free_items', v_free_items,
    'message', v_message,
    'rule_type', v_rule_type
  );
END;
$$;

-- 12. Migration helper: Migrate existing campaigns to new structure
CREATE OR REPLACE FUNCTION migrate_existing_campaigns() RETURNS VOID AS $$
DECLARE
  v_campaign RECORD;
  v_rule_id UUID;
BEGIN
  FOR v_campaign IN SELECT * FROM campaigns WHERE rule_type IS NULL LOOP
    -- Create rule based on existing type
    IF v_campaign.type = 'PERCENTAGE' OR v_campaign.type = 'HAPPY_HOUR' THEN
      INSERT INTO campaign_rules (campaign_id, rule_type, percentage, start_time, end_time)
      VALUES (v_campaign.id, lower(v_campaign.type), COALESCE(v_campaign.discount_value, 0), v_campaign.start_time::TIME, v_campaign.end_time::TIME)
      RETURNING id INTO v_rule_id;
    ELSIF v_campaign.type = 'FIXED_AMOUNT' THEN
      INSERT INTO campaign_rules (campaign_id, rule_type, fixed_amount)
      VALUES (v_campaign.id, 'fixed_amount', COALESCE(v_campaign.discount_value, 0))
      RETURNING id INTO v_rule_id;
    ELSIF v_campaign.type = 'BOGO' THEN
      INSERT INTO campaign_rules (campaign_id, rule_type, buy_quantity, pay_quantity)
      VALUES (v_campaign.id, 'buy_x_pay_y', 1, 1)
      RETURNING id INTO v_rule_id;
    ELSIF v_campaign.type = 'BUY2GET1' THEN
      INSERT INTO campaign_rules (campaign_id, rule_type, buy_quantity, pay_quantity)
      VALUES (v_campaign.id, 'buy_x_pay_y', 2, 1)
      RETURNING id INTO v_rule_id;
    ELSIF v_campaign.type = 'FREE_DELIVERY' THEN
      INSERT INTO campaign_rules (campaign_id, rule_type, delivery_min_order)
      VALUES (v_campaign.id, 'free_delivery', COALESCE(v_campaign.min_purchase_amount, 0))
      RETURNING id INTO v_rule_id;
    END IF;

    -- Create targets
    IF v_campaign.target_type = 'product' AND v_campaign.target_id IS NOT NULL THEN
      INSERT INTO campaign_targets (campaign_id, target_type, target_id)
      VALUES (v_campaign.id, 'product', v_campaign.target_id);
    ELSIF v_campaign.target_type = 'category' AND v_campaign.target_id IS NOT NULL THEN
      INSERT INTO campaign_targets (campaign_id, target_type, target_id)
      VALUES (v_campaign.id, 'category', v_campaign.target_id);
    ELSIF v_campaign.target_type = 'all' THEN
      INSERT INTO campaign_targets (campaign_id, target_type, target_id)
      VALUES (v_campaign.id, 'whole_order', NULL);
    END IF;

    -- Create schedule
    IF v_campaign.start_date IS NOT NULL OR v_campaign.end_date IS NOT NULL THEN
      INSERT INTO campaign_schedules (campaign_id, start_date, end_date, start_time, end_time)
      VALUES (v_campaign.id, v_campaign.start_date, v_campaign.end_date, v_campaign.start_time::TIME, v_campaign.end_time::TIME);
    END IF;
  END LOOP;
END;
$$;

-- 13. Indexes for performance
CREATE INDEX IF NOT EXISTS idx_campaigns_active ON campaigns(is_active, deleted_at, start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(status) WHERE deleted_at IS NULL;

-- 14. Trigger for updated_at
CREATE OR REPLACE FUNCTION update_campaign_rules_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_campaign_rules_updated_at ON campaign_rules;
CREATE TRIGGER trigger_campaign_rules_updated_at
  BEFORE UPDATE ON campaign_rules
  FOR EACH ROW EXECUTE FUNCTION update_campaign_rules_updated_at();

-- 15. Soft delete trigger
CREATE OR REPLACE FUNCTION soft_delete_campaign()
RETURNS TRIGGER AS $$
BEGIN
  NEW.deleted_at = now();
  NEW.is_active = FALSE;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_soft_delete_campaign ON campaigns;
CREATE TRIGGER trigger_soft_delete_campaign
  BEFORE DELETE ON campaigns
  FOR EACH ROW EXECUTE FUNCTION soft_delete_campaign();

-- ============================================================================
-- END OF CAMPAIGN SYSTEM REFACTOR
-- ============================================================================
