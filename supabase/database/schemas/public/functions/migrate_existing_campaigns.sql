CREATE FUNCTION public.migrate_existing_campaigns()
  RETURNS void
  LANGUAGE plpgsql
  AS $function$
DECLARE
  v_campaign RECORD;
  v_rule_id UUID;
BEGIN
  FOR v_campaign IN SELECT * FROM campaigns WHERE deleted_at IS NULL LOOP
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

    IF v_campaign.start_date IS NOT NULL OR v_campaign.end_date IS NOT NULL THEN
      INSERT INTO campaign_schedules (campaign_id, start_date, end_date, start_time, end_time)
      VALUES (v_campaign.id, v_campaign.start_date, v_campaign.end_date, v_campaign.start_time::TIME, v_campaign.end_time::TIME);
    END IF;
  END LOOP;
END;
$function$;

GRANT ALL ON FUNCTION public.migrate_existing_campaigns() TO anon;

GRANT ALL ON FUNCTION public.migrate_existing_campaigns() TO authenticated;

GRANT ALL ON FUNCTION public.migrate_existing_campaigns() TO service_role;