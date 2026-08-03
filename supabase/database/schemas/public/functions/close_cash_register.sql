CREATE FUNCTION public.close_cash_register (
  p_shift_id    uuid,
  p_actual_cash numeric,
  p_notes       text    DEFAULT NULL::text,
  p_manager_id  uuid    DEFAULT NULL::uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
DECLARE
  v_shift RECORD;
  v_expected NUMERIC;
  v_difference NUMERIC;
BEGIN
  SELECT * INTO v_shift FROM shifts WHERE id = p_shift_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SHIFT_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;
  IF v_shift.closed_at IS NOT NULL THEN
    RAISE EXCEPTION 'SHIFT_ALREADY_CLOSED' USING ERRCODE = 'P0001';
  END IF;

  -- Calculate expected cash from orders during shift
  SELECT COALESCE(SUM(total_amount), 0) INTO v_expected
  FROM orders
  WHERE status = 'paid'
    AND created_by = v_shift.staff_id
    AND paid_at BETWEEN v_shift.opened_at AND now()
    AND payment_method IN ('cash', 'nağd');

  v_difference := p_actual_cash - v_expected;

  UPDATE shifts SET
    closed_at = now(),
    expected_cash = v_expected,
    actual_cash = p_actual_cash,
    difference = v_difference,
    manager_approved = (p_manager_id IS NOT NULL),
    manager_id = p_manager_id,
    notes = COALESCE(p_notes, notes),
    updated_at = now()
  WHERE id = p_shift_id;

  RETURN jsonb_build_object(
    'success', true,
    'shift_id', p_shift_id,
    'expected_cash', v_expected,
    'actual_cash', p_actual_cash,
    'difference', v_difference,
    'closed_at', now()
  );
END;
$function$;

GRANT ALL ON FUNCTION public.close_cash_register(uuid, numeric, text, uuid) TO anon;

GRANT ALL ON FUNCTION public.close_cash_register(uuid, numeric, text, uuid) TO authenticated;

GRANT ALL ON FUNCTION public.close_cash_register(uuid, numeric, text, uuid) TO service_role;