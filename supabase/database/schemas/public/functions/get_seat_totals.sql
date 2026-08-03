CREATE FUNCTION public.get_seat_totals (
  p_order_id uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
DECLARE
  v_result JSONB;
BEGIN
  SELECT jsonb_agg(jsonb_build_object(
    'seat_number', COALESCE(seat_number, 0),
    'subtotal', SUM(total_price),
    'item_count', COUNT(*)
  ) ORDER BY COALESCE(seat_number, 0))
  INTO v_result
  FROM order_items
  WHERE order_id = p_order_id
    AND kitchen_status NOT IN ('cancelled');

  RETURN jsonb_build_object(
    'order_id', p_order_id,
    'seats', COALESCE(v_result, '[]'::JSONB)
  );
END;
$function$;

GRANT ALL ON FUNCTION public.get_seat_totals(uuid) TO anon;

GRANT ALL ON FUNCTION public.get_seat_totals(uuid) TO authenticated;

GRANT ALL ON FUNCTION public.get_seat_totals(uuid) TO service_role;