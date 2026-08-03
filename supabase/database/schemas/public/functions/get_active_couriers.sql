CREATE FUNCTION public.get_active_couriers()
  RETURNS TABLE (
    id                uuid,
    name              text,
    phone             text,
    vehicle_type      text,
    current_order_id  uuid,
    total_deliveries  integer,
    rating            numeric,
    last_location_lat numeric,
    last_location_lng numeric
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
BEGIN
  RETURN QUERY
  SELECT c.id, c.name, c.phone, c.vehicle_type, c.current_order_id,
         c.total_deliveries, c.rating, c.last_location_lat, c.last_location_lng
  FROM couriers c
  WHERE c.is_active = true
  ORDER BY c.current_order_id NULLS FIRST, c.total_deliveries DESC;
END;
$function$;

GRANT ALL ON FUNCTION public.get_active_couriers() TO anon;

GRANT ALL ON FUNCTION public.get_active_couriers() TO authenticated;

GRANT ALL ON FUNCTION public.get_active_couriers() TO service_role;