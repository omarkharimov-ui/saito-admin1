CREATE FUNCTION public.generate_takeaway_order_number()
  RETURNS text
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
DECLARE
  v_next INTEGER;
  v_prefix TEXT;
BEGIN
  v_next := nextval('takeaway_order_seq');
  v_prefix := 'A';
  RETURN '#' || v_prefix || LPAD(v_next::TEXT, 3, '0');
END;
$function$;

GRANT ALL ON FUNCTION public.generate_takeaway_order_number() TO anon;

GRANT ALL ON FUNCTION public.generate_takeaway_order_number() TO authenticated;

GRANT ALL ON FUNCTION public.generate_takeaway_order_number() TO service_role;