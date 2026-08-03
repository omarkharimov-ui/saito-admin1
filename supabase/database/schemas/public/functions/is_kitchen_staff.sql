CREATE FUNCTION public.is_kitchen_staff()
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
  SELECT public.effective_admin_role() IN ('kitchen', 'superadmin');
$function$;

GRANT ALL ON FUNCTION public.is_kitchen_staff() TO anon;

GRANT ALL ON FUNCTION public.is_kitchen_staff() TO authenticated;

GRANT ALL ON FUNCTION public.is_kitchen_staff() TO service_role;