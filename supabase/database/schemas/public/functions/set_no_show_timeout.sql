CREATE FUNCTION public.set_no_show_timeout (
  p_minutes integer DEFAULT 15
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
BEGIN
  INSERT INTO app_settings (key, value, updated_at)
  VALUES ('no_show_timeout_minutes', p_minutes::TEXT, now())
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
END;
$function$;

GRANT ALL ON FUNCTION public.set_no_show_timeout(integer) TO anon;

GRANT ALL ON FUNCTION public.set_no_show_timeout(integer) TO authenticated;

GRANT ALL ON FUNCTION public.set_no_show_timeout(integer) TO service_role;