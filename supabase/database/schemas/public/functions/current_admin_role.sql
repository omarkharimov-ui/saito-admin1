CREATE FUNCTION public.current_admin_role()
  RETURNS text
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
  SELECT au.role::text
  FROM public.admin_users au
  WHERE au.id = auth.uid()
    AND coalesce(au.is_active, true) = true
  LIMIT 1;
$function$;

GRANT ALL ON FUNCTION public.current_admin_role() TO anon;

GRANT ALL ON FUNCTION public.current_admin_role() TO authenticated;

GRANT ALL ON FUNCTION public.current_admin_role() TO service_role;