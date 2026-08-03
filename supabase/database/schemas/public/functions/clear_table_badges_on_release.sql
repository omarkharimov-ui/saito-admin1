CREATE FUNCTION public.clear_table_badges_on_release()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$ BEGIN IF NEW.status IN ('empty', 'cleaning', 'reserved') THEN UPDATE table_floors SET bill_requested = false, has_pending = false WHERE id = NEW.id; END IF; RETURN NEW; END; $function$;

GRANT ALL ON FUNCTION public.clear_table_badges_on_release() TO anon;

GRANT ALL ON FUNCTION public.clear_table_badges_on_release() TO authenticated;

GRANT ALL ON FUNCTION public.clear_table_badges_on_release() TO service_role;