CREATE FUNCTION public.mark_item_ready (
  p_item_id uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
BEGIN
  UPDATE order_items SET
    kitchen_status = 'ready'
  WHERE id = p_item_id
    AND kitchen_status IN ('preparing', 'cooking');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ITEM_NOT_FOUND_OR_INVALID_STATUS' USING ERRCODE = 'P0001';
  END IF;

  RETURN jsonb_build_object('success', true, 'item_id', p_item_id, 'status', 'ready');
END;
$function$;

GRANT ALL ON FUNCTION public.mark_item_ready(uuid) TO anon;

GRANT ALL ON FUNCTION public.mark_item_ready(uuid) TO authenticated;

GRANT ALL ON FUNCTION public.mark_item_ready(uuid) TO service_role;