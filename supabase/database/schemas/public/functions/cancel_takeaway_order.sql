CREATE FUNCTION public.cancel_takeaway_order (
  p_order_id     uuid,
  p_reason       text DEFAULT NULL::text,
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
  IF v_order.status IN ('paid', 'closed', 'cancelled') THEN
    RAISE EXCEPTION 'CANNOT_CANCEL' USING ERRCODE = 'P0001';
  END IF;

  UPDATE orders SET
    status = 'cancelled',
    kitchen_status = 'cancelled',
    cancelled_at = now(),
    cancelled_reason = p_reason,
    version = COALESCE(version, 0) + 1,
    updated_at = now()
  WHERE id = p_order_id;

  -- Cancel all active items
  UPDATE order_items SET kitchen_status = 'cancelled'
  WHERE order_id = p_order_id
    AND kitchen_status NOT IN ('cancelled', 'served', 'completed');

  PERFORM log_order_event(
    p_order_id, 'order_cancelled',
    jsonb_build_object('status', v_order.status),
    jsonb_build_object('reason', p_reason),
    NULL, p_performed_by, NULL, NULL, NULL
  );

  RETURN jsonb_build_object('success', true, 'order_id', p_order_id);
END;
$function$;

GRANT ALL ON FUNCTION public.cancel_takeaway_order(uuid, text, uuid) TO anon;

GRANT ALL ON FUNCTION public.cancel_takeaway_order(uuid, text, uuid) TO authenticated;

GRANT ALL ON FUNCTION public.cancel_takeaway_order(uuid, text, uuid) TO service_role;