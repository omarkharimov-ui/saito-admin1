CREATE FUNCTION public.reopen_order (
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
  IF v_order.status != 'paid' THEN
    RAISE EXCEPTION 'ORDER_NOT_PAID' USING ERRCODE = 'P0001';
  END IF;
  IF v_order.paid_at IS NULL OR now() - v_order.paid_at > INTERVAL '24 hours' THEN
    RAISE EXCEPTION 'REOPEN_WINDOW_EXPIRED' USING ERRCODE = 'P0001';
  END IF;

  UPDATE orders
  SET status = 'confirmed',
      paid_at = NULL,
      paid_amount = 0,
      version = COALESCE(version, 0) + 1
  WHERE id = p_order_id;

  INSERT INTO audit_log (table_name, record_id, action, old_data, new_data, performed_by, created_at)
  VALUES (
    'orders',
    p_order_id,
    'reopen',
    jsonb_build_object('status', 'paid', 'paid_at', v_order.paid_at),
    jsonb_build_object('status', 'confirmed', 'reopened_at', now()),
    p_performed_by,
    now()
  );

  RETURN jsonb_build_object('success', true);
END;
$function$;

GRANT ALL ON FUNCTION public.reopen_order(uuid, uuid) TO anon;

GRANT ALL ON FUNCTION public.reopen_order(uuid, uuid) TO authenticated;

GRANT ALL ON FUNCTION public.reopen_order(uuid, uuid) TO service_role;