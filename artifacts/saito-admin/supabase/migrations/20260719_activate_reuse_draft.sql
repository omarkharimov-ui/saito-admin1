-- ============================================================
-- activate_table_atomic: reuse the reservation's existing draft
-- order instead of always creating a new one (prevents the
-- duplicate-active-order unique violation on activation).
-- Also carries customer_id through from the reservation.
-- ============================================================

CREATE OR REPLACE FUNCTION public.activate_table_atomic(
  p_table_id uuid,
  p_guest_count integer DEFAULT NULL::integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_table table_floors%ROWTYPE;
  v_reservation reservations%ROWTYPE;
  v_order_id UUID;
  v_pre_items JSONB;
  v_item JSONB;
  v_seen TEXT;
BEGIN
  -- Lock table
  SELECT * INTO v_table FROM table_floors WHERE id = p_table_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TABLE_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  -- Find active reservation for this table
  SELECT * INTO v_reservation FROM reservations
  WHERE date = CURRENT_DATE
    AND status IN ('confirmed', 'pending')
    AND (table_number = v_table.table_number OR table_ids @> to_jsonb(ARRAY[p_table_id::text]))
  ORDER BY created_at ASC
  LIMIT 1 FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TABLE_NOT_RESERVED' USING ERRCODE = 'P0001';
  END IF;

  IF v_reservation.status = 'checked_in' OR v_reservation.status = 'completed' THEN
    RAISE EXCEPTION 'RESERVATION_ALREADY_ACTIVATED' USING ERRCODE = 'P0001';
  END IF;

  -- Reuse an existing draft order for this reservation if one exists
  -- (created by reserve-table), otherwise create a fresh one.
  SELECT id INTO v_order_id FROM orders
  WHERE reservation_id = v_reservation.id
    AND is_draft = true
    AND status <> 'cancelled'
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_order_id IS NULL THEN
    INSERT INTO orders (
      table_number, reservation_id, customer_id, status, order_type,
      guest_count, total_amount, customer_note
    )
    VALUES (
      v_table.table_number,
      v_reservation.id,
      v_reservation.customer_id,
      'confirmed',
      'dine_in',
      COALESCE(p_guest_count, v_reservation.guests, v_table.guest_count, 1),
      COALESCE(v_reservation.pre_order_total, 0),
      COALESCE(v_reservation.note, 'Rezervasiya')
    )
    RETURNING id INTO v_order_id;
  ELSE
    -- Promote the existing draft to an active order.
    UPDATE orders SET
      is_draft = false,
      status = 'confirmed',
      kitchen_status = 'pending',
      customer_id = COALESCE(customer_id, v_reservation.customer_id),
      guest_count = COALESCE(p_guest_count, v_reservation.guests, guest_count, 1),
      total_amount = COALESCE(v_reservation.pre_order_total, total_amount, 0),
      customer_note = COALESCE(customer_note, v_reservation.note, 'Rezervasiya'),
      updated_at = now()
    WHERE id = v_order_id;
  END IF;

  -- Transfer pre-order items (dedup by product_id__quantity)
  v_pre_items := COALESCE(v_reservation.pre_order_items, '[]'::jsonb);
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_pre_items)
  LOOP
    v_seen := (v_item->>'product_id') || '__' || COALESCE((v_item->>'quantity')::INTEGER, 1);
    IF NOT EXISTS (
      SELECT 1 FROM order_items
      WHERE order_id = v_order_id
        AND product_id = (v_item->>'product_id')::UUID
        AND quantity = COALESCE((v_item->>'quantity')::INTEGER, 1)
    ) THEN
      INSERT INTO order_items (
        order_id, product_id, product_name, quantity, unit_price,
        total_price, modifiers, special_notes, kitchen_status
      )
      VALUES (
        v_order_id,
        (v_item->>'product_id')::UUID,
        v_item->>'product_name',
        COALESCE((v_item->>'quantity')::INTEGER, 1),
        COALESCE((v_item->>'unit_price')::NUMERIC, 0),
        COALESCE((v_item->>'unit_price')::NUMERIC, 0) * COALESCE((v_item->>'quantity')::INTEGER, 1),
        COALESCE(v_item->'modifiers', '[]'::jsonb),
        COALESCE(v_item->>'special_notes', ''),
        'reserved'
      );
    END IF;
  END LOOP;

  -- Update reservation
  UPDATE reservations SET
    status = 'checked_in',
    checked_in_at = now()
  WHERE id = v_reservation.id;

  -- Update table
  UPDATE table_floors SET
    status = 'occupied',
    reservation_id = NULL,
    reservation_name = NULL,
    reservation_phone = NULL,
    reservation_time = NULL,
    guest_count = COALESCE(p_guest_count, v_reservation.guests, v_table.guest_count)
  WHERE id = p_table_id;

  RETURN jsonb_build_object(
    'success', true,
    'table', (SELECT row_to_json(tf) FROM table_floors tf WHERE tf.id = p_table_id),
    'order', jsonb_build_object('id', v_order_id),
    'items', (
      SELECT jsonb_agg(row_to_json(oi))
      FROM order_items oi
      WHERE oi.order_id = v_order_id
    )
  );
END;
$function$;
