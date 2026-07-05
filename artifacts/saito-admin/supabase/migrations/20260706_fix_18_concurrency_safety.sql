-- ════════════════════════════════════════════════════════════════════
-- FIX 18 — Concurrency Safety & Data Integrity
-- ════════════════════════════════════════════════════════════════════
-- 1. process_order_payment: add p_tip_amount
-- 2. Unique partial index on orders(table_number) for active statuses
-- 3. cancel_table_orders RPC (FOR UPDATE atomic cancel)
-- 4. merge_orders_atomic RPC (FOR UPDATE atomic merge)
-- 5. transfer_orders_atomic RPC (FOR UPDATE atomic transfer)
-- 6. split_order_atomic RPC (FOR UPDATE atomic bill-split)
-- ════════════════════════════════════════════════════════════════════

-- ─── 1. process_order_payment: add p_tip_amount ───
CREATE OR REPLACE FUNCTION process_order_payment(
  p_order_id UUID,
  p_payment_method TEXT,
  p_paid_amount NUMERIC,
  p_tip_amount NUMERIC DEFAULT 0,
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
  v_prev_paid NUMERIC;
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
  v_prev_paid := COALESCE(v_order.paid_amount, 0);

  -- Step 2: Mark order as paid (add to existing paid_amount for split payments)
  UPDATE orders SET
    paid_amount = v_prev_paid + p_paid_amount,
    tip_amount = COALESCE(tip_amount, 0) + COALESCE(p_tip_amount, 0),
    payment_method = CASE WHEN v_prev_paid > 0 THEN 'split' ELSE p_payment_method END,
    status = CASE WHEN v_prev_paid + p_paid_amount >= COALESCE(v_order.total_amount, 0)
                  THEN 'paid' ELSE 'confirmed' END,
    paid_at = CASE WHEN v_prev_paid + p_paid_amount >= COALESCE(v_order.total_amount, 0)
                   THEN now() ELSE NULL END,
    version = COALESCE(version, 0) + 1
  WHERE id = p_order_id;

  -- Step 2.5a: Insert payment record into ledger
  INSERT INTO order_payments (order_id, amount, payment_method, performed_by, created_at)
  VALUES (p_order_id, p_paid_amount, p_payment_method, p_performed_by, now());

  -- Step 2.5b: Insert tip as a separate tip-type payment in ledger
  IF COALESCE(p_tip_amount, 0) > 0 THEN
    INSERT INTO order_payments (order_id, amount, payment_method, performed_by, created_at)
    VALUES (p_order_id, p_tip_amount, 'tip', p_performed_by, now());
  END IF;

  -- If fully paid, mark child orders and do finalization
  IF v_prev_paid + p_paid_amount >= COALESCE(v_order.total_amount, 0) THEN
    -- Mark child orders (merged into this one) as paid
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
        'tip', COALESCE(p_tip_amount, 0),
        'total_paid', v_prev_paid + p_paid_amount,
        'discount_amount', p_discount_amount,
        'discount_type', p_discount_type,
        'cogs', v_total_deductions,
        'profit', (v_prev_paid + p_paid_amount) - v_total_deductions
      ),
      p_performed_by,
      now()
    );

    -- Step 12: Notification
    INSERT INTO notifications (type, title, body, data, created_at)
    VALUES (
      'payment',
      'Ödəniş qəbul edildi',
      CASE
        WHEN v_table_number IS NOT NULL THEN 'Masa ' || v_table_number || ' — ' || (v_prev_paid + p_paid_amount) || ' AZN'
        ELSE (v_prev_paid + p_paid_amount) || ' AZN ödəniş qəbul edildi'
      END,
      jsonb_build_object(
        'order_id', p_order_id,
        'table_number', v_table_number,
        'paid_amount', v_prev_paid + p_paid_amount,
        'payment_method', p_payment_method,
        'cogs', v_total_deductions
      ),
      now()
    )
    RETURNING id INTO v_notification_id;

    -- Step 13: Update order with financial metadata
    UPDATE orders SET
      cogs = v_total_deductions,
      profit = GREATEST(0, (v_prev_paid + p_paid_amount) - v_total_deductions),
      kitchen_status = 'completed'
    WHERE id = p_order_id;
  END IF;

  -- Return result
  RETURN jsonb_build_object(
    'success', true,
    'order_id', p_order_id,
    'table_number', v_table_number,
    'paid_amount', p_paid_amount,
    'tip_amount', COALESCE(p_tip_amount, 0),
    'total_paid', v_prev_paid + p_paid_amount,
    'fully_paid', v_prev_paid + p_paid_amount >= COALESCE(v_order.total_amount, 0),
    'cogs', v_total_deductions,
    'profit', GREATEST(0, (v_prev_paid + p_paid_amount) - v_total_deductions),
    'notification_id', v_notification_id
  );
END;
$$;

-- ─── 2. Prevent duplicate active orders per table ───
-- Only active (non-paid, non-cancelled, non-closed) orders matter
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_active_table
ON orders(table_number)
WHERE status NOT IN ('paid', 'cancelled', 'closed');

-- ─── 3. cancel_table_orders RPC (FOR UPDATE + stock reversal, atomic) ───
CREATE OR REPLACE FUNCTION cancel_table_orders(
  p_table_number INTEGER,
  p_performed_by UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

-- ─── 4. merge_orders_atomic RPC (FOR UPDATE, atomic) ───
-- Core order merge: lock + update orders.
-- table_floor + reservation updates handled in TypeScript (less critical).
CREATE OR REPLACE FUNCTION merge_orders_atomic(
  p_source_order_ids UUID[],
  p_target_order_id UUID,
  p_extra_amount NUMERIC DEFAULT 0,
  p_extra_guests INTEGER DEFAULT 0
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target RECORD;
  v_source RECORD;
  v_merged_count INTEGER := 0;
  v_all_ids UUID[];
BEGIN
  v_all_ids := array_append(p_source_order_ids, p_target_order_id);

  -- Lock target order
  SELECT * INTO v_target FROM orders WHERE id = p_target_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TARGET_ORDER_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;
  IF v_target.status IN ('paid', 'cancelled', 'closed') THEN
    RAISE EXCEPTION 'TARGET_ORDER_CLOSED' USING ERRCODE = 'P0001';
  END IF;

  -- Lock and validate all source orders
  FOR v_source IN
    SELECT * FROM orders WHERE id = ANY(p_source_order_ids) FOR UPDATE
  LOOP
    IF v_source.status IN ('paid', 'cancelled', 'closed') THEN
      RAISE EXCEPTION 'SOURCE_ORDER_CLOSED' USING ERRCODE = 'P0001';
    END IF;
    IF v_source.merged_into IS NOT NULL THEN
      RAISE EXCEPTION 'SOURCE_ALREADY_MERGED' USING ERRCODE = 'P0001';
    END IF;

    -- Mark source as merged
    UPDATE orders
    SET merged_into = p_target_order_id, version = COALESCE(version, 0) + 1
    WHERE id = v_source.id;

    v_merged_count := v_merged_count + 1;
  END LOOP;

  -- Update target order totals
  UPDATE orders
  SET
    total_amount = COALESCE(v_target.total_amount, 0) + COALESCE(p_extra_amount, 0),
    guest_count = COALESCE(v_target.guest_count, 1) + COALESCE(p_extra_guests, 0),
    version = COALESCE(v_target.version, 0) + 1
  WHERE id = p_target_order_id;

  RETURN jsonb_build_object(
    'success', true,
    'target_order_id', p_target_order_id,
    'extra_amount', p_extra_amount,
    'extra_guests', p_extra_guests,
    'new_total', COALESCE(v_target.total_amount, 0) + COALESCE(p_extra_amount, 0),
    'merged_count', v_merged_count
  );
END;
$$;

-- ─── 5. transfer_orders_atomic RPC (FOR UPDATE, atomic) ───
CREATE OR REPLACE FUNCTION transfer_orders_atomic(
  p_from_table INTEGER,
  p_to_table INTEGER,
  p_performed_by UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target_floor RECORD;
  v_orders RECORD;
  v_order_ids UUID[];
  v_moved_count INTEGER := 0;
BEGIN
  -- Lock target table floor (prevent race on "is it empty?")
  SELECT * INTO v_target_floor
  FROM table_floors
  WHERE table_number = p_to_table
  FOR UPDATE;

  IF v_target_floor.status = 'reserved' THEN
    RAISE EXCEPTION 'TARGET_TABLE_RESERVED' USING ERRCODE = 'P0001';
  END IF;
  IF v_target_floor.status = 'occupied' THEN
    RAISE EXCEPTION 'TARGET_TABLE_OCCUPIED' USING ERRCODE = 'P0001';
  END IF;

  -- Lock all source orders
  FOR v_orders IN
    SELECT id, guest_count FROM orders
    WHERE table_number = p_from_table AND status NOT IN ('paid', 'cancelled', 'closed')
    FOR UPDATE
  LOOP
    v_order_ids := array_append(v_order_ids, v_orders.id);
  END LOOP;

  IF array_length(v_order_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'NO_ACTIVE_ORDERS' USING ERRCODE = 'P0001';
  END IF;

  -- Move orders to new table
  UPDATE orders
  SET table_number = p_to_table, version = COALESCE(version, 0) + 1, updated_at = now()
  WHERE id = ANY(v_order_ids);

  v_moved_count := array_length(v_order_ids, 1);

  -- Clear source table floor
  UPDATE table_floors
  SET
    status = 'empty',
    reservation_id = NULL,
    reservation_name = NULL,
    reservation_phone = NULL,
    reservation_time = NULL,
    guest_count = NULL,
    merged_into_table = NULL
  WHERE table_number = p_from_table;

  -- Transfer reservation data to target table floor
  UPDATE table_floors
  SET
    status = 'occupied',
    guest_count = (SELECT COALESCE(SUM(guest_count), 0) FROM orders WHERE id = ANY(v_order_ids))
  WHERE table_number = p_to_table;

  -- Audit
  INSERT INTO audit_log (table_name, record_id, action, old_data, new_data, performed_by, created_at)
  VALUES (
    'orders',
    v_order_ids[1],
    'transfer',
    jsonb_build_object('from', p_from_table, 'to', p_to_table),
    jsonb_build_object('order_ids', v_order_ids, 'moved_count', v_moved_count),
    p_performed_by,
    now()
  );

  RETURN jsonb_build_object(
    'success', true,
    'from_table', p_from_table,
    'to_table', p_to_table,
    'moved_count', v_moved_count,
    'order_ids', v_order_ids
  );
END;
$$;

-- ─── 6. split_order_atomic RPC (FOR UPDATE, atomic) ───
CREATE OR REPLACE FUNCTION split_order_atomic(
  p_original_order_id UUID,
  p_split_items JSONB,  -- [{id, product_id, product_name, quantity, unit_price, total_price, modifiers, special_notes, combo_group_id, variant_id}]
  p_split_total NUMERIC,
  p_new_guest_count INTEGER DEFAULT 1,
  p_performed_by UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_original RECORD;
  v_new_order_id UUID;
  v_item RECORD;
BEGIN
  -- Lock original order
  SELECT * INTO v_original FROM orders WHERE id = p_original_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;
  IF v_original.status = 'paid' THEN
    RAISE EXCEPTION 'ORDER_ALREADY_PAID' USING ERRCODE = 'P0001';
  END IF;

  -- Create new split order
  INSERT INTO orders (
    table_number, total_amount, guest_count, status, kitchen_status,
    merged_into, is_split, version, created_at
  ) VALUES (
    v_original.table_number, p_split_total, p_new_guest_count,
    'confirmed', 'pending',
    p_original_order_id, true, 1, now()
  )
  RETURNING id INTO v_new_order_id;

  -- Move items from original to split order
  FOR v_item IN SELECT * FROM jsonb_to_recordset(p_split_items) AS x(
    id UUID, product_id UUID, product_name TEXT, quantity INTEGER,
    unit_price NUMERIC, total_price NUMERIC, modifiers TEXT,
    special_notes TEXT, combo_group_id UUID, variant_id UUID
  )
  LOOP
    -- Insert into new order
    INSERT INTO order_items (
      order_id, product_id, product_name, quantity, unit_price,
      total_price, modifiers, special_notes, combo_group_id, variant_id,
      kitchen_status
    ) VALUES (
      v_new_order_id, v_item.product_id, v_item.product_name,
      v_item.quantity, v_item.unit_price, v_item.total_price,
      v_item.modifiers, v_item.special_notes, v_item.combo_group_id,
      v_item.variant_id, 'ready'
    );

    -- Reduce or delete from original order
    UPDATE order_items
    SET quantity = quantity - v_item.quantity,
        total_price = GREATEST(0, total_price - v_item.total_price)
    WHERE id = v_item.id AND quantity > v_item.quantity;

    DELETE FROM order_items
    WHERE id = v_item.id AND quantity <= v_item.quantity;
  END LOOP;

  -- Update original order total
  UPDATE orders
  SET total_amount = GREATEST(0, COALESCE(v_original.total_amount, 0) - p_split_total),
      version = COALESCE(v_original.version, 0) + 1
  WHERE id = p_original_order_id;

  RETURN jsonb_build_object(
    'success', true,
    'original_order_id', p_original_order_id,
    'new_order_id', v_new_order_id,
    'new_total', GREATEST(0, COALESCE(v_original.total_amount, 0) - p_split_total)
  );
END;
$$;

-- ─── 7. reverse_stock_deduction_for_items: return reversed_count ───
CREATE OR REPLACE FUNCTION reverse_stock_deduction_for_items(p_items TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item JSONB;
  v_reverse_qty NUMERIC;
  v_log RECORD;
  v_total_reversed INTEGER := 0;
  v_order_item_id UUID;
  v_proportion NUMERIC;
BEGIN
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items::JSONB)
  LOOP
    v_order_item_id := (v_item->>'order_item_id')::UUID;
    v_reverse_qty := (v_item->>'reverse_qty')::NUMERIC;

    -- For each inventory_log entry matching this order_item_id,
    -- reverse proportionally: per-unit consumption = ABS(quantity) / item_quantity
    FOR v_log IN
      SELECT id, ingredient_id, quantity, unit_cost, item_quantity
      FROM inventory_logs
      WHERE order_item_id = v_order_item_id
        AND item_quantity > 0
      FOR UPDATE
    LOOP
      v_proportion := v_reverse_qty / v_log.item_quantity;
      -- Restore stock: ABS(v_log.quantity) * v_proportion → add back
      UPDATE ingredients
      SET current_stock = COALESCE(current_stock, 0) + (ABS(v_log.quantity) * v_proportion)
      WHERE id = v_log.ingredient_id;

      -- Update inventory_log to show partial reversal
      UPDATE inventory_logs
      SET quantity = quantity + (ABS(v_log.quantity) * v_proportion * -1)
      WHERE id = v_log.id;

      v_total_reversed := v_total_reversed + 1;
    END LOOP;
  END LOOP;

  RETURN v_total_reversed;
END;
$$;

-- ════════════════════════════════════════════════════════════════════
-- Register migration
-- ════════════════════════════════════════════════════════════════════
INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
SELECT
  '20260706180000' AS version,
  'fix_18_concurrency_safety' AS name,
  '{See migration file}' AS statements
WHERE NOT EXISTS (
  SELECT 1 FROM supabase_migrations.schema_migrations
  WHERE version = '20260706180000'
);
