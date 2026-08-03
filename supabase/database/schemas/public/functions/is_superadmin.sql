CREATE FUNCTION public.is_superadmin()
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
  SELECT public.effective_admin_role() = 'superadmin';
$function$;

GRANT ALL ON FUNCTION public.is_superadmin() TO anon;

GRANT ALL ON FUNCTION public.is_superadmin() TO authenticated;

GRANT ALL ON FUNCTION public.is_superadmin() TO service_role;