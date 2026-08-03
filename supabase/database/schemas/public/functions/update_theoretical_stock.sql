CREATE FUNCTION public.update_theoretical_stock()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  AS $function$
DECLARE
  v_delta numeric;
BEGIN
  IF NEW.type = 'stock_in' THEN
    v_delta := NEW.quantity;
  ELSIF NEW.type IN ('waste', 'order_consumption') THEN
    v_delta := -NEW.quantity;
  ELSIF NEW.type = 'adjustment' THEN
    v_delta := NEW.quantity;
  ELSE
    v_delta := 0;
  END IF;

  UPDATE ingredients
  SET theoretical_stock = GREATEST(0, COALESCE(theoretical_stock, 0) + v_delta),
      updated_at = now()
  WHERE id = NEW.ingredient_id;

  RETURN NEW;
END;
$function$;

GRANT ALL ON FUNCTION public.update_theoretical_stock() TO anon;

GRANT ALL ON FUNCTION public.update_theoretical_stock() TO authenticated;

GRANT ALL ON FUNCTION public.update_theoretical_stock() TO service_role;