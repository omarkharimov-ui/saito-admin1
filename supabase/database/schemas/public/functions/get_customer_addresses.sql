CREATE FUNCTION public.get_customer_addresses (
  p_customer_id uuid
)
  RETURNS TABLE (
    id             uuid,
    address_line   text,
    address_line2  text,
    city           text,
    district       text,
    landmark       text,
    delivery_notes text,
    lat            numeric,
    lng            numeric,
    is_default     boolean
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
BEGIN
  RETURN QUERY
  SELECT ca.id, ca.address_line, ca.address_line2, ca.city, ca.district,
         ca.landmark, ca.delivery_notes, ca.lat, ca.lng, ca.is_default
  FROM customer_addresses ca
  WHERE ca.customer_id = p_customer_id
  ORDER BY ca.is_default DESC, ca.created_at DESC;
END;
$function$;

GRANT ALL ON FUNCTION public.get_customer_addresses(uuid) TO anon;

GRANT ALL ON FUNCTION public.get_customer_addresses(uuid) TO authenticated;

GRANT ALL ON FUNCTION public.get_customer_addresses(uuid) TO service_role;