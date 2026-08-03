CREATE FUNCTION public.calculate_effective_price (
  p_product_id   uuid,
  p_quantity     integer                  DEFAULT 1,
  p_category_id  uuid                     DEFAULT NULL::uuid,
  p_current_time timestamp with time zone DEFAULT now()
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  AS $function$
DECLARE
  v_product RECORD;
  v_campaign RECORD;
  v_base_price NUMERIC;
  v_effective_price NUMERIC;
  v_discount_amount NUMERIC := 0;
  v_discount_type TEXT;
BEGIN
  SELECT id, price, category_id INTO v_product FROM products WHERE id = p_product_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('product_id', p_product_id, 'base_price', 0, 'effective_price', 0, 'discount_amount', 0);
  END IF;

  v_base_price := COALESCE(v_product.price, 0);

  SELECT * INTO v_campaign FROM campaigns
  WHERE status = 'active'
    AND (start_date IS NULL OR start_date <= p_current_time::DATE)
    AND (end_date IS NULL OR end_date >= p_current_time::DATE)
    AND (start_time IS NULL OR start_time <= p_current_time::TIME)
    AND (end_time IS NULL OR end_time >= p_current_time::TIME)
    AND (max_uses IS NULL OR max_uses = 0 OR current_uses < max_uses)
    AND (
      (target_type = 'product' AND target_id = p_product_id)
      OR (target_type = 'category' AND (target_id = p_category_id OR target_id = v_product.category_id::TEXT))
      OR (target_type = 'all')
      OR (target_type = 'combo')
    )
  ORDER BY priority DESC, created_at DESC
  LIMIT 1;

  IF FOUND THEN
    IF v_campaign.type IN ('PERCENTAGE', 'HAPPY_HOUR') THEN
      v_discount_amount := v_base_price * (COALESCE(v_campaign.discount_value, 0) / 100);
    ELSIF v_campaign.type = 'FIXED_AMOUNT' THEN
      v_discount_amount := COALESCE(v_campaign.discount_value, 0);
    ELSIF v_campaign.type = 'BOGO' THEN
      v_discount_amount := v_base_price * 0.5;
    ELSIF v_campaign.type = 'BUY2GET1' THEN
      v_discount_amount := v_base_price / 3;
    END IF;

    IF v_campaign.max_discount_amount IS NOT NULL AND v_discount_amount > v_campaign.max_discount_amount THEN
      v_discount_amount := v_campaign.max_discount_amount;
    END IF;

    v_discount_type := v_campaign.type;
  END IF;

  v_effective_price := GREATEST(0, v_base_price - v_discount_amount);

  RETURN jsonb_build_object(
    'product_id', p_product_id,
    'base_price', v_base_price,
    'effective_price', v_effective_price,
    'discount_amount', v_discount_amount,
    'discount_type', v_discount_type,
    'campaign_id', CASE WHEN v_campaign.id IS NOT NULL THEN v_campaign.id ELSE NULL END,
    'campaign_label', v_campaign.label,
    'campaign_badge', v_campaign.badge_color
  );
END;
$function$;

GRANT ALL ON FUNCTION public.calculate_effective_price(uuid, integer, uuid, timestamp WITH time zone) TO anon;

GRANT ALL ON FUNCTION public.calculate_effective_price(uuid, integer, uuid, timestamp WITH time zone) TO authenticated;

GRANT ALL ON FUNCTION public.calculate_effective_price(uuid, integer, uuid, timestamp WITH time zone) TO service_role;