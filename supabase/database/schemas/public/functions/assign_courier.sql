CREATE FUNCTION public.assign_courier (
  p_order_id     uuid,
  p_courier_id   uuid,
  p_performed_by uuid DEFAULT NULL::uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
DECLARE
  v_order RECORD;
  v_courier RECORD;
BEGIN
  SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_courier FROM couriers WHERE id = p_courier_id AND is_active = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'COURIER_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  -- Check if courier already has an order
  IF v_courier.current_order_id IS NOT NULL AND v_courier.current_order_id != p_order_id THEN
    RAISE EXCEPTION 'COURIER_BUSY' USING ERRCODE = 'P0001';
  END IF;

  -- Free previous courier
  IF v_order.courier_id IS NOT NULL AND v_order.courier_id != p_courier_id THEN
    UPDATE couriers SET current_order_id = NULL WHERE id = v_order.courier_id;
  END IF;

  -- Assign
  UPDATE couriers SET current_order_id = p_order_id WHERE id = p_courier_id;
  UPDATE orders SET
    courier_id = p_courier_id,
    courier_name = v_courier.name,
    version = COALESCE(version, 0) + 1,
    updated_at = now()
  WHERE id = p_order_id;

  PERFORM log_order_event(
    p_order_id, 'courier_assigned',
    NULL,
    jsonb_build_object('courier_id', p_courier_id, 'courier_name', v_courier.name),
    NULL, p_performed_by, NULL, NULL, NULL
  );

  RETURN jsonb_build_object('success', true, 'courier_name', v_courier.name);
END;
$function$;

GRANT ALL ON FUNCTION public.assign_courier(uuid, uuid, uuid) TO anon;

GRANT ALL ON FUNCTION public.assign_courier(uuid, uuid, uuid) TO authenticated;

GRANT ALL ON FUNCTION public.assign_courier(uuid, uuid, uuid) TO service_role;