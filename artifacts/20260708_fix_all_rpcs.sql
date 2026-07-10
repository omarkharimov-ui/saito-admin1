-- ============================================================
-- PHASE 5 PRODUCTION FIX: RPC Migration
-- Run this in Supabase Dashboard SQL editor
-- Fixes all RPC parameter mismatches, type casts, and bugs
-- ============================================================

-- ============================================================
-- 1. FIX: create_order_with_items
-- Bug 1: v_item alias conflicts with PL/pgSQL variable
-- Bug 2: modifiers text→jsonb cast missing
-- ============================================================
CREATE OR REPLACE FUNCTION create_order_with_items(
  p_table_number int,
  p_items jsonb,
  p_total_amount numeric DEFAULT NULL,
  p_status text DEFAULT 'confirmed',
  p_guest_count int DEFAULT 1,
  p_customer_note text DEFAULT NULL,
  p_order_type text DEFAULT 'dine_in'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order_id uuid;
  v_item_rec record;
  v_total numeric;
  v_table_id uuid;
  v_now timestamptz := now();
  v_result jsonb;
BEGIN
  SELECT id INTO v_table_id
  FROM table_floors
  WHERE table_number = p_table_number
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Table % not found', p_table_number;
  END IF;

  INSERT INTO orders (
    table_number, status, total_amount, guest_count,
    customer_note, order_type, created_at, updated_at
  ) VALUES (
    p_table_number, p_status,
    COALESCE(p_total_amount, 0), p_guest_count,
    p_customer_note, p_order_type, v_now, v_now
  )
  RETURNING id INTO v_order_id;

  FOR v_item_rec IN
    SELECT * FROM jsonb_to_recordset(p_items) AS x(
      product_id uuid,
      variant_id uuid,
      quantity int,
      unit_price numeric,
      total_price numeric,
      modifiers jsonb,
      special_notes text
    )
  LOOP
    INSERT INTO order_items (
      order_id, product_id, variant_id,
      quantity, unit_price, total_price,
      modifiers, special_notes, created_at
    ) VALUES (
      v_order_id, v_item_rec.product_id, v_item_rec.variant_id,
      v_item_rec.quantity, v_item_rec.unit_price, v_item_rec.total_price,
      COALESCE(v_item_rec.modifiers, '[]'::jsonb),
      v_item_rec.special_notes, v_now
    );
  END LOOP;

  SELECT COALESCE(SUM(total_price), 0)
  INTO v_total
  FROM order_items
  WHERE order_id = v_order_id;

  UPDATE orders
  SET total_amount = v_total,
      guest_count = p_guest_count,
      updated_at = v_now
  WHERE id = v_order_id;

  UPDATE table_floors
  SET status = 'occupied',
      total_amount = v_total,
      guest_count = p_guest_count,
      order_count = (SELECT COUNT(*) FROM orders
        WHERE table_number = p_table_number
        AND status NOT IN ('paid', 'cancelled'))
  WHERE table_number = p_table_number;

  INSERT INTO audit_log (table_name, record_id, action, old_data, new_data, changed_by)
  VALUES ('orders', v_order_id, 'created', '{}',
    jsonb_build_object('table_number', p_table_number, 'total_amount', v_total), 'system');

  INSERT INTO notifications (title, message, type, created_at)
  VALUES ('Yeni sifariş', 'Masa ' || p_table_number || ' — ' || v_total || ' AZN', 'new_order', v_now);

  SELECT jsonb_build_object(
    'id', v_order_id, 'table_number', p_table_number,
    'total_amount', v_total, 'status', p_status, 'guest_count', p_guest_count
  ) INTO v_result;

  RETURN v_result;
END;
$$;


-- ============================================================
-- 2. FIX: process_order_payment
-- Bug: inventory_log type is text but needs ::inventory_log_type cast
-- ============================================================
CREATE OR REPLACE FUNCTION process_order_payment(
  p_order_id uuid,
  p_payment_method text DEFAULT 'card',
  p_paid_amount numeric DEFAULT NULL,
  p_tip_amount numeric DEFAULT 0,
  p_campaign_id uuid DEFAULT NULL,
  p_discount_amount numeric DEFAULT 0,
  p_discount_type text DEFAULT NULL,
  p_performed_by uuid DEFAULT NULL,
  p_cash_amount numeric DEFAULT NULL,
  p_card_amount numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order RECORD;
  v_new_paid numeric;
  v_total_paid numeric;
  v_profit numeric;
  v_cogs numeric := 0;
  v_fully_paid boolean;
  v_result jsonb;
  v_now timestamptz := now();
  v_ingredient RECORD;
BEGIN
  SELECT * INTO v_order
  FROM orders WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order % not found', p_order_id;
  END IF;

  IF v_order.status = 'paid' THEN
    SELECT COALESCE(SUM(amount), 0) INTO v_total_paid
    FROM order_payments WHERE order_id = p_order_id AND reversed = false;
    RETURN jsonb_build_object(
      'success', false, 'duplicate', true,
      'message', 'Order already paid', 'total_paid', v_total_paid,
      'cogs', 0, 'profit', 0, 'fully_paid', true
    );
  END IF;

  v_new_paid := COALESCE(p_paid_amount, 0);
  v_total_paid := v_new_paid;
  v_total_paid := LEAST(v_total_paid, v_order.total_amount);

  IF v_new_paid > v_order.total_amount THEN
    RAISE EXCEPTION 'OVERPAYMENT: paid % exceeds total %', v_new_paid, v_order.total_amount;
  END IF;

  -- Deduct stock via inventory_logs with proper enum cast
  FOR v_ingredient IN
    SELECT oi.product_id, oi.quantity, r.ingredient_id, r.quantity AS ingred_qty,
           i.average_cost_per_unit, i.current_stock, i.unit
    FROM order_items oi
    JOIN recipe_items r ON r.product_id = oi.product_id
    JOIN ingredients i ON i.id = r.ingredient_id
    WHERE oi.order_id = p_order_id
  LOOP
    INSERT INTO inventory_logs (
      ingredient_id, quantity, type, unit_cost,
      reference_type, reference_id, created_at
    ) VALUES (
      v_ingredient.ingredient_id,
      -(v_ingredient.ingred_qty * v_ingredient.quantity),
      'order_consumption'::inventory_log_type,
      v_ingredient.average_cost_per_unit,
      'order',
      p_order_id,
      v_now
    );
    v_cogs := v_cogs + (v_ingredient.average_cost_per_unit * v_ingredient.ingred_qty * v_ingredient.quantity);
  END LOOP;

  v_profit := v_total_paid - v_cogs;

  -- Insert payment records
  IF p_cash_amount IS NOT NULL AND p_cash_amount > 0 THEN
    INSERT INTO order_payments (order_id, method, amount, created_at)
    VALUES (p_order_id, 'cash', p_cash_amount, v_now);
  END IF;

  IF p_card_amount IS NOT NULL AND p_card_amount > 0 THEN
    INSERT INTO order_payments (order_id, method, amount, created_at)
    VALUES (p_order_id, 'card', p_card_amount, v_now);
  END IF;

  IF p_cash_amount IS NULL AND p_card_amount IS NULL THEN
    INSERT INTO order_payments (order_id, method, amount, created_at)
    VALUES (p_order_id, p_payment_method, v_new_paid, v_now);
  END IF;

  -- Update order
  UPDATE orders
  SET status = 'paid',
      paid_amount = v_total_paid,
      payment_method = p_payment_method,
      tip_amount = COALESCE(p_tip_amount, 0),
      cash_amount = COALESCE(p_cash_amount, 0),
      card_amount = COALESCE(p_card_amount, 0),
      cogs = v_cogs,
      profit = v_profit,
      paid_at = v_now,
      inventory_deducted = true,
      discount_amount = COALESCE(p_discount_amount, 0),
      discount_type = p_discount_type,
      campaign_id = p_campaign_id,
      updated_at = v_now
  WHERE id = p_order_id;

  -- Free table
  UPDATE table_floors
  SET status = 'empty',
      total_amount = 0,
      guest_count = NULL,
      order_count = 0
  WHERE table_number = v_order.table_number;

  INSERT INTO audit_log (table_name, record_id, action, old_data, new_data, changed_by)
  VALUES ('orders', p_order_id, 'payment', jsonb_build_object('status', v_order.status),
    jsonb_build_object('status', 'paid', 'amount', v_total_paid, 'cogs', v_cogs, 'profit', v_profit,
      'method', p_payment_method, 'discount_type', p_discount_type, 'discount_amount', p_discount_amount,
      'tip', p_tip_amount, 'total_paid', v_total_paid), p_performed_by);

  INSERT INTO notifications (title, message, type, created_at)
  VALUES ('Ödəniş qəbul edildi',
    'Masa ' || v_order.table_number || ' — ' || v_total_paid || ' AZN (cogs: ' || v_cogs || ', profit: ' || v_profit || ')',
    'payment', v_now);

  SELECT jsonb_build_object(
    'success', true, 'cogs', v_cogs, 'profit', v_profit,
    'fully_paid', v_total_paid >= v_order.total_amount,
    'paid_amount', v_new_paid, 'total_paid', v_total_paid, 'duplicate', false
  ) INTO v_result;

  RETURN v_result;
END;
$$;


-- ============================================================
-- 3. FIX: saito_merge_tables
-- Bug: record_id text→uuid cast missing in audit_log insert
-- ============================================================
CREATE OR REPLACE FUNCTION saito_merge_tables(
  p_table_numbers int[],
  p_performed_by uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_primary_table int;
  v_child_tables int[] := '{}'::int[];
  v_primary_order_id uuid;
  v_child_order_id uuid;
  v_primary_total numeric;
  v_primary_guest_count int;
  v_undo_data jsonb;
  v_order RECORD;
  v_now timestamptz := now();
  v_result jsonb;
BEGIN
  IF array_length(p_table_numbers, 1) < 2 THEN
    RAISE EXCEPTION 'Need at least 2 tables';
  END IF;

  v_primary_table := p_table_numbers[1];

  FOR i IN 2 .. array_length(p_table_numbers, 1) LOOP
    SELECT id, total_amount, guest_count INTO v_primary_order_id, v_primary_total, v_primary_guest_count
    FROM orders
    WHERE table_number = v_primary_table AND status NOT IN ('paid', 'cancelled')
    LIMIT 1;

    IF NOT FOUND THEN
      INSERT INTO orders (table_number, status, total_amount, guest_count, order_type, created_at, updated_at)
      VALUES (v_primary_table, 'confirmed', 0, 0, 'dine_in', v_now, v_now)
      RETURNING id, total_amount, guest_count INTO v_primary_order_id, v_primary_total, v_primary_guest_count;
    END IF;

    SELECT id, total_amount, guest_count INTO v_child_order_id, v_primary_total, v_primary_guest_count
    FROM orders
    WHERE table_number = p_table_numbers[i] AND status NOT IN ('paid', 'cancelled')
    LIMIT 1;

    IF FOUND THEN
      v_undo_data := jsonb_build_object(
        'order_id', v_child_order_id,
        'table_number', p_table_numbers[i],
        'merged_into', v_primary_order_id
      );

      UPDATE orders
      SET merged_into = v_primary_order_id::text,
          table_number = v_primary_table,
          updated_at = v_now
      WHERE id = v_child_order_id;
    END IF;

    v_child_tables := v_child_tables || p_table_numbers[i];

    UPDATE table_floors
    SET status = 'occupied',
        total_amount = (SELECT COALESCE(SUM(total_amount), 0)
          FROM orders WHERE table_number = v_primary_table AND status NOT IN ('paid', 'cancelled')),
        guest_count = (SELECT COALESCE(SUM(guest_count), 0)
          FROM orders WHERE table_number = v_primary_table AND status NOT IN ('paid', 'cancelled'))
    WHERE table_number = p_table_numbers[i];

    UPDATE table_floors
    SET status = 'occupied',
        total_amount = (SELECT COALESCE(SUM(total_amount), 0)
          FROM orders WHERE table_number = v_primary_table AND status NOT IN ('paid', 'cancelled')),
        guest_count = (SELECT COALESCE(SUM(guest_count), 0)
          FROM orders WHERE table_number = v_primary_table AND status NOT IN ('paid', 'cancelled'))
    WHERE table_number = v_primary_table;
  END LOOP;

  INSERT INTO audit_log (table_name, record_id, action, old_data, new_data, changed_by)
  VALUES ('orders'::text, v_primary_order_id, 'merge'::text, '{}'::jsonb,
    jsonb_build_object('primary_table', v_primary_table, 'child_tables', v_child_tables),
    p_performed_by);

  SELECT jsonb_build_object(
    'primary_table', v_primary_table,
    'child_tables', v_child_tables,
    'undo', v_undo_data
  ) INTO v_result;

  RETURN v_result;
END;
$$;


-- ============================================================
-- 4. FIX: saito_transfer_table
-- ============================================================
CREATE OR REPLACE FUNCTION saito_transfer_table(
  p_from_table int,
  p_to_table int,
  p_performed_by uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order RECORD;
  v_target_order_id uuid;
  v_undo_data jsonb;
  v_now timestamptz := now();
  v_result jsonb;
BEGIN
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
$$;


-- ============================================================
-- 5. FIX: saito_split_orders
-- ============================================================
CREATE OR REPLACE FUNCTION saito_split_orders(
  p_table_numbers int[],
  p_performed_by uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_primary_table int;
  v_child_tables int[];
  v_split_orders uuid[];
  v_order RECORD;
  v_now timestamptz := now();
  v_result jsonb;
  v_subtract_total numeric := 0;
  v_subtract_guests int := 0;
BEGIN
  IF array_length(p_table_numbers, 1) < 2 THEN
    RAISE EXCEPTION 'Need at least 2 tables to split';
  END IF;

  v_primary_table := p_table_numbers[1];

  FOR i IN 2 .. array_length(p_table_numbers, 1) LOOP
    SELECT id, total_amount, guest_count INTO v_order
    FROM orders
    WHERE table_number = p_table_numbers[i] AND status NOT IN ('paid', 'cancelled')
    LIMIT 1;

    IF NOT FOUND THEN
      INSERT INTO orders (table_number, status, total_amount, guest_count, order_type, created_at, updated_at)
      VALUES (p_table_numbers[i], 'confirmed', 0, 0, 'dine_in', v_now, v_now)
      RETURNING id, total_amount, guest_count INTO v_order;
    END IF;

    -- Clear any merged_into reference
    UPDATE orders
    SET merged_into = NULL, updated_at = v_now
    WHERE id = v_order.id;

    v_subtract_total := v_subtract_total + v_order.total_amount;
    v_subtract_guests := v_subtract_guests + v_order.guest_count;
  END LOOP;

  -- Subtract split amounts from the primary order
  UPDATE orders
  SET total_amount = GREATEST(total_amount - v_subtract_total, 0),
      guest_count = GREATEST(guest_count - v_subtract_guests, 0),
      updated_at = v_now
  WHERE table_number = v_primary_table AND status NOT IN ('paid', 'cancelled');

  -- Refresh table floor totals
  FOR i IN 1 .. array_length(p_table_numbers, 1) LOOP
    UPDATE table_floors
    SET total_amount = (SELECT COALESCE(SUM(total_amount), 0)
        FROM orders WHERE table_number = p_table_numbers[i] AND status NOT IN ('paid', 'cancelled')),
        guest_count = (SELECT COALESCE(SUM(guest_count), 0)
        FROM orders WHERE table_number = p_table_numbers[i] AND status NOT IN ('paid', 'cancelled'))
    WHERE table_number = p_table_numbers[i];
  END LOOP;

  INSERT INTO audit_log (table_name, record_id, action, old_data, new_data, changed_by)
  VALUES ('orders'::text, v_primary_table::text, 'split'::text, '{}'::jsonb,
    jsonb_build_object('tables', p_table_numbers, 'subtract_total', v_subtract_total),
    p_performed_by);

  SELECT jsonb_build_object('split_count', array_length(p_table_numbers, 1)) INTO v_result;
  RETURN v_result;
END;
$$;


-- ============================================================
-- 6. FIX: saito_undo_table_operation
-- ============================================================
CREATE OR REPLACE FUNCTION saito_undo_table_operation(
  p_action text,
  p_data jsonb,
  p_performed_by uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_now timestamptz := now();
  v_result jsonb;
BEGIN
  CASE p_action
    WHEN 'merge' THEN
      UPDATE orders
      SET merged_into = NULL,
          table_number = (p_data->>'table_number')::int,
          updated_at = v_now
      WHERE id = (p_data->>'order_id')::uuid;

      UPDATE table_floors
      SET status = 'occupied',
          total_amount = (SELECT COALESCE(SUM(total_amount), 0)
            FROM orders WHERE table_number = (p_data->>'table_number')::int AND status NOT IN ('paid', 'cancelled')),
          guest_count = (SELECT COALESCE(SUM(guest_count), 0)
            FROM orders WHERE table_number = (p_data->>'table_number')::int AND status NOT IN ('paid', 'cancelled'))
      WHERE table_number = (p_data->>'table_number')::int;

      -- Recalculate primary table
      UPDATE table_floors
      SET total_amount = (SELECT COALESCE(SUM(total_amount), 0)
          FROM orders WHERE table_number = (p_data->>'table_number')::int AND status NOT IN ('paid', 'cancelled')),
          guest_count = (SELECT COALESCE(SUM(guest_count), 0)
          FROM orders WHERE table_number = (p_data->>'table_number')::int AND status NOT IN ('paid', 'cancelled'))
      WHERE table_number = (SELECT table_number FROM orders WHERE id = ((p_data->>'merged_into')::uuid));

    WHEN 'transfer' THEN
      UPDATE orders
      SET table_number = (p_data->>'from_table')::int,
          merged_into = CASE WHEN (p_data->>'merged')::bool THEN (p_data->>'target_order_id')::uuid::text ELSE NULL END,
          updated_at = v_now
      WHERE id = (p_data->>'order_id')::uuid;

      UPDATE table_floors
      SET status = 'occupied', total_amount = (p_data->>'total_amount')::numeric, guest_count = (p_data->>'guest_count')::int
      WHERE table_number = (p_data->>'from_table')::int;

    WHEN 'split' THEN
      UPDATE orders
      SET total_amount = (p_data->>'total_amount')::numeric,
          guest_count = (p_data->>'guest_count')::int,
          updated_at = v_now
      WHERE id = (p_data->>'order_id')::uuid;

    ELSE
      RAISE EXCEPTION 'Unknown undo action: %', p_action;
  END CASE;

  INSERT INTO audit_log (table_name, record_id, action, old_data, new_data, changed_by)
  VALUES ('table_floors', p_data->>'table_number', 'undo_' || p_action, p_data, '{}'::jsonb, p_performed_by);

  SELECT jsonb_build_object('success', true) INTO v_result;
  RETURN v_result;
END;
$$;


-- ============================================================
-- 7. FIX: Cancel table – ensure table_floors is fully reset
-- ============================================================
CREATE OR REPLACE FUNCTION cancel_table_orders(p_table_number int)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
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
$$;
