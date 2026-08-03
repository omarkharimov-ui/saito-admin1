CREATE FUNCTION public.admin_users_is_empty()
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
  SELECT NOT EXISTS (SELECT 1 FROM public.admin_users LIMIT 1);
$function$;

GRANT ALL ON FUNCTION public.admin_users_is_empty() TO anon;

GRANT ALL ON FUNCTION public.admin_users_is_empty() TO authenticated;

GRANT ALL ON FUNCTION public.admin_users_is_empty() TO service_role;