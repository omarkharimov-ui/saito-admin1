CREATE FUNCTION public.calculate_cart_campaign_discount (
  p_cart_items   jsonb,
  p_customer_id  uuid    DEFAULT NULL::uuid,
  p_order_amount numeric DEFAULT 0,
  p_dining_type  text    DEFAULT 'dine_in'::text,
  p_table_number integer DEFAULT NULL::integer
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  AS $function$
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
  v_usage_count INTEGER := 0;
  v_customer_usage_count INTEGER := 0;
BEGIN
  FOR v_campaign IN
    SELECT * FROM campaigns 
    WHERE is_active = TRUE 
      AND deleted_at IS NULL
      AND (start_date IS NULL OR start_date <= v_now)
      AND (end_date IS NULL OR end_date >= v_now)
    ORDER BY priority DESC, created_at DESC
  LOOP
    SELECT * INTO v_schedule FROM campaign_schedules 
    WHERE campaign_id = v_campaign.id 
      AND (start_date IS NULL OR start_date <= v_now)
      AND (end_date IS NULL OR end_date >= v_now)
      AND (is_recurring = TRUE OR (start_time IS NULL OR start_time <= v_now_time))
      AND (is_recurring = TRUE OR (end_time IS NULL OR end_time >= v_now_time))
      AND (weekdays IS NULL OR v_day_of_week = ANY(weekdays))
    LIMIT 1;

    IF v_campaign.start_date IS NULL AND v_campaign.end_date IS NULL AND NOT EXISTS (SELECT 1 FROM campaign_schedules WHERE campaign_id = v_campaign.id) THEN
      v_schedule := NULL;
    ELSIF NOT FOUND THEN
      CONTINUE;
    END IF;

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

    IF v_campaign.min_order_amount IS NOT NULL AND p_order_amount < v_campaign.min_order_amount THEN
      CONTINUE;
    END IF;
    IF v_campaign.max_order_amount IS NOT NULL AND p_order_amount > v_campaign.max_order_amount THEN
      CONTINUE;
    END IF;
    IF v_campaign.dining_type IS NOT NULL AND p_dining_type != ANY(v_campaign.dining_type) THEN
      CONTINUE;
    END IF;
    IF v_campaign.table_numbers IS NOT NULL AND p_table_number IS NOT NULL AND p_table_number != ANY(v_campaign.table_numbers) THEN
      CONTINUE;
    END IF;

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
      IF EXISTS (SELECT 1 FROM campaign_targets WHERE campaign_id = v_campaign.id AND target_type = 'whole_order') THEN
        v_applicable_items := p_cart_items;
      ELSE
        CONTINUE;
      END IF;
    END IF;

    SELECT * INTO v_rule FROM campaign_rules WHERE campaign_id = v_campaign.id LIMIT 1;
    IF NOT FOUND THEN
      CONTINUE;
    END IF;

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
$function$;

CREATE FUNCTION public.calculate_cart_campaign_discount (
  p_campaign_id    uuid,
  p_cart_items     jsonb,
  p_product_prices jsonb DEFAULT '{}'::jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  AS $function$
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
$function$;

GRANT ALL ON FUNCTION public.calculate_cart_campaign_discount(jsonb, uuid, numeric, text, integer) TO anon;

GRANT ALL ON FUNCTION public.calculate_cart_campaign_discount(jsonb, uuid, numeric, text, integer) TO authenticated;

GRANT ALL ON FUNCTION public.calculate_cart_campaign_discount(jsonb, uuid, numeric, text, integer) TO service_role;

GRANT ALL ON FUNCTION public.calculate_cart_campaign_discount(uuid, jsonb, jsonb) TO anon;

GRANT ALL ON FUNCTION public.calculate_cart_campaign_discount(uuid, jsonb, jsonb) TO authenticated;

GRANT ALL ON FUNCTION public.calculate_cart_campaign_discount(uuid, jsonb, jsonb) TO service_role;