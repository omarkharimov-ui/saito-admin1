CREATE FUNCTION public.mark_item_preparing (
  p_item_id uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
BEGIN
  UPDATE order_items SET
    kitchen_status = 'preparing',
    station = COALESCE(station, 'all')
  WHERE id = p_item_id
    AND kitchen_status IN ('pending', 'accepted');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ITEM_NOT_FOUND_OR_INVALID_STATUS' USING ERRCODE = 'P0001';
  END IF;

  RETURN jsonb_build_object('success', true, 'item_id', p_item_id, 'status', 'preparing');
END;
$function$;

GRANT ALL ON FUNCTION public.mark_item_preparing(uuid) TO anon;

GRANT ALL ON FUNCTION public.mark_item_preparing(uuid) TO authenticated;

GRANT ALL ON FUNCTION public.mark_item_preparing(uuid) TO service_role;