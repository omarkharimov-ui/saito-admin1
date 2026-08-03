CREATE FUNCTION public.transition_order_status (
  p_order_id      uuid,
  p_new_status    text,
  p_performed_by  uuid  DEFAULT NULL::uuid,
  p_employee_name text  DEFAULT NULL::text,
  p_reason        text  DEFAULT NULL::text,
  p_metadata      jsonb DEFAULT NULL::jsonb,
  p_ip_address    text  DEFAULT NULL::text,
  p_device_id     text  DEFAULT NULL::text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
DECLARE
  v_order RECORD;
  v_validation JSONB;
  v_old_status TEXT;
  v_old_kitchen_status TEXT;
BEGIN
  -- 1. Lock and fetch order
  SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  v_old_status := v_order.status;
  v_old_kitchen_status := v_order.kitchen_status;

  -- 2. Validate transition
  v_validation := validate_transition('order', v_old_status, p_new_status);
  IF NOT (v_validation->>'valid')::BOOLEAN THEN
    RAISE EXCEPTION 'INVALID_TRANSITION: %', v_validation->>'error' USING ERRCODE = 'P0001';
  END IF;

  -- 3. Apply transition
  UPDATE orders SET
    status = p_new_status,
    version = COALESCE(version, 0) + 1,
    updated_at = now()
  WHERE id = p_order_id;

  -- 4. Derive kitchen_status from order status
  CASE p_new_status
    WHEN 'in_kitchen' THEN
      UPDATE orders SET kitchen_status = 'preparing' WHERE id = p_order_id AND kitchen_status IS DISTINCT FROM 'preparing';
    WHEN 'ready' THEN
      UPDATE orders SET kitchen_status = 'ready' WHERE id = p_order_id;
    WHEN 'served' THEN
      UPDATE orders SET kitchen_status = 'completed' WHERE id = p_order_id;
    WHEN 'paid', 'closed' THEN
      UPDATE orders SET kitchen_status = 'completed' WHERE id = p_order_id
        AND kitchen_status NOT IN ('completed', 'cancelled');
    WHEN 'cancelled' THEN
      UPDATE orders SET kitchen_status = 'cancelled' WHERE id = p_order_id
        AND kitchen_status NOT IN ('cancelled');
    ELSE NULL;
  END CASE;

  -- 5. Log event
  PERFORM log_order_event(
    p_order_id,
    'status_changed',
    jsonb_build_object('status', v_old_status, 'kitchen_status', v_old_kitchen_status),
    jsonb_build_object('status', p_new_status, 'kitchen_status', (SELECT kitchen_status FROM orders WHERE id = p_order_id)),
    p_metadata,
    p_performed_by,
    p_employee_name,
    p_ip_address,
    p_device_id
  );

  -- 6. Audit log
  INSERT INTO audit_logs (table_name, record_id, action, old_data, new_data, performed_by, created_at)
  VALUES (
    'orders', p_order_id, 'status_change',
    jsonb_build_object('status', v_old_status),
    jsonb_build_object('status', p_new_status, 'reason', p_reason),
    p_performed_by, now()
  );

  RETURN jsonb_build_object(
    'success', true,
    'order_id', p_order_id,
    'old_status', v_old_status,
    'new_status', p_new_status,
    'kitchen_status', (SELECT kitchen_status FROM orders WHERE id = p_order_id)
  );
END;
$function$;

GRANT ALL ON FUNCTION public.transition_order_status(uuid, text, uuid, text, text, jsonb, text, text) TO anon;

GRANT ALL ON FUNCTION public.transition_order_status(uuid, text, uuid, text, text, jsonb, text, text) TO authenticated;

GRANT ALL ON FUNCTION public.transition_order_status(uuid, text, uuid, text, text, jsonb, text, text) TO service_role;