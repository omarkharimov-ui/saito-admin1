CREATE FUNCTION public.update_courier_location (
  p_courier_id uuid,
  p_lat        numeric,
  p_lng        numeric
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
BEGIN
  UPDATE couriers SET
    last_location_lat = p_lat,
    last_location_lng = p_lng,
    last_location_at = now()
  WHERE id = p_courier_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'COURIER_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$function$;

GRANT ALL ON FUNCTION public.update_courier_location(uuid, numeric, numeric) TO anon;

GRANT ALL ON FUNCTION public.update_courier_location(uuid, numeric, numeric) TO authenticated;

GRANT ALL ON FUNCTION public.update_courier_location(uuid, numeric, numeric) TO service_role;