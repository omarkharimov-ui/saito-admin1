CREATE FUNCTION public.is_shift_active()
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM shifts
    WHERE opened_at IS NOT NULL
      AND closed_at IS NULL
    LIMIT 1
  );
END;
$function$;

GRANT ALL ON FUNCTION public.is_shift_active() TO anon;

GRANT ALL ON FUNCTION public.is_shift_active() TO authenticated;

GRANT ALL ON FUNCTION public.is_shift_active() TO service_role;