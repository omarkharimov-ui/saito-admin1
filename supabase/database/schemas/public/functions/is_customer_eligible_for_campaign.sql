CREATE FUNCTION public.is_customer_eligible_for_campaign (
  p_campaign_id  uuid,
  p_customer_id  uuid    DEFAULT NULL::uuid,
  p_order_amount numeric DEFAULT 0,
  p_items_count  integer DEFAULT 1
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  AS $function$
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
$function$;

GRANT ALL ON FUNCTION public.is_customer_eligible_for_campaign(uuid, uuid, numeric, integer) TO anon;

GRANT ALL ON FUNCTION public.is_customer_eligible_for_campaign(uuid, uuid, numeric, integer) TO authenticated;

GRANT ALL ON FUNCTION public.is_customer_eligible_for_campaign(uuid, uuid, numeric, integer) TO service_role;