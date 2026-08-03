CREATE FUNCTION public.update_order_item_quantity (
  p_order_item_id uuid,
  p_quantity      integer,
  p_unit_price    numeric
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
    quantity = p_quantity,
    total_price = p_unit_price * p_quantity,
    kitchen_status = 'pending'
  WHERE id = p_order_item_id;

  RETURN jsonb_build_object('success', true, 'order_item_id', p_order_item_id, 'quantity', p_quantity);
END;
$function$;

GRANT ALL ON FUNCTION public.update_order_item_quantity(uuid, integer, numeric) TO anon;

GRANT ALL ON FUNCTION public.update_order_item_quantity(uuid, integer, numeric) TO authenticated;

GRANT ALL ON FUNCTION public.update_order_item_quantity(uuid, integer, numeric) TO service_role;