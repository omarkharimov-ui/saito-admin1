CREATE FUNCTION public.route_kitchen_order (
  p_order_id uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
DECLARE
  v_result JSONB := '{}'::JSONB;
BEGIN
  SELECT jsonb_object_agg(
    COALESCE(printer_route, 'default'),
    jsonb_agg(
      jsonb_build_object(
        'id', id,
        'product_name', product_name,
        'quantity', quantity,
        'kitchen_status', kitchen_status,
        'course', course,
        'hold_until', hold_until
      )
    )
  ) INTO v_result
  FROM order_items
  WHERE order_id = p_order_id
    AND kitchen_status IS DISTINCT FROM 'cancelled';

  RETURN jsonb_build_object('success', true, 'routes', v_result);
END;
$function$;

GRANT ALL ON FUNCTION public.route_kitchen_order(uuid) TO anon;

GRANT ALL ON FUNCTION public.route_kitchen_order(uuid) TO authenticated;

GRANT ALL ON FUNCTION public.route_kitchen_order(uuid) TO service_role;