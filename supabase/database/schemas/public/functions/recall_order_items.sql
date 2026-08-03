CREATE FUNCTION public.recall_order_items (
  p_order_id     uuid,
  p_performed_by uuid DEFAULT NULL::uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
DECLARE
  v_updated INTEGER := 0;
BEGIN
  UPDATE order_items
  SET kitchen_status = 'preparing'
  WHERE order_id = p_order_id
    AND kitchen_status = 'ready';

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  INSERT INTO audit_log (table_name, record_id, action, old_data, new_data, performed_by, created_at)
  VALUES (
    'order_items',
    p_order_id,
    'recall',
    jsonb_build_object('order_id', p_order_id),
    jsonb_build_object('recalled_items', v_updated),
    p_performed_by,
    now()
  );

  RETURN jsonb_build_object('success', true, 'recalled_items', v_updated);
END;
$function$;

GRANT ALL ON FUNCTION public.recall_order_items(uuid, uuid) TO anon;

GRANT ALL ON FUNCTION public.recall_order_items(uuid, uuid) TO authenticated;

GRANT ALL ON FUNCTION public.recall_order_items(uuid, uuid) TO service_role;