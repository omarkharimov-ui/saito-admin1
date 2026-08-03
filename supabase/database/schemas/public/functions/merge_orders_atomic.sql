CREATE FUNCTION public.merge_orders_atomic (
  p_source_order_ids uuid[],
  p_target_order_id  uuid,
  p_extra_amount     numeric DEFAULT 0,
  p_extra_guests     integer DEFAULT 0
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
DECLARE
  v_target RECORD;
  v_source RECORD;
  v_merged_count INTEGER := 0;
  v_all_ids UUID[];
BEGIN
  v_all_ids := array_append(p_source_order_ids, p_target_order_id);

  -- Lock target order
  SELECT * INTO v_target FROM orders WHERE id = p_target_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TARGET_ORDER_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;
  IF v_target.status IN ('paid', 'cancelled', 'closed') THEN
    RAISE EXCEPTION 'TARGET_ORDER_CLOSED' USING ERRCODE = 'P0001';
  END IF;

  -- Lock and validate all source orders
  FOR v_source IN
    SELECT * FROM orders WHERE id = ANY(p_source_order_ids) FOR UPDATE
  LOOP
    IF v_source.status IN ('paid', 'cancelled', 'closed') THEN
      RAISE EXCEPTION 'SOURCE_ORDER_CLOSED' USING ERRCODE = 'P0001';
    END IF;
    IF v_source.merged_into IS NOT NULL THEN
      RAISE EXCEPTION 'SOURCE_ALREADY_MERGED' USING ERRCODE = 'P0001';
    END IF;

    -- Mark source as merged
    UPDATE orders
    SET merged_into = p_target_order_id, version = COALESCE(version, 0) + 1
    WHERE id = v_source.id;

    v_merged_count := v_merged_count + 1;
  END LOOP;

  -- Update target order totals
  UPDATE orders
  SET
    total_amount = COALESCE(v_target.total_amount, 0) + COALESCE(p_extra_amount, 0),
    guest_count = COALESCE(v_target.guest_count, 1) + COALESCE(p_extra_guests, 0),
    version = COALESCE(v_target.version, 0) + 1
  WHERE id = p_target_order_id;

  RETURN jsonb_build_object(
    'success', true,
    'target_order_id', p_target_order_id,
    'extra_amount', p_extra_amount,
    'extra_guests', p_extra_guests,
    'new_total', COALESCE(v_target.total_amount, 0) + COALESCE(p_extra_amount, 0),
    'merged_count', v_merged_count
  );
END;
$function$;

GRANT ALL ON FUNCTION public.merge_orders_atomic(uuid[], uuid, numeric, integer) TO anon;

GRANT ALL ON FUNCTION public.merge_orders_atomic(uuid[], uuid, numeric, integer) TO authenticated;

GRANT ALL ON FUNCTION public.merge_orders_atomic(uuid[], uuid, numeric, integer) TO service_role;