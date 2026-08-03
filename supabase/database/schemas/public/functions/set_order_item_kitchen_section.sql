CREATE FUNCTION public.set_order_item_kitchen_section()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  AS $function$
BEGIN
    IF NEW.kitchen_status IS NULL THEN
        NEW.kitchen_status := 'hot';
    END IF;
    RETURN NEW;
END;
$function$;

GRANT ALL ON FUNCTION public.set_order_item_kitchen_section() TO anon;

GRANT ALL ON FUNCTION public.set_order_item_kitchen_section() TO authenticated;

GRANT ALL ON FUNCTION public.set_order_item_kitchen_section() TO service_role;