CREATE FUNCTION public.split_by_seat (
  p_order_id     uuid,
  p_seat_number  integer,
  p_performed_by uuid    DEFAULT NULL::uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
DECLARE
  v_original RECORD;
  v_new_order_id UUID;
  v_new_total NUMERIC := 0;
  v_item_count INTEGER := 0;
BEGIN
  SELECT * INTO v_original FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;
  IF v_original.status = 'paid' THEN
    RAISE EXCEPTION 'ORDER_ALREADY_PAID' USING ERRCODE = 'P0001';
  END IF;

  -- Create new order for the split
  INSERT INTO orders (
    table_number, order_source, status, guest_count,
    total_amount, is_split, merged_into, version, created_at
  ) VALUES (
    v_original.table_number, v_original.order_source, 'confirmed', 1,
    0, true, p_order_id, 1, now()
  )
  RETURNING id INTO v_new_order_id;

  -- Move seat items to new order
  INSERT INTO order_items (
    order_id, product_id, product_name, quantity, unit_price, total_price,
    modifiers, special_notes, combo_group_id, variant_id,
    kitchen_status, seat_number, course, price_snapshot
  )
  SELECT
    v_new_order_id, product_id, product_name, quantity, unit_price, total_price,
    modifiers, special_notes, combo_group_id, variant_id,
    kitchen_status, seat_number, course, price_snapshot
  FROM order_items
  WHERE order_id = p_order_id
    AND seat_number = p_seat_number
    AND kitchen_status NOT IN ('cancelled');

  GET DIAGNOSTICS v_item_count = ROW_COUNT;

  -- Calculate new total
  SELECT COALESCE(SUM(total_price), 0) INTO v_new_total
  FROM order_items WHERE order_id = v_new_order_id;

  UPDATE orders SET total_amount = v_new_total WHERE id = v_new_order_id;

  -- Update original order total
  UPDATE orders SET
    total_amount = GREATEST(0, COALESCE(total_amount, 0) - v_new_total),
    version = COALESCE(version, 0) + 1
  WHERE id = p_order_id;

  -- Log events
  PERFORM log_order_event(
    p_order_id, 'bill_split',
    jsonb_build_object('total_amount', v_original.total_amount),
    jsonb_build_object('split_to', v_new_order_id, 'seat', p_seat_number, 'amount', v_new_total),
    NULL, p_performed_by, NULL, NULL, NULL
  );

  PERFORM log_operation(
    'split_bill', p_order_id,
    v_original.table_number, NULL,
    jsonb_build_object('total_amount', v_original.total_amount, 'seat', p_seat_number),
    jsonb_build_object('new_order_id', v_new_order_id, 'new_total', v_new_total),
    jsonb_build_object('undo_action', 'merge', 'order_id', v_new_order_id),
    p_performed_by, NULL, NULL, NULL, NULL
  );

  RETURN jsonb_build_object(
    'success', true,
    'new_order_id', v_new_order_id,
    'seat_number', p_seat_number,
    'items_moved', v_item_count,
    'new_total', v_new_total,
    'remaining_total', GREATEST(0, COALESCE(v_original.total_amount, 0) - v_new_total)
  );
END;
$function$;

GRANT ALL ON FUNCTION public.split_by_seat(uuid, integer, uuid) TO anon;

GRANT ALL ON FUNCTION public.split_by_seat(uuid, integer, uuid) TO authenticated;

GRANT ALL ON FUNCTION public.split_by_seat(uuid, integer, uuid) TO service_role;