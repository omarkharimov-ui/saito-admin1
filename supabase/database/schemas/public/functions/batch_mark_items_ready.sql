CREATE FUNCTION public.batch_mark_items_ready (
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
  UPDATE order_items SET kitchen_status = 'ready'
  WHERE order_id = p_order_id
    AND kitchen_status IN ('preparing', 'cooking');

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  RETURN jsonb_build_object('success', true, 'items_ready', v_updated);
END;
$function$;

GRANT ALL ON FUNCTION public.batch_mark_items_ready(uuid) TO anon;

GRANT ALL ON FUNCTION public.batch_mark_items_ready(uuid) TO authenticated;

GRANT ALL ON FUNCTION public.batch_mark_items_ready(uuid) TO service_role;