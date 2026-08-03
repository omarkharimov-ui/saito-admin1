CREATE FUNCTION public.transition_delivery_status (
  p_order_id                 uuid,
  p_new_status               text,
  p_courier_id               uuid DEFAULT NULL::uuid,
  p_courier_name             text DEFAULT NULL::text,
  p_performed_by             uuid DEFAULT NULL::uuid,
  p_performed_by_terminal_id text DEFAULT NULL::text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  AS $function$
DECLARE
  v_order RECORD;
  v_update JSONB;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;

  v_update := jsonb_build_object(
    'delivery_status', p_new_status,
    'updated_at', NOW(),
    'version', COALESCE(v_order.version, 0) + 1,
    'updated_by_terminal_id', p_performed_by_terminal_id
  );

  IF p_new_status = 'delivered' THEN
    v_update := v_update || jsonb_build_object('delivered_at', NOW(), 'status', 'paid');
  END IF;

  IF p_courier_id IS NOT NULL THEN
    v_update := v_update || jsonb_build_object('courier_id', p_courier_id);
  END IF;

  IF p_courier_name IS NOT NULL THEN
    v_update := v_update || jsonb_build_object('courier_name', p_courier_name);
  END IF;

  UPDATE public.orders SET
    delivery_status = p_new_status,
    status = CASE WHEN p_new_status = 'delivered' THEN 'paid' ELSE status END,
    delivered_at = CASE WHEN p_new_status = 'delivered' THEN NOW() ELSE delivered_at END,
    courier_id = p_courier_id,
    courier_name = p_courier_name,
    updated_at = NOW(),
    version = COALESCE(v_order.version, 0) + 1,
    updated_by_terminal_id = p_performed_by_terminal_id
  WHERE id = p_order_id;

  INSERT INTO public.operation_logs (
    table_number, order_id, action, old_values, new_values, performed_by
  ) VALUES (
    v_order.table_number, p_order_id, 'transition_delivery_status',
    jsonb_build_object('delivery_status', v_order.delivery_status),
    jsonb_build_object('delivery_status', p_new_status),
    p_performed_by
  );

  RETURN jsonb_build_object('success', true, 'order_id', p_order_id);
END;
$function$;

GRANT ALL ON FUNCTION public.transition_delivery_status(uuid, text, uuid, text, uuid, text) TO anon;

GRANT ALL ON FUNCTION public.transition_delivery_status(uuid, text, uuid, text, uuid, text) TO authenticated;

GRANT ALL ON FUNCTION public.transition_delivery_status(uuid, text, uuid, text, uuid, text) TO service_role;