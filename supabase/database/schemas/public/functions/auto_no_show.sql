CREATE FUNCTION public.auto_no_show()
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
DECLARE
  v_processed INTEGER := 0;
BEGIN
  UPDATE reservations
  SET status = 'no_show',
      cancelled_at = now(),
      cancelled_reason = 'auto_no_show'
  WHERE status = 'confirmed'
    AND (time + INTERVAL '15 minutes') < now()
    AND checked_in_at IS NULL
    AND reservation_type = 'reservation';

  GET DIAGNOSTICS v_processed = ROW_COUNT;
  RETURN v_processed;
END;
$function$;

GRANT ALL ON FUNCTION public.auto_no_show() TO anon;

GRANT ALL ON FUNCTION public.auto_no_show() TO authenticated;

GRANT ALL ON FUNCTION public.auto_no_show() TO service_role;