CREATE FUNCTION public.complete_reservation_on_table_clear()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
BEGIN
  IF NEW.status = 'empty' AND OLD.status = 'dirty' AND OLD.reservation_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM table_floors
      WHERE reservation_id = OLD.reservation_id
        AND status != 'empty'
        AND id != NEW.id
    ) THEN
      UPDATE reservations
      SET status = 'completed', updated_at = now()
      WHERE id = OLD.reservation_id
        AND status = 'seated';
    END IF;
    UPDATE table_floors
    SET reservation_id = NULL,
        reservation_name = NULL,
        reservation_phone = NULL,
        reservation_time = NULL,
        guest_count = NULL
    WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$function$;

GRANT ALL ON FUNCTION public.complete_reservation_on_table_clear() TO anon;

GRANT ALL ON FUNCTION public.complete_reservation_on_table_clear() TO authenticated;

GRANT ALL ON FUNCTION public.complete_reservation_on_table_clear() TO service_role;