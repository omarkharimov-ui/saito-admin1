CREATE FUNCTION public.update_takeaway_order (
  p_order_id              uuid,
  p_customer_phone        text                     DEFAULT NULL::text,
  p_customer_name         text                     DEFAULT NULL::text,
  p_customer_note         text                     DEFAULT NULL::text,
  p_estimated_pickup_time timestamp with time zone DEFAULT NULL::timestamp WITH time zone,
  p_performed_by          uuid                     DEFAULT NULL::uuid
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
  IF v_order.status = 'paid' THEN
    RAISE EXCEPTION 'ORDER_ALREADY_PAID' USING ERRCODE = 'P0001';
  END IF;

  UPDATE orders SET
    customer_phone = COALESCE(p_customer_phone, customer_phone),
    customer_name = COALESCE(p_customer_name, customer_name),
    customer_note = COALESCE(p_customer_note, customer_note),
    estimated_delivery_time = COALESCE(p_estimated_pickup_time, estimated_delivery_time),
    version = COALESCE(version, 0) + 1,
    updated_at = now()
  WHERE id = p_order_id;

  RETURN jsonb_build_object('success', true, 'order_id', p_order_id);
END;
$function$;

GRANT ALL ON FUNCTION public.update_takeaway_order(uuid, text, text, text, timestamp WITH time zone, uuid) TO anon;

GRANT ALL ON FUNCTION public.update_takeaway_order(uuid, text, text, text, timestamp WITH time zone, uuid) TO authenticated;

GRANT ALL ON FUNCTION public.update_takeaway_order(uuid, text, text, text, timestamp WITH time zone, uuid) TO service_role;