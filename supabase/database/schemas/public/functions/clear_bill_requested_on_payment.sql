CREATE FUNCTION public.clear_bill_requested_on_payment()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
BEGIN
  IF NEW.status = 'paid' AND OLD.status != 'paid' THEN
    UPDATE table_floors
    SET bill_requested = false
    WHERE table_number = NEW.table_number;
  END IF;
  RETURN NEW;
END;
$function$;

GRANT ALL ON FUNCTION public.clear_bill_requested_on_payment() TO anon;

GRANT ALL ON FUNCTION public.clear_bill_requested_on_payment() TO authenticated;

GRANT ALL ON FUNCTION public.clear_bill_requested_on_payment() TO service_role;