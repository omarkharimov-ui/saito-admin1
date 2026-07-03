-- ============================================================================
-- Fix 11: Create missing RPCs (auto_apply_campaigns, reverse_stock_deduction)
-- These were previously created manually in Supabase dashboard but never
-- added to migration files. New environments will be missing them.
-- ============================================================================

-- ─── 1. auto_apply_campaigns ───
-- Preview/auto-apply the best campaign for an order.
-- Called from pay/route.ts and POS page for campaign preview.
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
  -- Get order
  SELECT * INTO v_order FROM orders WHERE id = p_order_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('applied', false, 'reason', 'ORDER_NOT_FOUND');
  END IF;

  -- Calculate total and item count from order_items
  SELECT COALESCE(SUM(COALESCE(total_price, unit_price * quantity)), 0), COUNT(*)
  INTO v_total_amount, v_item_count
  FROM order_items WHERE order_id = p_order_id;

  IF v_item_count = 0 THEN
    RETURN jsonb_build_object('applied', false, 'reason', 'NO_ITEMS');
  END IF;

  -- Collect product and category IDs for campaign matching
  SELECT ARRAY_AGG(DISTINCT oi.product_id::text) FILTER (WHERE oi.product_id IS NOT NULL),
         ARRAY_AGG(DISTINCT p.category_id::text) FILTER (WHERE p.category_id IS NOT NULL)
  INTO v_product_ids, v_category_ids
  FROM order_items oi
  LEFT JOIN products p ON p.id = oi.product_id
  WHERE oi.order_id = p_order_id;

  -- Find best matching active campaign
  SELECT * INTO v_campaign
  FROM campaigns
  WHERE status = 'active'
    AND (max_uses IS NULL OR current_uses < max_uses)
    AND (start_date IS NULL OR start_date <= CURRENT_DATE)
    AND (end_date IS NULL OR end_date >= CURRENT_DATE)
    AND (start_time IS NULL OR start_time <= CURRENT_TIME::text)
    AND (end_time IS NULL OR end_time >= CURRENT_TIME::text)
    AND (
      target_type IS NULL
      OR target_type = 'order'
      OR (target_type = 'product' AND target_id::text = ANY(COALESCE(v_product_ids, ARRAY[]::TEXT[])))
      OR (target_type = 'category' AND target_id::text = ANY(COALESCE(v_category_ids, ARRAY[]::TEXT[])))
      OR (target_type = 'product' AND target_id = ANY(COALESCE(applicable_products, ARRAY[]::TEXT[])))
      OR (target_type = 'category' AND target_id = ANY(COALESCE(applicable_categories, ARRAY[]::TEXT[])))
    )
  ORDER BY priority DESC NULLS LAST
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('applied', false, 'reason', 'NO_MATCHING_CAMPAIGN');
  END IF;

  -- Check minimum purchase
  IF v_campaign.min_purchase_amount IS NOT NULL AND v_total_amount < v_campaign.min_purchase_amount THEN
    RETURN jsonb_build_object('applied', false, 'reason', 'MIN_PURCHASE_NOT_MET');
  END IF;

  IF v_campaign.min_items IS NOT NULL AND v_item_count < v_campaign.min_items THEN
    RETURN jsonb_build_object('applied', false, 'reason', 'MIN_ITEMS_NOT_MET');
  END IF;

  -- Calculate discount
  IF v_campaign.discount_type = 'percentage' OR v_campaign.type IN ('PERCENTAGE', 'HAPPY_HOUR') THEN
    v_discount := v_total_amount * (COALESCE(v_campaign.discount_value, 0) / 100.0);
  ELSE
    v_discount := COALESCE(v_campaign.discount_value, 0)::NUMERIC;
  END IF;

  -- Apply max discount cap
  IF v_campaign.max_discount_amount IS NOT NULL AND v_discount > v_campaign.max_discount_amount THEN
    v_discount := v_campaign.max_discount_amount;
  END IF;

  v_discount := GREATEST(0, v_discount);

  RETURN jsonb_build_object(
    'applied', true,
    'campaign_id', v_campaign.id,
    'discount_amount', v_discount,
    'discount_type', COALESCE(v_campaign.discount_type, v_campaign.type)
  );
END;
$$;

-- ─── 2. reverse_stock_deduction ───
-- Reverses inventory deductions for a cancelled order.
-- Called from /api/orders/cancel/route.ts
CREATE OR REPLACE FUNCTION reverse_stock_deduction(p_order_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_log RECORD;
  v_total_restored NUMERIC := 0;
BEGIN
  -- Find all inventory logs for this order
  FOR v_log IN
    SELECT id, ingredient_id, quantity
    FROM inventory_logs
    WHERE reference_type = 'order' AND reference_id = p_order_id
      AND type = 'order_consumption'
  LOOP
    -- Restore stock to ingredient
    UPDATE ingredients
    SET current_stock = current_stock + v_log.quantity,
        theoretical_stock = theoretical_stock + v_log.quantity,
        updated_at = now()
    WHERE id = v_log.ingredient_id;

    -- Delete the consumption log
    DELETE FROM inventory_logs WHERE id = v_log.id;

    v_total_restored := v_total_restored + v_log.quantity;
  END LOOP;

  -- Clean up any campaign_usage for this order
  DELETE FROM campaign_usage WHERE order_id = p_order_id;

  RETURN jsonb_build_object(
    'success', true,
    'order_id', p_order_id,
    'total_restored', v_total_restored
  );
END;
$$;

-- ─── 3. Grant execute permissions to anon/authenticated ───
GRANT EXECUTE ON FUNCTION auto_apply_campaigns(UUID) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION reverse_stock_deduction(UUID) TO authenticated, anon;
