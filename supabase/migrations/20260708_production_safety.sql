-- ============================================================
-- PRODUCTION SAFETY: Atomic order creation + prevent duplicates
-- ============================================================

-- 1. Prevent duplicate active orders per table
-- If two concurrent requests try to create an order for the same table,
-- the second one gets a unique violation instead of creating a duplicate.
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_unique_active_per_table
  ON orders (table_number)
  WHERE status NOT IN ('paid', 'cancelled', 'closed');

-- 2. Atomic order creation/append RPC
-- Replaces the non-atomic read-create-append pattern in orders/route.ts
CREATE OR REPLACE FUNCTION create_or_append_order(
  p_table_number INTEGER,
  p_items JSONB,
  p_status TEXT DEFAULT 'confirmed',
  p_guest_count INTEGER DEFAULT 1,
  p_customer_note TEXT DEFAULT NULL,
  p_order_type TEXT DEFAULT 'dine_in',
  p_reservation_id UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order_id UUID;
  v_total_amount NUMERIC := 0;
  v_item JSONB;
  v_item_total NUMERIC;
  v_new_order BOOLEAN := false;
  v_current_reservation_id UUID := NULL;
BEGIN
  -- Lock table floor row
  PERFORM 1 FROM table_floors WHERE table_number = p_table_number FOR UPDATE;

  -- Find existing active order (FOR UPDATE to prevent concurrent modification)
  SELECT id INTO v_order_id
  FROM orders
  WHERE table_number = p_table_number
    AND status NOT IN ('paid', 'cancelled', 'closed')
  FOR UPDATE
  LIMIT 1;

  IF v_order_id IS NULL THEN
    -- No active order: create one
    INSERT INTO orders (table_number, status, guest_count, customer_note, order_type, reservation_id, total_amount)
    VALUES (p_table_number, p_status, p_guest_count, p_customer_note, p_order_type, p_reservation_id, 0)
    RETURNING id INTO v_order_id;
    v_new_order := true;
  END IF;

  -- Capture reservation if we need to handle it
  SELECT reservation_id INTO v_current_reservation_id
  FROM table_floors
  WHERE table_number = p_table_number;

  -- Append items
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_item_total := COALESCE((v_item->>'unit_price')::NUMERIC, 0) * COALESCE((v_item->>'quantity')::INTEGER, 1);
    v_total_amount := v_total_amount + v_item_total;

    INSERT INTO order_items (
      order_id, product_id, product_name, quantity, unit_price, total_price,
      modifiers, special_notes, kitchen_status, variant_id
    ) VALUES (
      v_order_id,
      (v_item->>'product_id')::UUID,
      v_item->>'product_name',
      COALESCE((v_item->>'quantity')::INTEGER, 1),
      COALESCE((v_item->>'unit_price')::NUMERIC, 0),
      v_item_total,
      COALESCE(v_item->'modifiers', '[]'::jsonb),
      COALESCE(v_item->>'special_notes', ''),
      'pending',
      NULLIF(v_item->>'variant_id', '')
    );
  END LOOP;

  -- Update order total
  UPDATE orders SET
    total_amount = total_amount + v_total_amount,
    updated_at = now()
  WHERE id = v_order_id;

  -- Update table floor
  UPDATE table_floors SET
    status = 'occupied',
    last_activity_at = now(),
    guest_count = p_guest_count
  WHERE table_number = p_table_number;

  -- If this was a new order and table had a reservation, clear reservation tie
  IF v_new_order AND v_current_reservation_id IS NOT NULL THEN
    UPDATE table_floors SET
      reservation_id = NULL,
      reservation_name = NULL,
      reservation_phone = NULL,
      reservation_time = NULL
    WHERE table_number = p_table_number;

    UPDATE orders SET reservation_id = v_current_reservation_id WHERE id = v_order_id;

    UPDATE reservations SET
      status = 'checked_in',
      checked_in_at = now()
    WHERE id = v_current_reservation_id;
  END IF;

  -- Return final order summary
  RETURN jsonb_build_object(
    'success', true,
    'order_id', v_order_id,
    'is_new', v_new_order,
    'total_amount', (SELECT total_amount FROM orders WHERE id = v_order_id),
    'reservation_id', v_current_reservation_id
  );
END;
$$;

-- 3. Atomic table activation RPC
-- Replaces the non-atomic multi-step flow in tables/activate/route.ts
CREATE OR REPLACE FUNCTION activate_table_atomic(
  p_table_id UUID,
  p_guest_count INTEGER DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_table table_floors%ROWTYPE;
  v_reservation reservations%ROWTYPE;
  v_order_id UUID;
  v_pre_items JSONB;
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

  -- Create order
  INSERT INTO orders (table_number, reservation_id, status, order_type, guest_count, total_amount, customer_note)
  VALUES (
    v_table.table_number,
    v_reservation.id,
    'confirmed',
    'dine_in',
    COALESCE(p_guest_count, v_reservation.guests, v_table.guest_count, 1),
    COALESCE(v_reservation.pre_order_total, 0),
    COALESCE(v_reservation.note, 'Rezervasiya')
  )
  RETURNING id INTO v_order_id;

  -- Transfer pre-order items
  v_pre_items := COALESCE(v_reservation.pre_order_items, '[]'::jsonb);

  INSERT INTO order_items (order_id, product_id, product_name, quantity, unit_price, total_price, modifiers, special_notes, kitchen_status)
  SELECT
    v_order_id,
    (item->>'product_id')::UUID,
    item->>'product_name',
    COALESCE((item->>'quantity')::INTEGER, 1),
    COALESCE((item->>'unit_price')::NUMERIC, 0),
    COALESCE((item->>'unit_price')::NUMERIC, 0) * COALESCE((item->>'quantity')::INTEGER, 1),
    COALESCE(item->'modifiers', '[]'::jsonb),
    COALESCE(item->>'special_notes', ''),
    'reserved'
  FROM jsonb_array_elements(v_pre_items) AS item;

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
$$;
