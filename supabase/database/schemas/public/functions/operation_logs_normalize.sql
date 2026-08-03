CREATE FUNCTION public.operation_logs_normalize()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  AS $function$
BEGIN
  IF NEW.operation IS NULL THEN
    NEW.operation := COALESCE(NEW.action, NEW.type, NEW.table_name, 'log');
  END IF;

  IF NEW.source_table_number IS NULL THEN
    NEW.source_table_number := NEW.table_number;
  END IF;

  -- old_state/new_state have NOT NULL DEFAULT '{}'; only override when they
  -- still carry the empty default and a legacy value was actually provided.
  IF NEW.old_state = '{}'::jsonb AND NEW.old_values IS NOT NULL THEN
    NEW.old_state := NEW.old_values;
  ELSIF NEW.old_state = '{}'::jsonb AND NEW.old_data IS NOT NULL THEN
    NEW.old_state := NEW.old_data;
  END IF;

  IF NEW.new_state = '{}'::jsonb AND NEW.new_values IS NOT NULL THEN
    NEW.new_state := NEW.new_values;
  ELSIF NEW.new_state = '{}'::jsonb AND NEW.new_data IS NOT NULL THEN
    NEW.new_state := NEW.new_data;
  END IF;

  IF NEW.undo_payload IS NULL THEN
    NEW.undo_payload := NEW.payload;
  END IF;

  RETURN NEW;
END;
$function$;

GRANT ALL ON FUNCTION public.operation_logs_normalize() TO anon;

GRANT ALL ON FUNCTION public.operation_logs_normalize() TO authenticated;

GRANT ALL ON FUNCTION public.operation_logs_normalize() TO service_role;