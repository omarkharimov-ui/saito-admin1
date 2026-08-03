CREATE FUNCTION public.record_campaign_usage (
  p_campaign_id     uuid,
  p_order_id        uuid,
  p_customer_id     uuid    DEFAULT NULL::uuid,
  p_discount_amount numeric DEFAULT 0,
  p_discount_type   text    DEFAULT 'fixed'::text,
  p_items_count     integer DEFAULT 1,
  p_order_amount    numeric DEFAULT 0,
  p_free_items      integer DEFAULT 0,
  p_rule_type       text    DEFAULT NULL::text
)
  RETURNS void
  LANGUAGE plpgsql
  AS $function$
BEGIN
  INSERT INTO campaign_usage (
    campaign_id, order_id, customer_id, discount_amount, discount_type, items_count, order_amount, free_items, rule_type
  ) VALUES (
    p_campaign_id, p_order_id, p_customer_id, p_discount_amount, p_discount_type, p_items_count, p_order_amount, p_free_items, p_rule_type
  );
  UPDATE campaigns SET current_uses = COALESCE(current_uses, 0) + 1 WHERE id = p_campaign_id;
END;
$function$;

CREATE FUNCTION public.record_campaign_usage (
  p_campaign_id     uuid,
  p_order_id        uuid,
  p_customer_id     uuid    DEFAULT NULL::uuid,
  p_discount_amount numeric DEFAULT 0,
  p_discount_type   text    DEFAULT 'percentage'::text,
  p_items_count     integer DEFAULT 1
)
  RETURNS void
  LANGUAGE plpgsql
  AS $function$
BEGIN
  INSERT INTO campaign_usage (
    campaign_id, order_id, customer_id, discount_amount, discount_type, items_count
  ) VALUES (
    p_campaign_id, p_order_id, p_customer_id, p_discount_amount, p_discount_type, p_items_count
  );

  UPDATE campaigns SET current_uses = COALESCE(current_uses, 0) + 1 WHERE id = p_campaign_id;
END;
$function$;

GRANT ALL ON FUNCTION public.record_campaign_usage(uuid, uuid, uuid, numeric, text, integer, numeric, integer, text) TO anon;

GRANT ALL ON FUNCTION public.record_campaign_usage(uuid, uuid, uuid, numeric, text, integer, numeric, integer, text) TO authenticated;

GRANT ALL ON FUNCTION public.record_campaign_usage(uuid, uuid, uuid, numeric, text, integer, numeric, integer, text) TO service_role;

GRANT ALL ON FUNCTION public.record_campaign_usage(uuid, uuid, uuid, numeric, text, integer) TO anon;

GRANT ALL ON FUNCTION public.record_campaign_usage(uuid, uuid, uuid, numeric, text, integer) TO authenticated;

GRANT ALL ON FUNCTION public.record_campaign_usage(uuid, uuid, uuid, numeric, text, integer) TO service_role;