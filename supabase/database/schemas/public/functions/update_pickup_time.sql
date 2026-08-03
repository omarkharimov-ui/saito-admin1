CREATE FUNCTION public.update_pickup_time (
  p_order_id     uuid,
  p_pickup_time  timestamp with time zone,
  p_performed_by uuid                     DEFAULT NULL::uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
BEGIN
  UPDATE orders SET
    estimated_delivery_time = p_pickup_time,
    version = COALESCE(version, 0) + 1,
    updated_at = now()
  WHERE id = p_order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  PERFORM log_order_event(
    p_order_id, 'status_changed',
    NULL,
    jsonb_build_object('pickup_time', p_pickup_time),
    NULL, p_performed_by, NULL, NULL, NULL
  );

  RETURN jsonb_build_object('success', true, 'order_id', p_order_id, 'pickup_time', p_pickup_time);
END;
$function$;

GRANT ALL ON FUNCTION public.update_pickup_time(uuid, timestamp WITH time zone, uuid) TO anon;

GRANT ALL ON FUNCTION public.update_pickup_time(uuid, timestamp WITH time zone, uuid) TO authenticated;

GRANT ALL ON FUNCTION public.update_pickup_time(uuid, timestamp WITH time zone, uuid) TO service_role;