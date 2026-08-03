CREATE FUNCTION public.auto_release_expired_holds()
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
DECLARE
  v_released INTEGER := 0;
BEGIN
  UPDATE order_items
  SET hold_until = NULL
  WHERE hold_until IS NOT NULL
    AND hold_until <= now()
    AND kitchen_status = 'pending';

  GET DIAGNOSTICS v_released = ROW_COUNT;
  RETURN v_released;
END;
$function$;

GRANT ALL ON FUNCTION public.auto_release_expired_holds() TO anon;

GRANT ALL ON FUNCTION public.auto_release_expired_holds() TO authenticated;

GRANT ALL ON FUNCTION public.auto_release_expired_holds() TO service_role;