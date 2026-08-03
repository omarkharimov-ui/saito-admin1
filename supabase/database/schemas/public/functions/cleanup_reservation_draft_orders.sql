CREATE FUNCTION public.cleanup_reservation_draft_orders()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
BEGIN
  IF NEW.status IN ('cancelled', 'no_show') THEN
    UPDATE orders
    SET status = 'cancelled', cancelled_at = now()
    WHERE reservation_id = NEW.id
      AND status NOT IN ('paid', 'cancelled');
    UPDATE table_floors
    SET status = 'empty',
        reservation_id = NULL,
        reservation_name = NULL,
        reservation_phone = NULL,
        reservation_time = NULL,
        guest_count = NULL,
        bill_requested = false,
        has_pending = false
    WHERE reservation_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$function$;

GRANT ALL ON FUNCTION public.cleanup_reservation_draft_orders() TO anon;

GRANT ALL ON FUNCTION public.cleanup_reservation_draft_orders() TO authenticated;

GRANT ALL ON FUNCTION public.cleanup_reservation_draft_orders() TO service_role;