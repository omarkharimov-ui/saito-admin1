CREATE FUNCTION public.cancel_table_orders (
  p_table_number integer,
  p_performed_by uuid    DEFAULT NULL::uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
DECLARE
  v_orders RECORD;
  v_order_ids UUID[];
  v_item RECORD;
  v_reversal_items JSONB := '[]'::JSONB;
  v_reversed_count INTEGER := 0;
BEGIN
  -- Lock all active orders on this table
  FOR v_orders IN
    SELECT id FROM orders
    WHERE table_number = p_table_number AND status NOT IN ('paid', 'cancelled', 'closed')
    FOR UPDATE
  LOOP
    v_order_ids := array_append(v_order_ids, v_orders.id);
  END LOOP;

  IF array_length(v_order_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('success', true, 'cancelled_orders', 0);
  END IF;

  -- Build reversal payload for non-served items
  SELECT jsonb_agg(
    jsonb_build_object(
      'order_item_id', oi.id,
      'reverse_qty', oi.quantity
    )
  ) INTO v_reversal_items
  FROM order_items oi
  WHERE oi.order_id = ANY(v_order_ids)
    AND oi.kitchen_status IS DISTINCT FROM 'cancelled'
    AND (oi.served_quantity IS NULL OR oi.served_quantity = 0);

  -- Reverse stock (inside same transaction — atomic)
  IF v_reversal_items IS NOT NULL AND jsonb_array_length(v_reversal_items) > 0 THEN
    SELECT COALESCE(SUM((x.value->>'reverse_qty')::INTEGER), 0)
    INTO v_reversed_count
    FROM jsonb_array_elements(v_reversal_items) AS x;

    PERFORM reverse_stock_deduction_for_items(v_reversal_items::TEXT);
  END IF;

  -- Mark items as cancelled
  UPDATE order_items
  SET kitchen_status = 'cancelled'
  WHERE order_id = ANY(v_order_ids)
    AND kitchen_status IS DISTINCT FROM 'cancelled';

  -- Mark orders as cancelled
  UPDATE orders
  SET status = 'cancelled', kitchen_status = 'cancelled', version = COALESCE(version, 0) + 1
  WHERE id = ANY(v_order_ids);

  -- Release table
  UPDATE table_floors
  SET
    status = 'empty',
    guest_count = NULL,
    reservation_id = NULL,
    reservation_name = NULL,
    reservation_phone = NULL,
    reservation_time = NULL,
    merged_into_table = NULL
  WHERE table_number = p_table_number;

  -- Audit
  INSERT INTO audit_log (table_name, record_id, action, old_data, new_data, performed_by, created_at)
  VALUES (
    'orders',
    v_order_ids[1],
    'cancel',
    jsonb_build_object('table_number', p_table_number, 'order_ids', v_order_ids),
    jsonb_build_object('status', 'cancelled', 'reversed_items', v_reversed_count),
    p_performed_by,
    now()
  );

  RETURN jsonb_build_object(
    'success', true,
    'cancelled_orders', array_length(v_order_ids, 1),
    'reversed_items', v_reversed_count
  );
END;
$function$;

CREATE FUNCTION public.cancel_table_orders (
  p_table_number integer
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  AS $function$
DECLARE
  v_order RECORD;
  v_item RECORD;
  v_count int := 0;
  v_reversed int := 0;
  v_now timestamptz := now();
  v_result jsonb;
BEGIN
  FOR v_order IN
    SELECT id, table_number
    FROM orders
    WHERE table_number = p_table_number
      AND status NOT IN ('paid', 'cancelled')
    FOR UPDATE
  LOOP
    UPDATE orders
    SET status = 'cancelled',
        cancelled_at = v_now,
        updated_at = v_now
    WHERE id = v_order.id;

    -- Reverse stock deductions if any
    FOR v_item IN
      SELECT oi.quantity, r.ingredient_id, r.quantity AS recipe_qty
      FROM order_items oi
      JOIN recipe_items r ON r.product_id = oi.product_id
      WHERE oi.order_id = v_order.id
    LOOP
      INSERT INTO inventory_logs (ingredient_id, quantity, type, unit_cost, reference_type, reference_id, created_at)
      VALUES (
        v_item.ingredient_id,
        v_item.recipe_qty * v_item.quantity,
        'stock_in'::inventory_log_type,
        0,
        'order',
        v_order.id,
        v_now
      );
      v_reversed := v_reversed + 1;
    END LOOP;

    v_count := v_count + 1;
  END LOOP;

  -- Reset table floors
  UPDATE table_floors
  SET status = 'empty',
      total_amount = 0,
      guest_count = NULL,
      order_count = 0
  WHERE table_number = p_table_number;

  INSERT INTO audit_log (table_name, record_id, action, old_data, new_data, changed_by)
  VALUES ('orders', p_table_number::text, 'cancel',
    '{}'::jsonb,
    jsonb_build_object('status', 'cancelled', 'reversed_items', v_reversed),
    'system');

  INSERT INTO notifications (title, message, type, created_at)
  VALUES ('Sifariş ləğv edildi', 'Masa ' || p_table_number || ' — ləğv edildi', 'order_cancelled', v_now);

  SELECT jsonb_build_object('success', true, 'cancelled_orders', v_count, 'reversed_items', v_reversed)
  INTO v_result;
  RETURN v_result;
END;
$function$;

GRANT ALL ON FUNCTION public.cancel_table_orders(integer, uuid) TO anon;

GRANT ALL ON FUNCTION public.cancel_table_orders(integer, uuid) TO authenticated;

GRANT ALL ON FUNCTION public.cancel_table_orders(integer, uuid) TO service_role;

GRANT ALL ON FUNCTION public.cancel_table_orders(integer) TO anon;

GRANT ALL ON FUNCTION public.cancel_table_orders(integer) TO authenticated;

GRANT ALL ON FUNCTION public.cancel_table_orders(integer) TO service_role;