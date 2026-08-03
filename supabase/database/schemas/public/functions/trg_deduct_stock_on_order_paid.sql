CREATE FUNCTION public.trg_deduct_stock_on_order_paid()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  AS $function$
BEGIN
  IF NEW.status = 'paid' AND (OLD.status IS DISTINCT FROM 'paid') THEN
    PERFORM deduct_stock_on_order(NEW.id);
  END IF;
  RETURN NEW;
END;
$function$;

GRANT ALL ON FUNCTION public.trg_deduct_stock_on_order_paid() TO anon;

GRANT ALL ON FUNCTION public.trg_deduct_stock_on_order_paid() TO authenticated;

GRANT ALL ON FUNCTION public.trg_deduct_stock_on_order_paid() TO service_role;