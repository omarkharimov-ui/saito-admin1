CREATE FUNCTION public.deduct_stock_for_order (
  p_order_id uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  AS $function$
BEGIN
  RETURN public.deduct_stock_on_order(p_order_id);
END;
$function$;

GRANT ALL ON FUNCTION public.deduct_stock_for_order(uuid) TO anon;

GRANT ALL ON FUNCTION public.deduct_stock_for_order(uuid) TO authenticated;

GRANT ALL ON FUNCTION public.deduct_stock_for_order(uuid) TO service_role;