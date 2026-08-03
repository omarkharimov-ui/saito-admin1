CREATE FUNCTION public.update_timestamp()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

GRANT ALL ON FUNCTION public.update_timestamp() TO anon;

GRANT ALL ON FUNCTION public.update_timestamp() TO authenticated;

GRANT ALL ON FUNCTION public.update_timestamp() TO service_role;