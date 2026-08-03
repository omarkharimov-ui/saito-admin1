CREATE FUNCTION public.prepare_order_items (
  p_order_id uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
DECLARE
  v_updated INTEGER;
BEGIN
  PERFORM id FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  UPDATE order_items
  SET kitchen_status = 'preparing'
  WHERE order_id = p_order_id
    AND kitchen_status IN ('pending', 'accepted', 'reserved');

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  -- Update order's kitchen_status if any items were updated
  IF v_updated > 0 THEN
    UPDATE orders SET
      kitchen_status = 'preparing',
      kitchen_accepted_at = now()
    WHERE id = p_order_id
      AND kitchen_status IS DISTINCT FROM 'preparing';
  END IF;

  RETURN jsonb_build_object('success', true, 'updated_items', v_updated);
END;
$function$;

GRANT ALL ON FUNCTION public.prepare_order_items(uuid) TO anon;

GRANT ALL ON FUNCTION public.prepare_order_items(uuid) TO authenticated;

GRANT ALL ON FUNCTION public.prepare_order_items(uuid) TO service_role;