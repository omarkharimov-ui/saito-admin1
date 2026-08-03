CREATE FUNCTION public.update_order_item_status (
  p_order_item_id     uuid,
  p_status            text,
  p_prepared_quantity integer DEFAULT NULL::integer
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
  SET
    kitchen_status = p_status,
    prepared_quantity = COALESCE(p_prepared_quantity, prepared_quantity)
  WHERE id = p_order_item_id;

  RETURN jsonb_build_object('success', true, 'order_item_id', p_order_item_id, 'status', p_status);
END;
$function$;

GRANT ALL ON FUNCTION public.update_order_item_status(uuid, text, integer) TO anon;

GRANT ALL ON FUNCTION public.update_order_item_status(uuid, text, integer) TO authenticated;

GRANT ALL ON FUNCTION public.update_order_item_status(uuid, text, integer) TO service_role;