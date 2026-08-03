CREATE FUNCTION public.generate_delivery_order_number()
  RETURNS text
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
DECLARE
  v_next INTEGER;
BEGIN
  v_next := nextval('takeaway_order_seq');
  RETURN '#D' || LPAD(v_next::TEXT, 3, '0');
END;
$function$;

GRANT ALL ON FUNCTION public.generate_delivery_order_number() TO anon;

GRANT ALL ON FUNCTION public.generate_delivery_order_number() TO authenticated;

GRANT ALL ON FUNCTION public.generate_delivery_order_number() TO service_role;