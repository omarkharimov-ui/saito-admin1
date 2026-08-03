CREATE FUNCTION public.effective_admin_role()
  RETURNS text
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
  SELECT coalesce(public.current_admin_role(), public.current_admin_role_by_email());
$function$;

GRANT ALL ON FUNCTION public.effective_admin_role() TO anon;

GRANT ALL ON FUNCTION public.effective_admin_role() TO authenticated;

GRANT ALL ON FUNCTION public.effective_admin_role() TO service_role;