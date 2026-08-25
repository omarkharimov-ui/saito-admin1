-- ============================================================================
-- Fix 16: Item-level stock tracking + proportional reversal
-- ============================================================================
-- The old system tracked stock deduction at the ORDER level (order_id),
-- making it impossible to reverse stock for individual items. This fix:
--   1. Adds order_item_id + item_quantity to inventory_logs
--   2. Updates all deduction RPCs to populate these columns
--   3. Creates item-level reverse RPC (proportional per-unit reversal)
--   4. Updates dismiss_table_session to use item-level logic
-- ============================================================================

-- ─── 1. Add order_item_id + item_quantity columns ───
ALTER TABLE inventory_logs ADD COLUMN IF NOT EXISTS order_item_id UUID REFERENCES order_items(id) ON DELETE SET NULL;
ALTER TABLE inventory_logs ADD COLUMN IF NOT EXISTS item_quantity NUMERIC DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_inventory_logs_order_item ON inventory_logs(order_item_id);

-- ─── 2. Update mark_order_ready — add order_item_id + item_quantity to INSERTs ───
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
    INSERT INTO inventory_logs (
      ingredient_id, type, quantity, unit_cost,
      reference_type, reference_id, order_id, order_item_id, item_quantity,
      notes, created_at
    )
    SELECT
      r.ingredient_id, 'order_consumption',
      (r.quantity_required * oi.quantity),
      COALESCE(i.average_cost_per_unit, 0),
      'order', p_order_id, p_order_id, oi.id, oi.quantity,
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
    INSERT INTO inventory_logs (
      ingredient_id, type, quantity, unit_cost,
      reference_type, reference_id, order_id, order_item_id, item_quantity,
      notes, created_at
    )
    SELECT
      p.direct_ingredient_id, 'order_consumption',
      oi.quantity, COALESCE(i.average_cost_per_unit, 0),
      'order', p_order_id, p_order_id, oi.id, oi.quantity,
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

-- ─── 3. Update process_order_payment — add order_item_id + item_quantity to INSERTs ───
DROP FUNCTION IF EXISTS process_order_payment(UUID, TEXT, NUMERIC, NUMERIC, NUMERIC, NUMERIC, UUID, NUMERIC, TEXT, UUID);

CREATE OR REPLACE FUNCTION process_order_payment(
  p_order_id UUID,
  p_payment_method TEXT,
  p_paid_amount NUMERIC,
  p_campaign_id UUID DEFAULT NULL,
  p_discount_amount NUMERIC DEFAULT 0,
  p_discount_type TEXT DEFAULT NULL,
  p_performed_by UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order RECORD;
  v_reservation_id UUID;
  v_table_number INTEGER;
  v_total_deductions NUMERIC := 0;
  v_notification_id UUID;
BEGIN
  -- Step 1: Lock and validate order
  SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;
  IF v_order.status = 'paid' THEN
    RAISE EXCEPTION 'ORDER_ALREADY_PAID' USING ERRCODE = 'P0001';
  END IF;

  v_reservation_id := v_order.reservation_id;
  v_table_number := v_order.table_number;

  -- Step 2: Mark order as paid
  UPDATE orders SET
    status = 'paid',
    payment_method = p_payment_method,
    paid_amount = p_paid_amount,
    paid_at = now(),
    version = COALESCE(version, 0) + 1
  WHERE id = p_order_id;

  -- Step 2.5: Mark child orders (merged into this one) as paid
  UPDATE orders SET
    status = 'paid',
    paid_at = now(),
    version = COALESCE(version, 0) + 1
  WHERE merged_into = p_order_id
    AND status != 'paid';

  -- Step 3: Inventory deduction (idempotent — skip if already deducted)
  IF NOT EXISTS (SELECT 1 FROM inventory_logs WHERE reference_type = 'order' AND reference_id = p_order_id LIMIT 1) THEN
    INSERT INTO inventory_logs (
      ingredient_id, type, quantity, unit_cost,
      reference_type, reference_id, order_id, order_item_id, item_quantity,
      notes, created_at
    )
    -- Recipe-based products
    SELECT
      r.ingredient_id,
      'order_consumption',
      (r.quantity_required * oi.quantity),
      COALESCE(i.average_cost_per_unit, 0),
      'order',
      p_order_id,
      p_order_id,
      oi.id,
      oi.quantity,
      'Auto: Order ' || COALESCE(v_table_number::TEXT, '?'),
      now()
    FROM order_items oi
    JOIN products p ON p.id = oi.product_id
    JOIN recipes r ON r.menu_item_id = p.id
    JOIN ingredients i ON i.id = r.ingredient_id
    WHERE oi.order_id = p_order_id
      AND (oi.kitchen_status IS DISTINCT FROM 'cancelled')
      AND (p.is_ready_product IS NOT TRUE)
    UNION ALL
    -- Ready products (direct ingredient, no recipe)
    SELECT
      p.direct_ingredient_id,
      'order_consumption',
      oi.quantity,
      COALESCE(i.average_cost_per_unit, 0),
      'order',
      p_order_id,
      p_order_id,
      oi.id,
      oi.quantity,
      'Auto: Order ' || COALESCE(v_table_number::TEXT, '?'),
      now()
    FROM order_items oi
    JOIN products p ON p.id = oi.product_id
    LEFT JOIN ingredients i ON i.id = p.direct_ingredient_id
    WHERE oi.order_id = p_order_id
      AND (oi.kitchen_status IS DISTINCT FROM 'cancelled')
      AND p.is_ready_product = TRUE
      AND p.direct_ingredient_id IS NOT NULL;
  END IF;

  -- Step 4: Calculate total cost of goods sold (COGS)
  SELECT COALESCE(SUM(il.quantity * COALESCE(il.unit_cost, 0)), 0)
  INTO v_total_deductions
  FROM inventory_logs il
  WHERE il.reference_type = 'order' AND il.reference_id = p_order_id;

  -- Step 5: Campaign usage tracking
  IF p_campaign_id IS NOT NULL THEN
    INSERT INTO campaign_usage (campaign_id, order_id, discount_amount, discount_type, created_at)
    VALUES (p_campaign_id, p_order_id, p_discount_amount, p_discount_type, now());

    UPDATE campaigns
    SET current_uses = COALESCE(current_uses, 0) + 1
    WHERE id = p_campaign_id;
  END IF;

  -- Step 6: Reservation completion
  IF v_reservation_id IS NOT NULL THEN
    UPDATE reservations
    SET status = 'completed', completed_at = now()
    WHERE id = v_reservation_id
      AND status NOT IN ('completed', 'cancelled', 'no_show');
  END IF;

  -- Step 7: Kitchen items completion
  UPDATE order_items
  SET kitchen_status = 'completed'
  WHERE order_id = p_order_id
    AND kitchen_status IN ('pending', 'preparing', 'ready', 'accepted');

  UPDATE orders
  SET kitchen_status = 'completed'
  WHERE id = p_order_id;

  -- Step 8: Cancel pending kitchen schedule for this order
  UPDATE kitchen_schedule
  SET status = 'cancelled'
  WHERE reservation_id = v_reservation_id AND status = 'pending';

  -- Step 9: Release the table
  UPDATE table_floors
  SET
    status = 'empty',
    reservation_id = NULL,
    reservation_name = NULL,
    reservation_phone = NULL,
    reservation_time = NULL,
    guest_count = NULL
  WHERE table_number = v_table_number;

  -- Step 10: Free any merged child tables
  UPDATE table_floors
  SET
    status = 'empty',
    merged_into_table = NULL,
    guest_count = NULL
  WHERE merged_into_table = v_table_number;

  -- Step 11: Audit log
  INSERT INTO audit_log (table_name, record_id, action, old_data, new_data, performed_by, created_at)
  VALUES (
    'orders',
    p_order_id,
    'payment',
    jsonb_build_object('status', v_order.status, 'total', v_order.total_amount),
    jsonb_build_object(
      'status', 'paid',
      'method', p_payment_method,
      'amount', p_paid_amount,
      'discount_amount', p_discount_amount,
      'discount_type', p_discount_type,
      'cogs', v_total_deductions,
      'profit', COALESCE(p_paid_amount, 0) - v_total_deductions
    ),
    p_performed_by,
    now()
  );

  -- Step 12: Create persistent notification
  INSERT INTO notifications (type, title, body, data, created_at)
  VALUES (
    'payment',
    'Ödəniş qəbul edildi',
    CASE
      WHEN v_table_number IS NOT NULL THEN 'Masa ' || v_table_number || ' — ' || p_paid_amount || ' AZN'
      ELSE p_paid_amount || ' AZN ödəniş qəbul edildi'
    END,
    jsonb_build_object(
      'order_id', p_order_id,
      'table_number', v_table_number,
      'paid_amount', p_paid_amount,
      'payment_method', p_payment_method,
      'cogs', v_total_deductions
    ),
    now()
  )
  RETURNING id INTO v_notification_id;

  -- Step 13: Update the order with financial metadata
  UPDATE orders SET
    cogs = v_total_deductions,
    profit = GREATEST(0, COALESCE(p_paid_amount, 0) - v_total_deductions)
  WHERE id = p_order_id;

  -- Return result
  RETURN jsonb_build_object(
    'success', true,
    'order_id', p_order_id,
    'table_number', v_table_number,
    'paid_amount', p_paid_amount,
    'cogs', v_total_deductions,
    'profit', GREATEST(0, COALESCE(p_paid_amount, 0) - v_total_deductions),
    'notification_id', v_notification_id
  );
END;
$$;

-- ─── 4. Create reverse_stock_deduction_for_items RPC ───
-- Item-level stock reversal: reverses stock proportionally for each
-- order_item_id based on per-unit consumption stored in inventory_logs.
--
-- Input: [{ order_item_id: UUID, reverse_qty: NUMERIC }]
--   reverse_qty = amount to reverse (e.g. 2 if item went from 5→3)
--
-- For each inventory_log entry matching order_item_id:
--   per_unit = ABS(log.quantity) / log.item_quantity
--   reverse_amount = per_unit * reverse_qty
--   current_stock += reverse_amount
--   new inventory_log 'adjustment' entry written for audit
CREATE OR REPLACE FUNCTION reverse_stock_deduction_for_items(p_items JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item RECORD;
  v_log RECORD;
  v_per_unit NUMERIC;
  v_reverse_amount NUMERIC;
  v_total INTEGER := 0;
BEGIN
  FOR v_item IN
    SELECT * FROM jsonb_to_recordset(p_items) AS x(order_item_id uuid, reverse_qty numeric)
  LOOP
    IF v_item.reverse_qty <= 0 THEN CONTINUE; END IF;

    FOR v_log IN
      SELECT il.id, il.ingredient_id, il.quantity, il.item_quantity, il.order_id
      FROM inventory_logs il
      WHERE il.order_item_id = v_item.order_item_id
        AND il.type = 'order_consumption'
        AND il.item_quantity IS NOT NULL
        AND il.item_quantity > 0
    LOOP
      -- per-unit ingredient consumption at time of deduction
      v_per_unit := ABS(v_log.quantity) / v_log.item_quantity;
      -- amount to reverse (proportional to reverse_qty)
      v_reverse_amount := v_per_unit * v_item.reverse_qty;

      -- Restore stock
      UPDATE ingredients
      SET current_stock = COALESCE(current_stock, 0) + v_reverse_amount
      WHERE id = v_log.ingredient_id;

      -- Record reversal audit trail
      INSERT INTO inventory_logs (
        ingredient_id, type, quantity, unit_cost,
        reference_type, reference_id, order_id, order_item_id, item_quantity,
        notes, created_at
      ) VALUES (
        v_log.ingredient_id,
        'adjustment',
        v_reverse_amount,
        NULL,
        'reversal',
        v_item.order_item_id::TEXT,
        v_log.order_id,
        v_item.order_item_id,
        v_item.reverse_qty,
        'Item reversal: order_item ' || v_item.order_item_id || ' qty -' || v_item.reverse_qty,
        now()
      );

      v_total := v_total + 1;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'reversed_entries', v_total
  );
END;
$$;

GRANT EXECUTE ON FUNCTION reverse_stock_deduction_for_items(JSONB) TO authenticated, anon;

-- ─── 5. Update dismiss_table_session — use item-level reverse ───
CREATE OR REPLACE FUNCTION dismiss_table_session(p_table_number INTEGER)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order RECORD;
  v_item RECORD;
  v_reversed INTEGER := 0;
  v_items_jsonb JSONB;
  v_reservation_id UUID;
  v_notification_id UUID;
BEGIN
  -- Step 1: Reverse stock for each item (item-level, not order-level)
  -- Build a JSONB array of all non-served items from unpaid orders
  SELECT jsonb_agg(
    jsonb_build_object(
      'order_item_id', oi.id,
      'reverse_qty', oi.quantity
    )
  ) INTO v_items_jsonb
  FROM order_items oi
  JOIN orders o ON o.id = oi.order_id
  WHERE o.table_number = p_table_number
    AND o.status NOT IN ('paid', 'cancelled')
    AND oi.kitchen_status IS DISTINCT FROM 'cancelled'
    AND (oi.served_quantity IS NULL OR oi.served_quantity = 0);

  IF v_items_jsonb IS NOT NULL AND jsonb_array_length(v_items_jsonb) > 0 THEN
    PERFORM reverse_stock_deduction_for_items(v_items_jsonb);
    v_reversed := jsonb_array_length(v_items_jsonb);
  END IF;

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
  WHERE merged_into_table = p_table_number;

  -- Step 5: Cancel associated reservation
  SELECT reservation_id INTO v_reservation_id
  FROM table_floors WHERE table_number = p_table_number;

  IF v_reservation_id IS NOT NULL THEN
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
    jsonb_build_object('action', 'dismissed', 'items_reversed', v_reversed, 'table_number', p_table_number),
    NULL,
    now()
  );

  -- Step 9: Notification
  INSERT INTO notifications (type, title, body, data, created_at)
  VALUES (
    'order',
    'Masa boşaldıldı',
    'Masa ' || p_table_number || ' — ləğv edildi (' || v_reversed || ' məhsul)',
    jsonb_build_object('table_number', p_table_number, 'items_reversed', v_reversed),
    now()
  );

  RETURN jsonb_build_object(
    'success', true,
    'table_number', p_table_number,
    'items_reversed', v_reversed
  );
END;
$$;
