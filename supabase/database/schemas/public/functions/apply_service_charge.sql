CREATE FUNCTION public.apply_service_charge (
  p_order_id     uuid,
  p_pct          numeric,
  p_performed_by uuid    DEFAULT NULL::uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
DECLARE
  v_order RECORD;
  v_sc_amount NUMERIC;
BEGIN
  SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;
  IF v_order.status = 'paid' THEN
    RAISE EXCEPTION 'ORDER_ALREADY_PAID' USING ERRCODE = 'P0001';
  END IF;
  IF p_pct < 0 OR p_pct > 50 THEN
    RAISE EXCEPTION 'INVALID_SERVICE_CHARGE_PCT' USING ERRCODE = 'P0001';
  END IF;

  v_sc_amount := round(COALESCE(v_order.total_amount, 0) * p_pct / 100, 2);

  UPDATE orders SET
    service_charge_pct = p_pct,
    service_charge_amount = v_sc_amount,
    version = COALESCE(version, 0) + 1
  WHERE id = p_order_id;

  PERFORM log_order_event(
    p_order_id, 'service_charge_applied',
    jsonb_build_object('old_pct', v_order.service_charge_pct, 'old_amount', v_order.service_charge_amount),
    jsonb_build_object('pct', p_pct, 'amount', v_sc_amount),
    NULL, p_performed_by, NULL, NULL, NULL
  );

  RETURN jsonb_build_object(
    'success', true,
    'service_charge_pct', p_pct,
    'service_charge_amount', v_sc_amount,
    'new_total', COALESCE(v_order.total_amount, 0) + v_sc_amount
  );
END;
$function$;

GRANT ALL ON FUNCTION public.apply_service_charge(uuid, numeric, uuid) TO anon;

GRANT ALL ON FUNCTION public.apply_service_charge(uuid, numeric, uuid) TO authenticated;

GRANT ALL ON FUNCTION public.apply_service_charge(uuid, numeric, uuid) TO service_role;