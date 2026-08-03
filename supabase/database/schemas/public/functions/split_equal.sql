CREATE FUNCTION public.split_equal (
  p_order_id     uuid,
  p_split_count  integer,
  p_performed_by uuid    DEFAULT NULL::uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
DECLARE
  v_original RECORD;
  v_split_total NUMERIC;
  v_remainder NUMERIC;
  v_new_order_id UUID;
  v_split_amount NUMERIC;
  v_i INTEGER;
BEGIN
  SELECT * INTO v_original FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;
  IF v_original.status = 'paid' THEN
    RAISE EXCEPTION 'ORDER_ALREADY_PAID' USING ERRCODE = 'P0001';
  END IF;
  IF p_split_count < 2 OR p_split_count > 12 THEN
    RAISE EXCEPTION 'INVALID_SPLIT_COUNT' USING ERRCODE = 'P0001';
  END IF;

  v_split_total := COALESCE(v_original.total_amount, 0);
  v_split_amount := floor(v_split_total / p_split_count * 100) / 100;
  v_remainder := v_split_total - (v_split_amount * (p_split_count - 1));

  -- Create N-1 split orders (last one keeps the original)
  FOR v_i IN 1..(p_split_count - 1)
  LOOP
    INSERT INTO orders (
      table_number, order_source, status, guest_count,
      total_amount, is_split, merged_into, version, created_at
    ) VALUES (
      v_original.table_number, v_original.order_source, 'confirmed', 1,
      v_split_amount, true, p_order_id, 1, now()
    )
    RETURNING id INTO v_new_order_id;
  END LOOP;

  -- Update original with remainder
  UPDATE orders SET
    total_amount = v_remainder,
    is_split = true,
    version = COALESCE(version, 0) + 1
  WHERE id = p_order_id;

  PERFORM log_order_event(
    p_order_id, 'bill_split',
    jsonb_build_object('total_amount', v_split_total, 'split_count', p_split_count),
    jsonb_build_object('split_amount', v_split_amount, 'remainder', v_remainder),
    NULL, p_performed_by, NULL, NULL, NULL
  );

  RETURN jsonb_build_object(
    'success', true,
    'split_count', p_split_count,
    'split_amount', v_split_amount,
    'remainder', v_remainder,
    'original_order_id', p_order_id
  );
END;
$function$;

GRANT ALL ON FUNCTION public.split_equal(uuid, integer, uuid) TO anon;

GRANT ALL ON FUNCTION public.split_equal(uuid, integer, uuid) TO authenticated;

GRANT ALL ON FUNCTION public.split_equal(uuid, integer, uuid) TO service_role;