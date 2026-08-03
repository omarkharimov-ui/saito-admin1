CREATE FUNCTION public.get_best_cart_campaign (
  p_cart_items   jsonb,
  p_customer_id  uuid    DEFAULT NULL::uuid,
  p_order_amount numeric DEFAULT 0
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  AS $function$
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
$function$;

GRANT ALL ON FUNCTION public.get_best_cart_campaign(jsonb, uuid, numeric) TO anon;

GRANT ALL ON FUNCTION public.get_best_cart_campaign(jsonb, uuid, numeric) TO authenticated;

GRANT ALL ON FUNCTION public.get_best_cart_campaign(jsonb, uuid, numeric) TO service_role;