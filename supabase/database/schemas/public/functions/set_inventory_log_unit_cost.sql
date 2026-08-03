CREATE FUNCTION public.set_inventory_log_unit_cost()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  AS $function$
BEGIN
  IF NEW.unit_cost IS NULL THEN
    SELECT average_cost_per_unit INTO NEW.unit_cost
    FROM ingredients
    WHERE id = NEW.ingredient_id;
  END IF;
  RETURN NEW;
END;
$function$;

GRANT ALL ON FUNCTION public.set_inventory_log_unit_cost() TO anon;

GRANT ALL ON FUNCTION public.set_inventory_log_unit_cost() TO authenticated;

GRANT ALL ON FUNCTION public.set_inventory_log_unit_cost() TO service_role;