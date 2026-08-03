CREATE FUNCTION public.transfer_orders_atomic (
  p_from_table   integer,
  p_to_table     integer,
  p_performed_by uuid    DEFAULT NULL::uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
DECLARE
  v_target_floor RECORD;
  v_orders RECORD;
  v_order_ids UUID[];
  v_moved_count INTEGER := 0;
BEGIN
  -- Lock target table floor (prevent race on "is it empty?")
  SELECT * INTO v_target_floor
  FROM table_floors
  WHERE table_number = p_to_table
  FOR UPDATE;

  IF v_target_floor.status = 'reserved' THEN
    RAISE EXCEPTION 'TARGET_TABLE_RESERVED' USING ERRCODE = 'P0001';
  END IF;
  IF v_target_floor.status = 'occupied' THEN
    RAISE EXCEPTION 'TARGET_TABLE_OCCUPIED' USING ERRCODE = 'P0001';
  END IF;

  -- Lock all source orders
  FOR v_orders IN
    SELECT id, guest_count FROM orders
    WHERE table_number = p_from_table AND status NOT IN ('paid', 'cancelled', 'closed')
    FOR UPDATE
  LOOP
    v_order_ids := array_append(v_order_ids, v_orders.id);
  END LOOP;

  IF array_length(v_order_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'NO_ACTIVE_ORDERS' USING ERRCODE = 'P0001';
  END IF;

  -- Move orders to new table
  UPDATE orders
  SET table_number = p_to_table, version = COALESCE(version, 0) + 1, updated_at = now()
  WHERE id = ANY(v_order_ids);

  v_moved_count := array_length(v_order_ids, 1);

  -- Clear source table floor
  UPDATE table_floors
  SET
    status = 'empty',
    reservation_id = NULL,
    reservation_name = NULL,
    reservation_phone = NULL,
    reservation_time = NULL,
    guest_count = NULL,
    merged_into_table = NULL
  WHERE table_number = p_from_table;

  -- Transfer reservation data to target table floor
  UPDATE table_floors
  SET
    status = 'occupied',
    guest_count = (SELECT COALESCE(SUM(guest_count), 0) FROM orders WHERE id = ANY(v_order_ids))
  WHERE table_number = p_to_table;

  -- Audit
  INSERT INTO audit_log (table_name, record_id, action, old_data, new_data, performed_by, created_at)
  VALUES (
    'orders',
    v_order_ids[1],
    'transfer',
    jsonb_build_object('from', p_from_table, 'to', p_to_table),
    jsonb_build_object('order_ids', v_order_ids, 'moved_count', v_moved_count),
    p_performed_by,
    now()
  );

  RETURN jsonb_build_object(
    'success', true,
    'from_table', p_from_table,
    'to_table', p_to_table,
    'moved_count', v_moved_count,
    'order_ids', v_order_ids
  );
END;
$function$;

GRANT ALL ON FUNCTION public.transfer_orders_atomic(integer, integer, uuid) TO anon;

GRANT ALL ON FUNCTION public.transfer_orders_atomic(integer, integer, uuid) TO authenticated;

GRANT ALL ON FUNCTION public.transfer_orders_atomic(integer, integer, uuid) TO service_role;