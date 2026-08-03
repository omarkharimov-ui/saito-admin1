CREATE FUNCTION public.calculate_rule_discount (
  p_rule  public.campaign_rules,
  p_items jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  AS $function$
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
    v_discount := LEAST(COALESCE(p_rule.fixed_amount, 0), (SELECT SUM((item->>'unit_price')::NUMERIC) FROM jsonb_array_elements(p_items) item));
    v_message := format('₼%s endirim', p_rule.fixed_amount);

  ELSIF p_rule.rule_type = 'buy_x_pay_y' THEN
    v_applicable_count := (SELECT SUM((item->>'quantity')::INTEGER) FROM jsonb_array_elements(p_items) item);
    IF v_applicable_count >= COALESCE(p_rule.buy_quantity, 1) THEN
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
    IF v_applicable_count >= COALESCE(p_rule.buy_quantity, 1) THEN
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
$function$;

GRANT ALL ON FUNCTION public.calculate_rule_discount(public.campaign_rules, jsonb) TO anon;

GRANT ALL ON FUNCTION public.calculate_rule_discount(public.campaign_rules, jsonb) TO authenticated;

GRANT ALL ON FUNCTION public.calculate_rule_discount(public.campaign_rules, jsonb) TO service_role;