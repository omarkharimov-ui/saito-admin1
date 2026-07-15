-- ============================================================================
-- Campaign system expansion for world-class restaurant operations
-- Adds support for: Buy X Get Y, combo deals, customer segmentation,
-- usage limits, day targeting, and stacking rules
-- ============================================================================

-- 0. Add campaign_id to orders table
ALTER TABLE orders ADD COLUMN IF NOT EXISTS campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL;

-- 1. Campaign type columns for Buy X Get Y logic
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS buy_quantity INTEGER DEFAULT 1;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS get_quantity INTEGER DEFAULT 1;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS get_same_product BOOLEAN DEFAULT TRUE;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS get_product_id UUID REFERENCES products(id) ON DELETE SET NULL;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS get_category_id UUID REFERENCES categories(id) ON DELETE SET NULL;

-- 2. Usage limits
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS max_uses_per_customer INTEGER;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS max_uses_per_day INTEGER;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS max_discount_amount NUMERIC(10,2);

-- 3. Customer targeting
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS target_customer_type TEXT DEFAULT 'all';
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS min_visit_count INTEGER DEFAULT 0;

-- 4. Day and table targeting
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS applicable_days INTEGER[] DEFAULT '{1,2,3,4,5,6,7}';
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS applicable_tables INTEGER[];
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS applicable_rooms TEXT[];

-- 5. Stacking rules
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS stackable BOOLEAN DEFAULT FALSE;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS stack_with_ids UUID[];

-- 6. Combo deal support
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS combo_id UUID REFERENCES combos(id) ON DELETE SET NULL;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS combo_discount_type TEXT DEFAULT 'fixed'; -- 'fixed', 'percentage'
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS combo_discount_value NUMERIC(10,2) DEFAULT 0;

-- 7. Campaign usage tracking
CREATE TABLE IF NOT EXISTS campaign_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  discount_amount NUMERIC(10,2) NOT NULL,
  discount_type TEXT NOT NULL,
  items_count INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_campaign_usage_campaign ON campaign_usage(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_usage_customer ON campaign_usage(customer_id);
CREATE INDEX IF NOT EXISTS idx_campaign_usage_order ON campaign_usage(order_id);
CREATE INDEX IF NOT EXISTS idx_campaign_usage_created ON campaign_usage(created_at);

-- 8. RLS policies
ALTER TABLE campaign_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS campaign_usage_select ON campaign_usage;
CREATE POLICY campaign_usage_select ON campaign_usage FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS campaign_usage_insert ON campaign_usage;
CREATE POLICY campaign_usage_insert ON campaign_usage FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS campaign_usage_update ON campaign_usage;
CREATE POLICY campaign_usage_update ON campaign_usage FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- 9. Campaign performance view
CREATE OR REPLACE VIEW campaign_performance AS
SELECT 
  c.id,
  c.title,
  c.type,
  c.status,
  COUNT(DISTINCT cu.order_id) as total_orders,
  COUNT(DISTINCT cu.customer_id) as unique_customers,
  SUM(cu.discount_amount) as total_discount_given,
  SUM(cu.items_count) as total_items_sold,
  AVG(cu.discount_amount) as avg_discount_per_order,
  MAX(cu.created_at) as last_used_at,
  c.created_at as campaign_created_at
FROM campaigns c
LEFT JOIN campaign_usage cu ON c.id = cu.campaign_id
GROUP BY c.id, c.title, c.type, c.status, c.created_at
ORDER BY c.created_at DESC;

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
  SELECT * INTO v_campaign FROM campaigns WHERE id = p_campaign_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('eligible', FALSE, 'reason', 'Campaign not found');
  END IF;

  IF v_campaign.status != 'active' THEN
    v_eligible := FALSE;
    v_reason := 'Campaign is not active';
    RETURN jsonb_build_object('eligible', FALSE, 'reason', v_reason);
  END IF;

  IF v_campaign.max_uses IS NOT NULL AND v_campaign.max_uses > 0 THEN
    SELECT COUNT(*) INTO v_usage_count FROM campaign_usage WHERE campaign_id = p_campaign_id;
    IF v_usage_count >= v_campaign.max_uses THEN
      v_eligible := FALSE;
      v_reason := 'Campaign usage limit reached';
      RETURN jsonb_build_object('eligible', FALSE, 'reason', v_reason);
    END IF;
  END IF;

  IF v_campaign.max_uses_per_customer IS NOT NULL AND p_customer_id IS NOT NULL THEN
    SELECT COUNT(*) INTO v_usage_count FROM campaign_usage WHERE campaign_id = p_campaign_id AND customer_id = p_customer_id;
    IF v_usage_count >= v_campaign.max_uses_per_customer THEN
      v_eligible := FALSE;
      v_reason := 'Customer usage limit reached';
      RETURN jsonb_build_object('eligible', FALSE, 'reason', v_reason);
    END IF;
  END IF;

  IF v_campaign.min_purchase_amount IS NOT NULL AND v_campaign.min_purchase_amount > 0 THEN
    IF p_order_amount < v_campaign.min_purchase_amount THEN
      v_eligible := FALSE;
      v_reason := format('Minimum order amount is %s', v_campaign.min_purchase_amount);
      RETURN jsonb_build_object('eligible', FALSE, 'reason', v_reason);
    END IF;
  END IF;

  IF v_campaign.min_items IS NOT NULL AND v_campaign.min_items > 0 THEN
    IF p_items_count < v_campaign.min_items THEN
      v_eligible := FALSE;
      v_reason := format('Minimum %s items required', v_campaign.min_items);
      RETURN jsonb_build_object('eligible', FALSE, 'reason', v_reason);
    END IF;
  END IF;

  RETURN jsonb_build_object('eligible', TRUE, 'reason', NULL);
END;
$$;

-- 11. RPC: Calculate cart-level discount for Buy X Get Y campaigns
CREATE OR REPLACE FUNCTION calculate_cart_campaign_discount(
  p_campaign_id UUID,
  p_cart_items JSONB,
  p_product_prices JSONB DEFAULT '{}'::jsonb
) RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_campaign RECORD;
  v_items JSONB;
  v_buy_qty INTEGER;
  v_get_qty INTEGER;
  v_free_items INTEGER := 0;
  v_discount_amount NUMERIC := 0;
  v_item JSONB;
  v_price NUMERIC;
  v_target_items JSONB := '[]'::jsonb;
  v_applicable_count INTEGER := 0;
  v_eligible BOOLEAN;
  v_reason TEXT;
BEGIN
  SELECT * INTO v_campaign FROM campaigns WHERE id = p_campaign_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('discount_amount', 0, 'free_items', 0, 'eligible', FALSE, 'reason', 'Campaign not found');
  END IF;

  IF v_campaign.type NOT IN ('BOGO', 'BUY2GET1') THEN
    RETURN jsonb_build_object('discount_amount', 0, 'free_items', 0, 'eligible', FALSE, 'reason', 'Not a Buy X Get Y campaign');
  END IF;

  IF v_campaign.type = 'BOGO' THEN
    v_buy_qty := 1;
    v_get_qty := 1;
  ELSIF v_campaign.type = 'BUY2GET1' THEN
    v_buy_qty := 2;
    v_get_qty := 1;
  END IF;

  IF v_campaign.buy_quantity IS NOT NULL THEN
    v_buy_qty := v_campaign.buy_quantity;
  END IF;
  IF v_campaign.get_quantity IS NOT NULL THEN
    v_get_qty := v_campaign.get_quantity;
  END IF;

  IF v_campaign.target_type = 'product' AND v_campaign.target_id IS NOT NULL THEN
    SELECT jsonb_agg(item) INTO v_target_items
    FROM jsonb_array_elements(p_cart_items) item
    WHERE item->>'product_id' = v_campaign.target_id;
  ELSIF v_campaign.target_type = 'category' AND v_campaign.target_id IS NOT NULL THEN
    SELECT jsonb_agg(item) INTO v_target_items
    FROM jsonb_array_elements(p_cart_items) item
    WHERE item->>'category_id' = v_campaign.target_id;
  ELSE
    v_target_items := p_cart_items;
  END IF;

  v_applicable_count := 0;
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_target_items)
  LOOP
    v_applicable_count := v_applicable_count + (v_item->>'quantity')::INTEGER;
  END LOOP;

  IF v_applicable_count < v_buy_qty THEN
    RETURN jsonb_build_object('discount_amount', 0, 'free_items', 0, 'eligible', FALSE, 'reason', 'Not enough items');
  END IF;

  v_free_items := (v_applicable_count / (v_buy_qty + v_get_qty)) * v_get_qty;
  IF v_free_items <= 0 THEN
    RETURN jsonb_build_object('discount_amount', 0, 'free_items', 0, 'eligible', TRUE, 'reason', NULL);
  END IF;

  v_discount_amount := 0;
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_target_items) ORDER BY (v_item->>'unit_price')::NUMERIC DESC
  LOOP
    IF v_free_items <= 0 THEN EXIT; END IF;
    v_price := COALESCE((v_item->>'unit_price')::NUMERIC, 0);
    v_discount_amount := v_discount_amount + v_price;
    v_free_items := v_free_items - 1;
  END LOOP;

  RETURN jsonb_build_object(
    'discount_amount', ROUND(v_discount_amount::NUMERIC, 2),
    'free_items', v_free_items + (v_applicable_count / (v_buy_qty + v_get_qty)) * v_get_qty,
    'eligible', TRUE,
    'reason', NULL
  );
END;
$$;

-- 12. RPC: Get best campaign for a cart
CREATE OR REPLACE FUNCTION get_best_cart_campaign(
  p_cart_items JSONB,
  p_customer_id UUID DEFAULT NULL,
  p_order_amount NUMERIC DEFAULT 0
) RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_campaign RECORD;
  v_best_campaign_id UUID := NULL;
  v_best_discount NUMERIC := 0;
  v_calc_result JSONB;
  v_now DATE := CURRENT_DATE;
  v_now_time TEXT := TO_CHAR(NOW(), 'HH24:MI');
BEGIN
  FOR v_campaign IN
    SELECT * FROM campaigns
    WHERE status = 'active'
      AND (start_date IS NULL OR start_date <= v_now)
      AND (end_date IS NULL OR end_date >= v_now)
      AND (start_time IS NULL OR start_time <= v_now_time)
      AND (end_time IS NULL OR end_time >= v_now_time)
    ORDER BY priority DESC, created_at DESC
  LOOP
    IF v_campaign.type IN ('PERCENTAGE', 'HAPPY_HOUR', 'FIXED_AMOUNT') THEN
      SELECT calculate_cart_campaign_discount(v_campaign.id, p_cart_items) INTO v_calc_result;
      IF (v_calc_result->>'discount_amount')::NUMERIC > v_best_discount THEN
        v_best_discount := (v_calc_result->>'discount_amount')::NUMERIC;
        v_best_campaign_id := v_campaign.id;
      END IF;
    ELSIF v_campaign.type IN ('BOGO', 'BUY2GET1') THEN
      SELECT calculate_cart_campaign_discount(v_campaign.id, p_cart_items) INTO v_calc_result;
      IF (v_calc_result->>'discount_amount')::NUMERIC > v_best_discount THEN
        v_best_discount := (v_calc_result->>'discount_amount')::NUMERIC;
        v_best_campaign_id := v_campaign.id;
      END IF;
    END IF;
  END LOOP;

  IF v_best_campaign_id IS NULL THEN
    RETURN jsonb_build_object('campaign_id', NULL, 'discount_amount', 0);
  END IF;

  RETURN jsonb_build_object('campaign_id', v_best_campaign_id, 'discount_amount', v_best_discount);
END;
$$;

-- 13. RPC: Record campaign usage
CREATE OR REPLACE FUNCTION record_campaign_usage(
  p_campaign_id UUID,
  p_order_id UUID,
  p_customer_id UUID DEFAULT NULL,
  p_discount_amount NUMERIC DEFAULT 0,
  p_discount_type TEXT DEFAULT 'percentage',
  p_items_count INTEGER DEFAULT 1
) RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO campaign_usage (
    campaign_id, order_id, customer_id, discount_amount, discount_type, items_count
  ) VALUES (
    p_campaign_id, p_order_id, p_customer_id, p_discount_amount, p_discount_type, p_items_count
  );

  UPDATE campaigns SET current_uses = COALESCE(current_uses, 0) + 1 WHERE id = p_campaign_id;
END;
$$;

-- 14. Indexes for new columns
CREATE INDEX IF NOT EXISTS idx_campaigns_buy_get ON campaigns(buy_quantity, get_quantity);
CREATE INDEX IF NOT EXISTS idx_campaigns_target_customer ON campaigns(target_customer_type);
CREATE INDEX IF NOT EXISTS idx_campaigns_combo ON campaigns(combo_id);

-- 15. Campaign expiry check function
CREATE OR REPLACE FUNCTION check_campaign_expiry() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'active' THEN
    IF NEW.end_date IS NOT NULL AND NEW.end_date < CURRENT_DATE THEN
      NEW.status := 'expired';
    END IF;
    IF NEW.end_time IS NOT NULL AND NEW.start_time IS NOT NULL THEN
      IF NEW.end_time < TO_CHAR(NOW(), 'HH24:MI') AND NEW.start_time > NEW.end_time THEN
        NEW.status := 'expired';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_check_campaign_expiry ON campaigns;
CREATE TRIGGER trigger_check_campaign_expiry
  BEFORE INSERT OR UPDATE ON campaigns
  FOR EACH ROW EXECUTE FUNCTION check_campaign_expiry();

-- ============================================================================
-- END OF CAMPAIGN SYSTEM EXPANSION
-- ============================================================================
