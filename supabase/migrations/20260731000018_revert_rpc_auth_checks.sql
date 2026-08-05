-- Revert auth checks in SECURITY DEFINER RPCs
-- RPCs are called server-side with service_role, so auth.uid() checks break them.
-- Authorization is enforced by API routes via requireAuth().

CREATE OR REPLACE FUNCTION public.cancel_table_orders (
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

  IF v_reversal_items IS NOT NULL AND jsonb_array_length(v_reversal_items) > 0 THEN
    SELECT COALESCE(SUM((x.value->>'reverse_qty')::INTEGER), 0)
    INTO v_reversed_count
    FROM jsonb_array_elements(v_reversal_items) AS x;

    PERFORM reverse_stock_deduction_for_items(v_reversal_items::TEXT);
  END IF;

  UPDATE order_items
  SET kitchen_status = 'cancelled'
  WHERE order_id = ANY(v_order_ids)
    AND kitchen_status IS DISTINCT FROM 'cancelled';

  UPDATE orders
  SET status = 'cancelled', kitchen_status = 'cancelled', version = COALESCE(version, 0) + 1
  WHERE id = ANY(v_order_ids);

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

CREATE OR REPLACE FUNCTION public.confirm_and_checkin_atomic (
  p_reservation_id uuid,
  p_table_ids      integer[] DEFAULT '{}'::integer[],
  p_user_id        uuid      DEFAULT NULL::uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  AS $function$
DECLARE
  v_reservation RECORD;
  v_table RECORD;
  v_order_id UUID;
  v_order_ids UUID[] := '{}';
  v_item RECORD;
  v_now TIMESTAMPTZ := now();
  v_scheduled_for TIMESTAMPTZ;
  v_target_table_numbers INT[];
BEGIN
  SELECT * INTO v_reservation FROM public.reservations
    WHERE id = p_reservation_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Reservation not found');
  END IF;

  IF v_reservation.status != 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Reservation is not pending');
  END IF;

  IF p_table_ids IS NULL OR array_length(p_table_ids, 1) IS NULL OR array_length(p_table_ids, 1) = 0 THEN
    SELECT array_agg(rt.table_number) INTO v_target_table_numbers
    FROM public.reservation_tables rt
    WHERE rt.reservation_id = p_reservation_id;
  ELSE
    v_target_table_numbers := p_table_ids;
  END IF;

  IF v_target_table_numbers IS NULL OR array_length(v_target_table_numbers, 1) IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No tables assigned to reservation');
  END IF;

  UPDATE public.reservations SET
    status = 'confirmed',
    checked_in_at = v_now,
    updated_at = v_now
  WHERE id = p_reservation_id;

  FOR v_table IN
    SELECT t.table_number, t.id AS table_id
    FROM public.table_floors t
    WHERE t.table_number = ANY(v_target_table_numbers)
      AND t.status = ANY (ARRAY['reserved'::text, 'waiting'::text])
    ORDER BY t.table_number
  LOOP
    INSERT INTO public.orders (
      table_number, status, guest_count, reservation_id, customer_id, customer_name,
      customer_phone, kitchen_status, is_draft, created_at, updated_at, version
    ) VALUES (
      v_table.table_number, 'confirmed', v_reservation.guests, v_reservation.id,
      v_reservation.customer_id, v_reservation.name, v_reservation.phone,
      'pending', false, v_now, v_now, 1
    ) RETURNING id INTO v_order_id;

    INSERT INTO public.order_items (
      order_id, product_id, combo_id, product_name, quantity,
      unit_price, total_price, modifiers, special_notes,
      course, kitchen_status, price_snapshot, created_at
    )
    SELECT
      v_order_id, rpi.product_id, rpi.combo_id, rpi.product_name, rpi.quantity,
      rpi.unit_price, (rpi.quantity * rpi.unit_price), rpi.modifiers, rpi.special_notes,
      rpi.course, 'pending',
      jsonb_build_object('unit_price', rpi.unit_price, 'quantity', rpi.quantity, 'total_price', rpi.unit_price * rpi.quantity, 'snapshot_at', v_now),
      v_now
    FROM public.reservation_preorder_items rpi
    WHERE rpi.reservation_id = p_reservation_id;

    UPDATE public.orders SET
      total_amount = COALESCE((
        SELECT SUM(total_price) FROM public.order_items WHERE order_id = v_order_id
      ), 0)
    WHERE id = v_order_id;

    UPDATE public.table_floors SET
      status = 'occupied',
      current_order_id = v_order_id,
      reservation_id = NULL,
      reservation_name = NULL,
      reservation_phone = NULL,
      reservation_time = NULL,
      guest_count = v_reservation.guests,
      updated_at = v_now
    WHERE table_number = v_table.table_number;

    v_order_ids := array_append(v_order_ids, v_order_id);
  END LOOP;

  INSERT INTO public.operation_logs (
    reservation_id, action, old_values, new_values, performed_by
  ) VALUES (
    p_reservation_id, 'confirm_and_checkin',
    jsonb_build_object('status', 'pending'),
    jsonb_build_object('status', 'confirmed', 'order_ids', v_order_ids),
    p_user_id
  );

  RETURN jsonb_build_object('success', true, 'order_ids', v_order_ids);
END;
$function$;

CREATE OR REPLACE FUNCTION public.dismiss_undo_atomic (
  p_table_number integer,
  p_performed_by uuid DEFAULT NULL::uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
DECLARE
  v_cancelled_orders RECORD;
  v_order_ids UUID[];
  v_item RECORD;
  v_restored_count INTEGER := 0;
BEGIN
  FOR v_cancelled_orders IN
    SELECT id, table_number, status, total_amount, guest_count, reservation_id,
           customer_name, customer_phone, kitchen_status, created_at, version
    FROM orders
    WHERE table_number = p_table_number
      AND status = 'cancelled'
      AND updated_at >= now() - interval '1 hour'
    ORDER BY updated_at DESC
    FOR UPDATE
  LOOP
    v_order_ids := array_append(v_order_ids, v_cancelled_orders.id);
  END LOOP;

  IF array_length(v_order_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No recent cancelled orders found to undo');
  END IF;

  UPDATE orders
  SET status = CASE WHEN kitchen_status = 'cancelled' THEN 'new' ELSE 'confirmed' END,
      kitchen_status = CASE WHEN kitchen_status = 'cancelled' THEN 'pending' ELSE kitchen_status END,
      cancelled_at = NULL,
      updated_at = now(),
      version = COALESCE(version, 0) + 1
  WHERE id = ANY(v_order_ids);

  UPDATE order_items
  SET kitchen_status = 'pending'
  WHERE order_id = ANY(v_order_ids)
    AND kitchen_status = 'cancelled';

  UPDATE table_floors
  SET
    status = 'occupied',
    guest_count = COALESCE((SELECT guest_count FROM orders WHERE id = v_order_ids[1]), 1),
    reservation_id = (SELECT reservation_id FROM orders WHERE id = v_order_ids[1]),
    reservation_name = (SELECT customer_name FROM orders WHERE id = v_order_ids[1]),
    reservation_phone = (SELECT customer_phone FROM orders WHERE id = v_order_ids[1]),
    current_order_id = v_order_ids[1],
    updated_at = now()
  WHERE table_number = p_table_number;

  FOR v_item IN
    SELECT oi.id, oi.product_id, oi.quantity, r.ingredient_id, r.quantity AS recipe_qty
    FROM order_items oi
    JOIN recipe_items r ON r.product_id = oi.product_id
    WHERE oi.order_id = ANY(v_order_ids)
  LOOP
    INSERT INTO inventory_logs (ingredient_id, quantity, type, unit_cost, reference_type, reference_id, created_at)
    VALUES (
      v_item.ingredient_id,
      v_item.recipe_qty * v_item.quantity,
      'stock_out'::inventory_log_type,
      0,
      'order',
      v_item.id,
      now()
    );
    v_restored_count := v_restored_count + 1;
  END LOOP;

  INSERT INTO audit_log (table_name, record_id, action, old_data, new_data, performed_by, created_at)
  VALUES (
    'orders',
    v_order_ids[1],
    'dismiss_undo',
    jsonb_build_object('table_number', p_table_number, 'order_ids', v_order_ids, 'status', 'cancelled'),
    jsonb_build_object('status', 'restored', 'restored_items', v_restored_count),
    p_performed_by,
    now()
  );

  RETURN jsonb_build_object(
    'success', true,
    'restored_orders', array_length(v_order_ids, 1),
    'restored_items', v_restored_count
  );
END;
$function$;
