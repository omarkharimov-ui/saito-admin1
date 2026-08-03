CREATE FUNCTION public.mark_delivered (
  p_order_id     uuid,
  p_performed_by uuid DEFAULT NULL::uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
DECLARE
  v_order RECORD;
BEGIN
  SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  -- Free courier
  IF v_order.courier_id IS NOT NULL THEN
    UPDATE couriers SET
      current_order_id = NULL,
      total_deliveries = total_deliveries + 1
    WHERE id = v_order.courier_id;
  END IF;

  UPDATE orders SET
    status = 'paid',
    delivery_status = 'delivered',
    delivered_at = now(),
    paid_at = now(),
    kitchen_status = 'completed',
    version = COALESCE(version, 0) + 1,
    updated_at = now()
  WHERE id = p_order_id;

  PERFORM log_order_event(
    p_order_id, 'order_delivered',
    jsonb_build_object('delivery_status', v_order.delivery_status),
    jsonb_build_object('delivered_at', now()),
    NULL, p_performed_by, NULL, NULL, NULL
  );

  RETURN jsonb_build_object('success', true, 'order_id', p_order_id);
END;
$function$;

GRANT ALL ON FUNCTION public.mark_delivered(uuid, uuid) TO anon;

GRANT ALL ON FUNCTION public.mark_delivered(uuid, uuid) TO authenticated;

GRANT ALL ON FUNCTION public.mark_delivered(uuid, uuid) TO service_role;