CREATE FUNCTION public.reserve_table_atomic (
  p_reservation_id  uuid,
  p_table_ids       uuid[],
  p_guest_count     integer DEFAULT NULL::integer,
  p_pre_order_items jsonb   DEFAULT '[]'::jsonb,
  p_user_id         uuid    DEFAULT NULL::uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
DECLARE
  v_reservation RECORD;
  v_table RECORD;
  v_table_number INTEGER;
  v_order_id UUID;
  v_customer_id UUID;
  v_total_amount NUMERIC;
  v_item JSONB;
  v_draft_order_ids UUID[] := '{}'::UUID[];
  v_now TIMESTAMPTZ := now();
BEGIN
  -- Lock reservation row
  SELECT * INTO v_reservation FROM reservations WHERE id = p_reservation_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Reservation not found');
  END IF;

  IF v_reservation.status NOT IN ('pending') THEN
    RETURN jsonb_build_object('success', false, 'error', format('Cannot reserve: reservation is %s', v_reservation.status));
  END IF;

  -- Lock all target table_floors rows in order to prevent deadlocks
  FOR i IN 1 .. array_length(p_table_ids, 1) LOOP
    SELECT * INTO v_table FROM table_floors WHERE id = p_table_ids[i] FOR UPDATE;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'error', format('Table %s not found', p_table_ids[i]));
    END IF;
    IF v_table.status NOT IN ('empty', 'reserved') THEN
      RETURN jsonb_build_object('success', false, 'error', format('Table %s is not available (status: %s)', v_table.table_number, v_table.status));
    END IF;
  END LOOP;

  -- Check time-based conflicts with OTHER confirmed reservations on same tables
  IF v_reservation.date IS NOT NULL AND v_reservation.time IS NOT NULL THEN
    DECLARE
      v_requested_ts TIMESTAMPTZ := (v_reservation.date || 'T' || v_reservation.time)::TIMESTAMPTZ;
      v_conflict RECORD;
    BEGIN
      SELECT r.id, r.name, r.time INTO v_conflict
      FROM reservations r
      WHERE r.id <> p_reservation_id
        AND r.status IN ('confirmed', 'pending')
        AND r.date = v_reservation.date
        AND r.table_ids && p_table_ids
        AND EXISTS (
          SELECT 1 FROM generate_series(0, 1) gs(h)
          WHERE abs(
            extract(epoch FROM ((r.date || 'T' || r.time)::TIMESTAMPTZ))
            - extract(epoch FROM v_requested_ts)
          ) < 7200  -- 2 hour buffer
        )
      LIMIT 1;
      IF FOUND THEN
        RETURN jsonb_build_object(
          'success', false,
          'error', format('Masa artiq %s terefinden saat %s-da rezerv edilib.', v_conflict.name, v_conflict.time)
        );
      END IF;
    END;
  END IF;

  -- Auto-link customer
  v_customer_id := v_reservation.customer_id;
  IF v_customer_id IS NULL AND v_reservation.phone IS NOT NULL THEN
    SELECT id INTO v_customer_id FROM customers WHERE phone = v_reservation.phone LIMIT 1;
    IF v_customer_id IS NULL THEN
      INSERT INTO customers (name, phone, total_visits, total_spent, created_at)
      VALUES (COALESCE(v_reservation.name, v_reservation.phone), v_reservation.phone, 0, 0, v_now)
      RETURNING id INTO v_customer_id;
    END IF;
  END IF;

  -- Calculate pre-order total
  SELECT COALESCE(SUM((item->>'unit_price')::NUMERIC * (item->>'quantity')::NUMERIC), 0)
  INTO v_total_amount
  FROM jsonb_array_elements(p_pre_order_items) AS item;

  -- Create draft orders for each table
  FOR i IN 1 .. array_length(p_table_ids, 1) LOOP
    SELECT table_number INTO v_table_number FROM table_floors WHERE id = p_table_ids[i];

    INSERT INTO orders (
      table_number, reservation_id, status, kitchen_status, is_draft,
      guest_count, total_amount, customer_id, customer_name, customer_note,
      order_source, created_at, updated_at, version, created_by
    ) VALUES (
      v_table_number, p_reservation_id, 'confirmed', 'pending', true,
      COALESCE(p_guest_count, v_reservation.guests, 2),
      v_total_amount, v_customer_id, COALESCE(v_reservation.name, v_reservation.customer_name),
      v_reservation.note, 'dine_in', v_now, v_now, 1, p_user_id
    )
    RETURNING id INTO v_order_id;

    v_draft_order_ids := array_append(v_draft_order_ids, v_order_id);

    -- Insert pre-order items
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_pre_order_items) LOOP
      INSERT INTO order_items (
        order_id, product_id, product_name, variant_id, quantity,
        unit_price, total_price, modifiers, special_notes,
        kitchen_status, seat_number, price_snapshot, created_at
      ) VALUES (
        v_order_id,
        (v_item->>'product_id')::UUID,
        v_item->>'product_name',
        v_item->>'variant_id',
        (v_item->>'quantity')::INTEGER,
        (v_item->>'unit_price')::NUMERIC,
        ((v_item->>'unit_price')::NUMERIC) * ((v_item->>'quantity')::INTEGER),
        COALESCE(v_item->'modifiers', '[]'::JSONB),
        v_item->>'special_notes',
        'pending',
        (v_item->>'seat_number')::INTEGER,
        jsonb_build_object(
          'unit_price', (v_item->>'unit_price')::NUMERIC,
          'discount_price', GREATEST(0, COALESCE((v_item->>'original_unit_price')::NUMERIC, 0) - COALESCE((v_item->>'unit_price')::NUMERIC, 0)),
          'campaign_id', v_item->>'campaign_id',
          'campaign_discount', COALESCE((v_item->>'campaign_discount_amount')::NUMERIC, 0),
          'total_price', ((v_item->>'unit_price')::NUMERIC) * ((v_item->>'quantity')::INTEGER),
          'snapshot_at', v_now::TEXT
        ),
        v_now
      );
    END LOOP;

    -- Update table_floors
    UPDATE table_floors SET
      status = 'reserved',
      reservation_id = p_reservation_id,
      reservation_name = COALESCE(v_reservation.name, v_reservation.customer_name),
      reservation_phone = v_reservation.phone,
      reservation_time = v_reservation.time,
      guest_count = COALESCE(p_guest_count, v_reservation.guests, 2),
      updated_at = v_now
    WHERE id = p_table_ids[i];
  END LOOP;

  -- Update reservation
  UPDATE reservations SET
    status = 'confirmed',
    table_ids = p_table_ids,
    table_number = (SELECT table_number FROM table_floors WHERE id = p_table_ids[1]),
    pre_order_items = '[]'::JSONB,
    pre_order_total = 0,
    customer_id = COALESCE(v_customer_id, customer_id),
    updated_at = v_now
  WHERE id = p_reservation_id;

  -- Audit log
  INSERT INTO audit_logs (table_name, record_id, action, old_data, new_data, performed_by, created_at)
  VALUES (
    'reservations', p_reservation_id,
    'reserve_table_atomic',
    jsonb_build_object('status', v_reservation.status),
    jsonb_build_object(
      'status', 'confirmed',
      'table_ids', p_table_ids,
      'table_count', array_length(p_table_ids, 1)
    ),
    p_user_id, v_now
  );

  RETURN jsonb_build_object(
    'success', true,
    'reservation_id', p_reservation_id,
    'draft_order_ids', v_draft_order_ids,
    'table_ids', p_table_ids
  );
END;
$function$;

GRANT ALL ON FUNCTION public.reserve_table_atomic(uuid, uuid[], integer, jsonb, uuid) TO anon;

GRANT ALL ON FUNCTION public.reserve_table_atomic(uuid, uuid[], integer, jsonb, uuid) TO authenticated;

GRANT ALL ON FUNCTION public.reserve_table_atomic(uuid, uuid[], integer, jsonb, uuid) TO service_role;