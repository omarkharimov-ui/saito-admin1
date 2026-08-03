CREATE FUNCTION public.jwt_email()
  RETURNS text
  LANGUAGE sql
  STABLE
  AS $function$
  SELECT lower(coalesce(auth.jwt() ->> 'email', ''));
$function$;

GRANT ALL ON FUNCTION public.jwt_email() TO anon;

GRANT ALL ON FUNCTION public.jwt_email() TO authenticated;

GRANT ALL ON FUNCTION public.jwt_email() TO service_role;