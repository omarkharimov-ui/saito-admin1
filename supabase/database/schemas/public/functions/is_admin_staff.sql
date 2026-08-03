CREATE FUNCTION public.is_admin_staff()
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
  SELECT public.effective_admin_role() IN ('admin', 'superadmin');
$function$;

GRANT ALL ON FUNCTION public.is_admin_staff() TO anon;

GRANT ALL ON FUNCTION public.is_admin_staff() TO authenticated;

GRANT ALL ON FUNCTION public.is_admin_staff() TO service_role;