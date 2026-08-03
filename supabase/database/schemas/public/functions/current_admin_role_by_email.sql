CREATE FUNCTION public.current_admin_role_by_email()
  RETURNS text
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
  SELECT au.role::text
  FROM public.admin_users au
  WHERE lower(au.email) = public.jwt_email()
    AND coalesce(au.is_active, true) = true
  LIMIT 1;
$function$;

GRANT ALL ON FUNCTION public.current_admin_role_by_email() TO anon;

GRANT ALL ON FUNCTION public.current_admin_role_by_email() TO authenticated;

GRANT ALL ON FUNCTION public.current_admin_role_by_email() TO service_role;