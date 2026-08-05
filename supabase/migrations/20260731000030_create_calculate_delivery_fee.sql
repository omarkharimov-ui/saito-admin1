-- Create calculate_delivery_fee RPC
CREATE OR REPLACE FUNCTION public.calculate_delivery_fee (
  p_zone_name          text,
  p_order_amount       numeric DEFAULT 0,
  p_customer_address   text DEFAULT NULL::text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
DECLARE
  v_zone RECORD;
BEGIN
  SELECT * INTO v_zone
  FROM delivery_zones
  WHERE LOWER(name) = LOWER(p_zone_name)
    AND is_active = true
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Zone not found',
      'fee', 0,
      'zone', p_zone_name
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'fee', v_zone.fee,
    'zone', v_zone.name,
    'free_delivery_threshold', v_zone.free_delivery_threshold,
    'estimated_minutes', v_zone.estimated_minutes,
    'is_free', p_order_amount >= COALESCE(v_zone.free_delivery_threshold, 9999999)
  );
END;
$function$;

GRANT ALL ON FUNCTION public.calculate_delivery_fee(text, numeric, text) TO service_role;
REVOKE ALL ON FUNCTION public.calculate_delivery_fee(text, numeric, text) FROM anon;
REVOKE ALL ON FUNCTION public.calculate_delivery_fee(text, numeric, text) FROM authenticated;
