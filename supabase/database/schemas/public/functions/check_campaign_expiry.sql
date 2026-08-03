CREATE FUNCTION public.check_campaign_expiry()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  AS $function$
BEGIN
  IF NEW.status = 'active' THEN
    IF NEW.end_date IS NOT NULL AND NEW.end_date < CURRENT_DATE THEN
      NEW.status := 'expired';
    END IF;
    IF NEW.end_time IS NOT NULL AND NEW.start_time IS NOT NULL THEN
      IF NEW.end_time < TO_CHAR(NOW(), 'HH24:MI') AND NEW.start_time > NEW.end_time THEN
        NEW.status := 'expired';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

GRANT ALL ON FUNCTION public.check_campaign_expiry() TO anon;

GRANT ALL ON FUNCTION public.check_campaign_expiry() TO authenticated;

GRANT ALL ON FUNCTION public.check_campaign_expiry() TO service_role;