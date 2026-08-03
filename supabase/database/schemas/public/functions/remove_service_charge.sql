CREATE FUNCTION public.remove_service_charge (
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

  UPDATE orders SET
    service_charge_pct = 0,
    service_charge_amount = 0,
    version = COALESCE(version, 0) + 1
  WHERE id = p_order_id;

  PERFORM log_order_event(
    p_order_id, 'service_charge_removed',
    jsonb_build_object('old_pct', v_order.service_charge_pct, 'old_amount', v_order.service_charge_amount),
    jsonb_build_object('pct', 0, 'amount', 0),
    NULL, p_performed_by, NULL, NULL, NULL
  );

  RETURN jsonb_build_object('success', true);
END;
$function$;

GRANT ALL ON FUNCTION public.remove_service_charge(uuid, uuid) TO anon;

GRANT ALL ON FUNCTION public.remove_service_charge(uuid, uuid) TO authenticated;

GRANT ALL ON FUNCTION public.remove_service_charge(uuid, uuid) TO service_role;