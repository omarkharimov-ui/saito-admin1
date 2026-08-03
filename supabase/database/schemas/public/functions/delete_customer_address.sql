CREATE FUNCTION public.delete_customer_address (
  p_address_id uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
BEGIN
  DELETE FROM customer_addresses WHERE id = p_address_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ADDRESS_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;
  RETURN jsonb_build_object('success', true);
END;
$function$;

GRANT ALL ON FUNCTION public.delete_customer_address(uuid) TO anon;

GRANT ALL ON FUNCTION public.delete_customer_address(uuid) TO authenticated;

GRANT ALL ON FUNCTION public.delete_customer_address(uuid) TO service_role;