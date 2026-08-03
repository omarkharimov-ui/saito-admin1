CREATE FUNCTION public.deduct_stock_on_consumption()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  AS $function$
BEGIN
  IF NEW.type = 'order_consumption' THEN
    UPDATE ingredients
    SET current_stock = GREATEST(0, (COALESCE(current_stock, 0) - NEW.quantity))
    WHERE id = NEW.ingredient_id;
  END IF;
  RETURN NEW;
END;
$function$;

GRANT ALL ON FUNCTION public.deduct_stock_on_consumption() TO anon;

GRANT ALL ON FUNCTION public.deduct_stock_on_consumption() TO authenticated;

GRANT ALL ON FUNCTION public.deduct_stock_on_consumption() TO service_role;