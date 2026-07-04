-- ============================================================================
-- Fix 14: Production sweep — atomic order creation, dismiss stock reversal,
--          v_closed_orders merge, kitchen schedule cleanup
-- ============================================================================

-- ─── 1. Merge v_closed_orders view (fix_10 and fix_13 definitions combined) ───
DROP VIEW IF EXISTS v_closed_orders;
CREATE VIEW v_closed_orders AS
SELECT
  o.id AS order_id,
  o.table_number,
  o.total_amount,
  o.paid_amount,
  o.payment_method,
  o.discount_type,
  o.discount_value,
  o.cogs,
  o.profit,
  COALESCE(o.paid_amount, 0) - COALESCE(o.cogs, 0) AS gross_profit,
  CASE WHEN COALESCE(o.paid_amount, 0) > 0
    THEN ROUND(((COALESCE(o.paid_amount, 0) - COALESCE(o.cogs, 0)) / COALESCE(o.paid_amount, 0)) * 100, 1)
    ELSE 0 END AS profit_margin_pct,
  o.tip_amount,
  o.guest_count,
  o.created_at AS order_created_at,
  o.paid_at,
  o.updated_at,
  o.reservation_id,
  jsonb_array_length(o.items) AS item_count
FROM orders o
WHERE o.status = 'paid';

-- ─── 2. Create atomic order+items RPC ───
CREATE OR REPLACE FUNCTION create_order_with_items(
  p_table_number INTEGER,
  p_items JSONB,
  p_total_amount NUMERIC DEFAULT NULL,
  p_status TEXT DEFAULT 'confirmed',
  p_guest_count INTEGER DEFAULT 1,
  p_customer_note TEXT DEFAULT NULL,
  p_order_type TEXT DEFAULT 'dine_in'
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_id UUID;
  v_item JSONB;
  v_calculated_total NUMERIC := 0;
  v_existing_order RECORD;
  v_floor RECORD;
  v_result JSONB;
BEGIN
  -- Check for existing active order on this table
  SELECT * INTO v_existing_order FROM orders
  WHERE table_number = p_table_number
    AND status NOT IN ('paid', 'cancelled')
  ORDER BY created_at ASC
  LIMIT 1;

  -- Calculate total
  v_calculated_total := COALESCE(p_total_amount, 0);
  IF v_calculated_total = 0 THEN
    SELECT COALESCE(SUM((v_item->>'unit_price')::NUMERIC * (v_item->>'quantity')::INTEGER), 0)
    INTO v_calculated_total
    FROM jsonb_array_elements(p_items) AS v_item;
  END IF;

  IF v_existing_order.id IS NOT NULL THEN
    -- Append to existing order
    v_order_id := v_existing_order.id;

    UPDATE orders SET
      total_amount = COALESCE(total_amount, 0) + v_calculated_total,
      guest_count = GREATEST(COALESCE(guest_count, 0), COALESCE(p_guest_count, 0)),
      version = COALESCE(version, 0) + 1,
      updated_at = now()
    WHERE id = v_order_id;

    -- Update table activity
    UPDATE table_floors SET
      status = 'occupied',
      last_activity_at = now()
    WHERE table_number = p_table_number;
  ELSE
    -- Create new order
    INSERT INTO orders (
      table_number, total_amount, status, guest_count,
      customer_note, order_type, created_at, updated_at
    ) VALUES (
      p_table_number, v_calculated_total, p_status, p_guest_count,
      p_customer_note, p_order_type, now(), now()
    )
    RETURNING id INTO v_order_id;

    -- Mark table as occupied
    SELECT * INTO v_floor FROM table_floors WHERE table_number = p_table_number;
    IF v_floor.id IS NOT NULL THEN
      UPDATE table_floors SET
        status = 'occupied',
        last_activity_at = now()
      WHERE table_number = p_table_number;

      -- If table had reservation, link it and mark checked_in
      IF v_floor.reservation_id IS NOT NULL THEN
        UPDATE orders SET reservation_id = v_floor.reservation_id WHERE id = v_order_id;

        UPDATE reservations SET
          status = 'checked_in',
          checked_in_at = now()
        WHERE id = v_floor.reservation_id
          AND status NOT IN ('completed', 'cancelled', 'no_show');

        UPDATE table_floors SET
          reservation_id = NULL,
          reservation_name = NULL,
          reservation_phone = NULL,
          reservation_time = NULL
        WHERE table_number = p_table_number;
      END IF;
    END IF;
  END IF;

  -- Insert items
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    INSERT INTO order_items (
      order_id, product_id, product_name, quantity,
      unit_price, total_price, modifiers, special_notes,
      created_at
    ) VALUES (
      v_order_id,
      (v_item->>'product_id')::UUID,
      v_item->>'product_name',
      (v_item->>'quantity')::INTEGER,
      (v_item->>'unit_price')::NUMERIC,
      COALESCE((v_item->>'total_price')::NUMERIC, (v_item->>'unit_price')::NUMERIC * (v_item->>'quantity')::INTEGER),
      COALESCE(v_item->>'modifiers', '[]'),
      v_item->>'special_notes',
      now()
    );
  END LOOP;

  -- Return the complete order
  SELECT jsonb_build_object(
    'id', o.id,
    'table_number', o.table_number,
    'total_amount', o.total_amount,
    'status', o.status,
    'guest_count', o.guest_count,
    'customer_note', o.customer_note,
    'order_type', o.order_type,
    'created_at', o.created_at,
    'updated_at', o.updated_at,
    'reservation_id', o.reservation_id,
    'version', o.version
  ) INTO v_result
  FROM orders o WHERE o.id = v_order_id;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION create_order_with_items(INTEGER, JSONB, NUMERIC, TEXT, INTEGER, TEXT, TEXT) TO authenticated;

-- ─── 3. Update dismiss_table_session — add reverse_stock_deduction + kitchen_schedule cleanup ───
CREATE OR REPLACE FUNCTION dismiss_table_session(p_table_number INTEGER)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order RECORD;
  v_reservation_id UUID;
  v_reversed INTEGER := 0;
  v_notification_id UUID;
BEGIN
  -- Step 1: Reverse stock for all unpaid orders on this table
  FOR v_order IN SELECT id FROM orders WHERE table_number = p_table_number AND status NOT IN ('paid', 'cancelled') LOOP
    -- Reverse stock deduction if any was done
    PERFORM reverse_stock_deduction(v_order.id);
    v_reversed := v_reversed + 1;
  END LOOP;

  -- Step 2: Cancel all unpaid orders
  UPDATE orders SET
    status = 'cancelled',
    cancelled_at = now(),
    kitchen_status = 'cancelled',
    version = COALESCE(version, 0) + 1
  WHERE table_number = p_table_number
    AND status NOT IN ('paid', 'cancelled');

  -- Step 3: For draft orders, clean up order_items
  DELETE FROM order_items
  WHERE order_id IN (SELECT id FROM orders WHERE table_number = p_table_number AND is_draft = true)
    AND kitchen_status IS DISTINCT FROM 'cancelled';

  -- Step 4: Unlink merged child tables
  UPDATE table_floors
  SET merged_into_table = NULL
  WHERE merged_into_table = p_table_number::TEXT
     OR merged_into_table = p_table_number::INTEGER;

  -- Step 5: Cancel associated reservation
  SELECT reservation_id INTO v_reservation_id
  FROM table_floors WHERE table_number = p_table_number;

  IF v_reservation_id IS NOT NULL THEN
    -- Preserve pre_order data before cancelling
    UPDATE reservations SET
      status = 'cancelled',
      cancelled_at = now(),
      cancelled_reason = 'dismissed_table_session'
    WHERE id = v_reservation_id
      AND status NOT IN ('completed', 'cancelled', 'no_show');
  END IF;

  -- Step 6: Cancel kitchen schedules for this table
  UPDATE kitchen_schedule
  SET status = 'cancelled'
  WHERE table_number = p_table_number
    AND status = 'pending';

  -- Step 7: Reset table to empty
  UPDATE table_floors
  SET
    status = 'empty',
    reservation_id = NULL,
    reservation_name = NULL,
    reservation_phone = NULL,
    reservation_time = NULL,
    guest_count = NULL,
    total_amount = NULL,
    order_count = NULL,
    order_ids = NULL,
    has_pending = NULL,
    oldest_pending_at = NULL,
    last_activity_at = now(),
    updated_at = now()
  WHERE table_number = p_table_number;

  -- Step 8: Audit log
  INSERT INTO audit_log (table_name, record_id, action, old_data, new_data, performed_by, created_at)
  VALUES (
    'table_floors',
    p_table_number::TEXT,
    'dismiss',
    jsonb_build_object('table_number', p_table_number),
    jsonb_build_object('action', 'dismissed', 'orders_cancelled', v_reversed, 'table_number', p_table_number),
    NULL,
    now()
  );

  -- Step 9: Notification
  INSERT INTO notifications (type, title, body, data, created_at)
  VALUES (
    'order',
    'Masa boşaldıldı',
    'Masa ' || p_table_number || ' — ləğv edildi (' || v_reversed || ' sifariş)',
    jsonb_build_object('table_number', p_table_number, 'cancelled_orders', v_reversed),
    now()
  );

  RETURN jsonb_build_object(
    'success', true,
    'table_number', p_table_number,
    'orders_cancelled', v_reversed
  );
END;
$$;

-- ─── 4. Update mark-ready endpoint — use an RPC for atomic ready + stock deduction ───
CREATE OR REPLACE FUNCTION mark_order_ready(p_order_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order RECORD;
  v_deducted INTEGER := 0;
  v_log RECORD;
BEGIN
  SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'ORDER_NOT_FOUND');
  END IF;

  -- Mark order and items as ready
  UPDATE order_items
  SET kitchen_status = 'ready'
  WHERE order_id = p_order_id
    AND kitchen_status IN ('pending', 'preparing', 'cooking', 'accepted');

  UPDATE orders SET
    kitchen_status = 'ready',
    kitchen_ready_at = now(),
    version = COALESCE(version, 0) + 1
  WHERE id = p_order_id;

  -- Deduct stock if not already deducted (idempotent)
  IF NOT EXISTS (
    SELECT 1 FROM inventory_logs
    WHERE reference_type = 'order' AND reference_id = p_order_id
    LIMIT 1
  ) THEN
    -- Recipe-based products
    INSERT INTO inventory_logs (ingredient_id, type, quantity, unit_cost, reference_type, reference_id, order_id, notes, created_at)
    SELECT
      r.ingredient_id, 'order_consumption',
      (r.quantity_required * oi.quantity),
      COALESCE(i.average_cost_per_unit, 0),
      'order', p_order_id, p_order_id,
      'Ready: Order ' || p_order_id::TEXT, now()
    FROM order_items oi
    JOIN products p ON p.id = oi.product_id
    JOIN recipes r ON r.menu_item_id = p.id
    JOIN ingredients i ON i.id = r.ingredient_id
    WHERE oi.order_id = p_order_id
      AND (oi.kitchen_status IS DISTINCT FROM 'cancelled')
      AND (p.is_ready_product IS NOT TRUE);

    GET DIAGNOSTICS v_deducted = ROW_COUNT;

    -- Ready products (direct ingredient)
    INSERT INTO inventory_logs (ingredient_id, type, quantity, unit_cost, reference_type, reference_id, order_id, notes, created_at)
    SELECT
      p.direct_ingredient_id, 'order_consumption',
      oi.quantity, COALESCE(i.average_cost_per_unit, 0),
      'order', p_order_id, p_order_id,
      'Ready: Order ' || p_order_id::TEXT, now()
    FROM order_items oi
    JOIN products p ON p.id = oi.product_id
    LEFT JOIN ingredients i ON i.id = p.direct_ingredient_id
    WHERE oi.order_id = p_order_id
      AND (oi.kitchen_status IS DISTINCT FROM 'cancelled')
      AND p.is_ready_product = TRUE
      AND p.direct_ingredient_id IS NOT NULL;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'order_id', p_order_id,
    'status', 'ready',
    'deducted_ingredients', v_deducted
  );
END;
$$;

GRANT EXECUTE ON FUNCTION mark_order_ready(UUID) TO authenticated;
