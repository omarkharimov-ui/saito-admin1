CREATE FUNCTION public.seat_guests_atomic (
  p_reservation_id uuid,
  p_performed_by   uuid DEFAULT NULL::uuid
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
  v_result JSONB;
BEGIN
  SELECT * INTO v_reservation FROM public.reservations
    WHERE id = p_reservation_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Reservation not found');
  END IF;

  IF v_reservation.status NOT IN ('pending', 'confirmed') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Reservation is not in pending/confirmed status');
  END IF;

  v_scheduled_for := COALESCE(v_reservation.kitchen_scheduled_for,
    (v_reservation.date::TIMESTAMP + v_reservation.time::TIME) - INTERVAL '1 minute' * COALESCE(v_reservation.kitchen_prep_time_minutes, 20));

  FOR v_table IN
    SELECT t.table_number, t.id AS table_id
    FROM public.reservation_tables rt
    JOIN public.table_floors t ON t.table_number = rt.table_number
    WHERE rt.reservation_id = p_reservation_id
      AND t.status = ANY (ARRAY['reserved'::text, 'waiting'::text])
    ORDER BY t.table_number
  LOOP
    INSERT INTO public.orders (
      table_number, status, total_amount, guest_count,
      order_source, reservation_id, created_at, updated_at,
      created_by, is_draft, kitchen_status, kitchen_scheduled_for
    ) VALUES (
      v_table.table_number, 'confirmed', 0, v_reservation.guests,
      'dine_in', p_reservation_id, v_now, v_now,
      p_performed_by, false, 'pending', v_scheduled_for
    ) RETURNING id INTO v_order_id;

    FOR v_item IN
      SELECT * FROM public.reservation_preorder_items
      WHERE reservation_id = p_reservation_id
    LOOP
      INSERT INTO public.order_items (
        order_id, product_id, combo_id, product_name, quantity,
        unit_price, total_price, modifiers, special_notes,
        course, kitchen_status, created_at
      ) VALUES (
        v_order_id, v_item.product_id, v_item.combo_id, v_item.product_name, v_item.quantity,
        v_item.unit_price, (v_item.quantity * v_item.unit_price), v_item.modifiers, v_item.special_notes,
        v_item.course, 'reserved', v_now
      );
    END LOOP;

    UPDATE public.orders SET
      total_amount = COALESCE((
        SELECT SUM(total_price) FROM public.order_items WHERE order_id = v_order_id
      ), 0)
    WHERE id = v_order_id;

    UPDATE public.table_floors SET
      status = 'occupied',
      current_order_id = v_order_id,
      guest_count = v_reservation.guests,
      last_activity_at = v_now,
      opened_at = COALESCE(opened_at, v_now),
      order_count = order_count + 1,
      updated_at = v_now
    WHERE id = v_table.table_id;

    v_order_ids := array_append(v_order_ids, v_order_id);
  END LOOP;

  IF array_length(v_order_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No tables found for reservation');
  END IF;

  UPDATE public.reservations SET
    status = 'seated',
    checked_in_at = v_now,
    updated_at = v_now
  WHERE id = p_reservation_id;

  INSERT INTO public.operation_logs (
    table_number, order_id, action, old_values, new_values, performed_by
  ) VALUES (
    v_table.table_number,
    v_order_ids[1],
    'seat_guests',
    jsonb_build_object('status', v_reservation.status),
    jsonb_build_object('status', 'seated', 'order_ids', v_order_ids),
    p_performed_by
  );

  v_result := jsonb_build_object(
    'success', true,
    'order_ids', v_order_ids,
    'seated_at', v_now
  );
  RETURN v_result;
END;
$function$;

GRANT ALL ON FUNCTION public.seat_guests_atomic(uuid, uuid) TO anon;

GRANT ALL ON FUNCTION public.seat_guests_atomic(uuid, uuid) TO authenticated;

GRANT ALL ON FUNCTION public.seat_guests_atomic(uuid, uuid) TO service_role;