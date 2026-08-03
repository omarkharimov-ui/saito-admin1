CREATE FUNCTION public.release_item_hold (
  p_order_item_id uuid,
  p_performed_by  uuid DEFAULT NULL::uuid
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
  SET hold_until = NULL
  WHERE id = p_order_item_id;

  RETURN jsonb_build_object('success', true, 'order_item_id', p_order_item_id);
END;
$function$;

GRANT ALL ON FUNCTION public.release_item_hold(uuid, uuid) TO anon;

GRANT ALL ON FUNCTION public.release_item_hold(uuid, uuid) TO authenticated;

GRANT ALL ON FUNCTION public.release_item_hold(uuid, uuid) TO service_role;