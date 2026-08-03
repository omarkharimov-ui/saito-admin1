CREATE FUNCTION public.update_delivery_order (
  p_order_id                uuid,
  p_customer_phone          text                     DEFAULT NULL::text,
  p_customer_name           text                     DEFAULT NULL::text,
  p_customer_note           text                     DEFAULT NULL::text,
  p_delivery_address        text                     DEFAULT NULL::text,
  p_delivery_fee            numeric                  DEFAULT NULL::numeric,
  p_courier_id              uuid                     DEFAULT NULL::uuid,
  p_estimated_delivery_time timestamp with time zone DEFAULT NULL::timestamp WITH time zone,
  p_performed_by            uuid                     DEFAULT NULL::uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
DECLARE
  v_order RECORD;
  v_courier_name TEXT;
BEGIN
  SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;
  IF v_order.status IN ('paid', 'closed') THEN
    RAISE EXCEPTION 'ORDER_FINALIZED' USING ERRCODE = 'P0001';
  END IF;

  -- Resolve courier name if courier_id provided
  IF p_courier_id IS NOT NULL THEN
    SELECT name INTO v_courier_name FROM couriers WHERE id = p_courier_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'COURIER_NOT_FOUND' USING ERRCODE = 'P0001';
    END IF;

    -- Free up previous courier if assigned
    IF v_order.courier_id IS NOT NULL AND v_order.courier_id != p_courier_id THEN
      UPDATE couriers SET current_order_id = NULL WHERE id = v_order.courier_id;
    END IF;

    -- Assign to new courier
    UPDATE couriers SET current_order_id = p_order_id WHERE id = p_courier_id;
  END IF;

  UPDATE orders SET
    customer_phone = COALESCE(p_customer_phone, customer_phone),
    customer_name = COALESCE(p_customer_name, customer_name),
    customer_note = COALESCE(p_customer_note, customer_note),
    delivery_address = COALESCE(p_delivery_address, delivery_address),
    delivery_fee = COALESCE(p_delivery_fee, delivery_fee),
    total_amount = COALESCE(total_amount, 0) - COALESCE(v_order.delivery_fee, 0) + COALESCE(p_delivery_fee, COALESCE(v_order.delivery_fee, 0)),
    courier_id = COALESCE(p_courier_id, courier_id),
    courier_name = COALESCE(v_courier_name, courier_name),
    estimated_delivery_time = COALESCE(p_estimated_delivery_time, estimated_delivery_time),
    version = COALESCE(version, 0) + 1,
    updated_at = now()
  WHERE id = p_order_id;

  RETURN jsonb_build_object('success', true, 'order_id', p_order_id);
END;
$function$;

GRANT ALL ON FUNCTION public.update_delivery_order(uuid, text, text, text, text, numeric, uuid, timestamp WITH time zone, uuid) TO anon;

GRANT ALL ON FUNCTION public.update_delivery_order(uuid, text, text, text, text, numeric, uuid, timestamp WITH time zone, uuid) TO authenticated;

GRANT ALL ON FUNCTION public.update_delivery_order(uuid, text, text, text, text, numeric, uuid, timestamp WITH time zone, uuid) TO service_role;