CREATE FUNCTION public.add_customer_address (
  p_customer_id    uuid,
  p_address_line   text,
  p_address_line2  text    DEFAULT NULL::text,
  p_city           text    DEFAULT 'Bakı'::text,
  p_district       text    DEFAULT NULL::text,
  p_landmark       text    DEFAULT NULL::text,
  p_delivery_notes text    DEFAULT NULL::text,
  p_lat            numeric DEFAULT NULL::numeric,
  p_lng            numeric DEFAULT NULL::numeric,
  p_is_default     boolean DEFAULT false
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
DECLARE
  v_id UUID;
BEGIN
  -- If setting as default, unset others
  IF p_is_default THEN
    UPDATE customer_addresses SET is_default = false WHERE customer_id = p_customer_id;
  END IF;

  INSERT INTO customer_addresses (
    customer_id, address_line, address_line2, city, district,
    landmark, delivery_notes, lat, lng, is_default
  ) VALUES (
    p_customer_id, p_address_line, p_address_line2, p_city, p_district,
    p_landmark, p_delivery_notes, p_lat, p_lng, p_is_default
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('success', true, 'address_id', v_id);
END;
$function$;

GRANT ALL ON FUNCTION public.add_customer_address(uuid, text, text, text, text, text, text, numeric, numeric, boolean) TO anon;

GRANT ALL ON FUNCTION public.add_customer_address(uuid, text, text, text, text, text, text, numeric, numeric, boolean) TO authenticated;

GRANT ALL ON FUNCTION public.add_customer_address(uuid, text, text, text, text, text, text, numeric, numeric, boolean) TO service_role;