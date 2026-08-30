CREATE OR REPLACE FUNCTION public.deduct_stock_for_order (
  p_order_id uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  AS $function$
BEGIN
  PERFORM public.validate_actor(p_performed_by);
  RETURN public.deduct_stock_on_order(p_order_id);
END;
$function$;



