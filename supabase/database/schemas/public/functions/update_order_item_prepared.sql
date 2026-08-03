CREATE FUNCTION public.update_order_item_prepared (
  p_order_item_id     uuid,
  p_prepared_quantity integer
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
DECLARE
  v_item RECORD;
BEGIN
  SELECT * INTO v_item FROM order_items WHERE id = p_order_item_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_ITEM_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  UPDATE order_items
  SET prepared_quantity = p_prepared_quantity
  WHERE id = p_order_item_id;

  RETURN jsonb_build_object('success', true, 'order_item_id', p_order_item_id, 'prepared_quantity', p_prepared_quantity);
END;
$function$;

GRANT ALL ON FUNCTION public.update_order_item_prepared(uuid, integer) TO anon;

GRANT ALL ON FUNCTION public.update_order_item_prepared(uuid, integer) TO authenticated;

GRANT ALL ON FUNCTION public.update_order_item_prepared(uuid, integer) TO service_role;