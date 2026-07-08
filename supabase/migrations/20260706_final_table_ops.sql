-- ============================================================
-- FINAL TABLE OPERATIONS v3 (ROBUST & ATOMIC)
-- ============================================================

-- 1. Merge Tables Atomic v3
CREATE OR REPLACE FUNCTION merge_tables_v3(
  p_table_numbers INTEGER[],
  p_performed_by UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_target_table INTEGER;
  v_rest_tables INTEGER[];
  v_primary_order_id UUID;
  v_source_order_ids UUID[];
  v_total_amount NUMERIC := 0;
  v_total_guests INTEGER := 0;
  v_order RECORD;
BEGIN
  v_target_table := p_table_numbers[1];
  v_rest_tables := p_table_numbers[2:array_length(p_table_numbers, 1)];

  -- Lock target table floor
  PERFORM 1 FROM table_floors WHERE table_number = v_target_table FOR UPDATE;
  
  -- Find or create primary order for target table
  SELECT id, guest_count, total_amount INTO v_primary_order_id, v_total_guests, v_total_amount 
  FROM orders 
  WHERE table_number = v_target_table AND status NOT IN ('paid', 'cancelled', 'closed')
  LIMIT 1 FOR UPDATE;

  IF v_primary_order_id IS NULL THEN
    INSERT INTO orders (table_number, total_amount, guest_count, status, kitchen_status)
    VALUES (v_target_table, 0, 1, 'confirmed', 'pending')
    RETURNING id INTO v_primary_order_id;
    v_total_guests := 1;
    v_total_amount := 0;
  END IF;

  -- Lock and collect source orders
  FOR v_order IN 
    SELECT id, total_amount, guest_count FROM orders 
    WHERE table_number = ANY(v_rest_tables) AND status NOT IN ('paid', 'cancelled', 'closed')
    FOR UPDATE
  LOOP
    v_source_order_ids := array_append(v_source_order_ids, v_order.id);
    v_total_amount := v_total_amount + COALESCE(v_order.total_amount, 0);
    v_total_guests := v_total_guests + COALESCE(v_order.guest_count, 0);
    
    -- Mark source order as merged
    UPDATE orders SET merged_into = v_primary_order_id, updated_at = now() WHERE id = v_order.id;
  END LOOP;

  -- Update primary order totals
  UPDATE orders SET 
    total_amount = v_total_amount, 
    guest_count = v_total_guests,
    updated_at = now() 
  WHERE id = v_primary_order_id;

  -- Update table floors (CRITICAL SSOT)
  UPDATE table_floors SET 
    status = 'merged', 
    merged_into_table = v_target_table,
    guest_count = NULL,
    total_amount = 0
  WHERE table_number = ANY(v_rest_tables);

  UPDATE table_floors SET 
    status = 'occupied',
    guest_count = v_total_guests,
    total_amount = v_total_amount
  WHERE table_number = v_target_table;

  RETURN jsonb_build_object(
    'success', true,
    'primary_order_id', v_primary_order_id,
    'total_amount', v_total_amount,
    'total_guests', v_total_guests
  );
END;
$$;

-- 2. Transfer Table Atomic v3
CREATE OR REPLACE FUNCTION transfer_tables_v3(
  p_from_table INTEGER,
  p_to_table INTEGER,
  p_performed_by UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_target_status TEXT;
  v_order_ids UUID[];
  v_total_amount NUMERIC := 0;
  v_total_guests INTEGER := 0;
BEGIN
  -- Validate target
  SELECT status INTO v_target_status FROM table_floors WHERE table_number = p_to_table FOR UPDATE;
  IF v_target_status != 'empty' THEN
    RAISE EXCEPTION 'TARGET_TABLE_NOT_EMPTY' USING ERRCODE = 'P0001';
  END IF;

  -- Collect orders
  SELECT array_agg(id), SUM(total_amount), SUM(guest_count) 
  INTO v_order_ids, v_total_amount, v_total_guests
  FROM orders 
  WHERE table_number = p_from_table AND status NOT IN ('paid', 'cancelled', 'closed')
  FOR UPDATE;

  IF v_order_ids IS NULL THEN
    RAISE EXCEPTION 'SOURCE_TABLE_EMPTY' USING ERRCODE = 'P0001';
  END IF;

  -- Update orders
  UPDATE orders SET table_number = p_to_table, updated_at = now() WHERE id = ANY(v_order_ids);

  -- Update floors
  UPDATE table_floors SET 
    status = 'empty', guest_count = NULL, total_amount = 0, merged_into_table = NULL 
  WHERE table_number = p_from_table;

  UPDATE table_floors SET 
    status = 'occupied', guest_count = v_total_guests, total_amount = v_total_amount 
  WHERE table_number = p_to_table;

  RETURN jsonb_build_object('success', true, 'order_ids', v_order_ids);
END;
$$;

-- 3. Dismiss Table Atomic v3
CREATE OR REPLACE FUNCTION dismiss_table_v3(
  p_table_number INTEGER
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Mark all active orders as cancelled
  UPDATE orders SET status = 'cancelled', updated_at = now() 
  WHERE table_number = p_table_number AND status NOT IN ('paid', 'cancelled', 'closed');

  -- Also handle merged tables
  UPDATE orders SET status = 'cancelled', updated_at = now()
  WHERE id IN (
    SELECT id FROM orders o 
    JOIN table_floors tf ON o.table_number = tf.table_number 
    WHERE tf.merged_into_table = p_table_number
  );

  -- Reset all related table floors
  UPDATE table_floors SET 
    status = 'empty', 
    guest_count = NULL, 
    total_amount = 0, 
    merged_into_table = NULL,
    reservation_id = NULL
  WHERE table_number = p_table_number OR merged_into_table = p_table_number;

  RETURN jsonb_build_object('success', true);
END;
$$;
