-- ============================================================================
-- Fix: auto_apply_campaigns — remove double-count, normalize discount_type,
--       align discount math with the POS inline engine.
-- ============================================================================
-- Root cause of the double-count: auto_apply_campaigns incremented
-- campaigns.current_uses, AND process_order_payment ALSO inserts into
-- campaign_usage and increments current_uses for the same order. The pay route
-- calls auto_apply_campaigns BEFORE process_order_payment, so the counter was
-- incremented twice per paid order.
--
-- Fix: make auto_apply_campaigns a PURE READ. It returns the best matching
-- campaign + the discount it WOULD apply, but it no longer mutates usage.
-- process_order_payment remains the sole writer of campaign_usage + current_uses.
--
-- Additionally:
--  * discount_type now returns the rule's rule_type (lowercase, e.g.
--    'percentage'), matching the inline computeEffectivePrice engine and the
--    orders.discount_type values the rest of the app stores. Previously it
--    returned campaigns.type (uppercase, e.g. 'PERCENTAGE'), breaking analytics.
--  * Order/delivery-scoped rules (free_delivery, combo, whole_order) produce no
--    item-level discount. They now return applied=false (not a phantom 0.00
--    discount) so the pay route will not store a discount it did not earn.

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
  v_target RECORD;
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
    -- max_uses IS NULL or <= 0 means unlimited; only block when a positive
    -- cap has been reached.
    AND (c.max_uses IS NULL OR c.max_uses <= 0 OR c.current_uses < c.max_uses)
    AND (c.start_date IS NULL OR c.start_date <= CURRENT_DATE)
    AND (c.end_date IS NULL OR c.end_date >= CURRENT_DATE)
    AND EXISTS (
      SELECT 1 FROM campaign_targets ct
      WHERE ct.campaign_id = c.id
        AND (
          ct.target_type = 'category' AND ct.target_id::text = ANY(COALESCE(v_category_ids, ARRAY[]::TEXT[]))
          OR ct.target_type = 'product' AND ct.target_id::text = ANY(COALESCE(v_product_ids, ARRAY[]::TEXT[]))
          OR ct.target_type = 'whole_order'
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

  -- Order/delivery-scoped rules produce no item-level discount. Do not apply a
  -- phantom 0.00 — return applied=false so usage is not recorded for them.
  IF v_rule.rule_type IN ('free_delivery', 'combo', 'whole_order') THEN
    RETURN jsonb_build_object(
      'applied', false,
      'reason', 'ORDER_SCOPED_RULE',
      'rule_type', v_rule.rule_type
    );
  END IF;

  -- Calculate discount based on rule type — aligned with the POS inline engine
  -- (src/app/api/pos/products/route.ts computeEffectivePrice).
  IF v_rule.rule_type IN ('percentage', 'happy_hour') THEN
    v_discount := ROUND(v_total_amount * (COALESCE(v_rule.percentage, 0) / 100.0) * 100) / 100;
  ELSIF v_rule.rule_type = 'fixed_amount' THEN
    v_discount := LEAST(COALESCE(v_rule.fixed_amount, 0), v_total_amount);
  ELSIF v_rule.rule_type IN ('buy_x_pay_y', 'buy_x_get_y') THEN
    -- Simplified per-campaign (order-level) approximation: the eligible free
    -- fraction of one unit's price, where buy/pay/free are taken as quantities.
    -- This mirrors the inline engine's per-item math so the value is non-zero
    -- and consistent rather than silently 0.
    DECLARE
      v_buy INTEGER := COALESCE(v_rule.buy_quantity, 2);
      v_pay INTEGER := COALESCE(v_rule.pay_quantity, 1);
      v_free INTEGER := COALESCE(v_rule.free_quantity, 1);
      v_free_per_group NUMERIC;
    BEGIN
      IF v_buy <= 0 THEN v_buy := 2; END IF;
      v_free_per_group := CASE
        WHEN v_rule.rule_type = 'buy_x_pay_y' THEN (v_buy - v_pay)
        ELSE v_free
      END;
      -- Distribute the free fraction across the whole order total proportionally.
      v_discount := ROUND(v_total_amount * (v_free_per_group / v_buy) * 100) / 100;
    END;
  END IF;

  IF v_campaign.max_discount_amount IS NOT NULL AND v_discount > v_campaign.max_discount_amount THEN
    v_discount := v_campaign.max_discount_amount;
  END IF;
  v_discount := GREATEST(0, v_discount);

  -- NOTE: no current_uses increment here. process_order_payment is the sole
  -- writer of campaign_usage + current_uses for the paid order.

  RETURN jsonb_build_object(
    'applied', true,
    'campaign_id', v_campaign.id,
    'discount_amount', v_discount,
    'discount_type', v_rule.rule_type
  );
END;
$$;

GRANT EXECUTE ON FUNCTION auto_apply_campaigns(UUID) TO authenticated, anon;
