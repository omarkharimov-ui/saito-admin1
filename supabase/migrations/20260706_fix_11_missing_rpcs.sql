-- ============================================================================
-- Fix 11: Create fixed auto_apply_campaigns RPC
-- campaigns table has `type` (not `discount_type`) — function must use `type`
-- ============================================================================

-- ─── 1. auto_apply_campaigns ───
CREATE OR REPLACE FUNCTION auto_apply_campaigns(p_order_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order RECORD;
  v_campaign RECORD;
  v_total_amount NUMERIC;
  v_item_count INTEGER;
  v_discount NUMERIC;
  v_category_ids TEXT[];
  v_product_ids TEXT[];
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
  SELECT * INTO v_campaign
  FROM campaigns
  WHERE status = 'active'
    AND (max_uses IS NULL OR current_uses < max_uses)
    AND (start_date IS NULL OR start_date <= CURRENT_DATE)
    AND (end_date IS NULL OR end_date >= CURRENT_DATE)
    AND (start_time IS NULL OR start_time <= CURRENT_TIME::text)
    AND (end_time IS NULL OR end_time >= CURRENT_TIME::text)
    AND (
      target_type = 'order'
      OR (target_type = 'product' AND target_id::text = ANY(COALESCE(v_product_ids, ARRAY[]::TEXT[])))
      OR (target_type = 'category' AND target_id::text = ANY(COALESCE(v_category_ids, ARRAY[]::TEXT[])))
    )
  ORDER BY priority DESC NULLS LAST LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('applied', false, 'reason', 'NO_MATCHING_CAMPAIGN');
  END IF;
  IF v_campaign.min_purchase_amount IS NOT NULL AND v_total_amount < v_campaign.min_purchase_amount THEN
    RETURN jsonb_build_object('applied', false, 'reason', 'MIN_PURCHASE_NOT_MET');
  END IF;
  IF v_campaign.min_items IS NOT NULL AND v_item_count < v_campaign.min_items THEN
    RETURN jsonb_build_object('applied', false, 'reason', 'MIN_ITEMS_NOT_MET');
  END IF;
  IF v_campaign.type IN ('PERCENTAGE', 'HAPPY_HOUR', 'percentage') THEN
    v_discount := v_total_amount * (COALESCE(v_campaign.discount_value, 0) / 100.0);
  ELSE
    v_discount := COALESCE(v_campaign.discount_value, 0)::NUMERIC;
  END IF;
  IF v_campaign.max_discount_amount IS NOT NULL AND v_discount > v_campaign.max_discount_amount THEN
    v_discount := v_campaign.max_discount_amount;
  END IF;
  v_discount := GREATEST(0, v_discount);
  RETURN jsonb_build_object(
    'applied', true,
    'campaign_id', v_campaign.id,
    'discount_amount', v_discount,
    'discount_type', v_campaign.type
  );
END;
$$;

GRANT EXECUTE ON FUNCTION auto_apply_campaigns(UUID) TO authenticated, anon;
