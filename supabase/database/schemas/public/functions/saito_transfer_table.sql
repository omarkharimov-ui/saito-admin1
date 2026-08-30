CREATE OR REPLACE FUNCTION public.saito_transfer_table (
  p_from_table   integer,
  p_to_table     integer,
  p_performed_by uuid    DEFAULT NULL::uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  AS $function$
DECLARE
  v_order RECORD;
  v_target_order_id uuid;
  v_undo_data jsonb;
  v_now timestamptz := now();
  v_result jsonb;
BEGIN
  PERFORM public.validate_actor(p_performed_by);
  -- Check source has active orders
  SELECT id, table_number, total_amount, guest_count INTO v_order
  FROM orders
  WHERE table_number = p_from_table AND status NOT IN ('paid', 'cancelled')
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NO_ACTIVE_ORDERS';
  END IF;

  -- If target has active orders, merge
  SELECT id INTO v_target_order_id
  FROM orders
  WHERE table_number = p_to_table AND status NOT IN ('paid', 'cancelled')
  LIMIT 1;

  IF FOUND THEN
    -- Merge source into target
    UPDATE orders
    SET merged_into = v_target_order_id::text,
        table_number = p_to_table,
        updated_at = v_now
    WHERE id = v_order.id;

    v_undo_data := jsonb_build_object(
      'action', 'transfer',
      'order_id', v_order.id,
      'from_table', p_from_table,
      'to_table', p_to_table,
      'merged', true,
      'target_order_id', v_target_order_id
    );

    UPDATE table_floors
    SET status = 'empty', total_amount = 0, guest_count = NULL, order_count = 0
    WHERE table_number = p_from_table;
  ELSE
    -- Just move order to target table
    UPDATE orders
    SET table_number = p_to_table, updated_at = v_now
    WHERE id = v_order.id;

    v_undo_data := jsonb_build_object(
      'action', 'transfer',
      'order_id', v_order.id,
      'from_table', p_from_table,
      'to_table', p_to_table,
      'merged', false
    );

    UPDATE table_floors
    SET status = 'empty', total_amount = 0, guest_count = NULL, order_count = 0
    WHERE table_number = p_from_table;
  END IF;

  -- Refresh target table totals
  UPDATE table_floors
  SET status = 'occupied',
      total_amount = (SELECT COALESCE(SUM(total_amount), 0)
        FROM orders WHERE table_number = p_to_table AND status NOT IN ('paid', 'cancelled')),
      guest_count = (SELECT COALESCE(SUM(guest_count), 0)
        FROM orders WHERE table_number = p_to_table AND status NOT IN ('paid', 'cancelled'))
  WHERE table_number = p_to_table;

  INSERT INTO audit_log (table_name, record_id, action, old_data, new_data, changed_by)
  VALUES ('orders'::text, v_order.id, 'transfer'::text, '{}'::jsonb,
    jsonb_build_object('from_table', p_from_table, 'to_table', p_to_table),
    p_performed_by);

  SELECT jsonb_build_object('moved_orders', 1, 'undo', v_undo_data) INTO v_result;
  RETURN v_result;
END;
$function$;



