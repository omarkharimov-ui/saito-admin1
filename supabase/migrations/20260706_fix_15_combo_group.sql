-- ============================================================================
-- Fix 15: combo_group_id — properly group combo children under a parent
-- ============================================================================

-- ─── 1. Add combo_group_id to order_items ───
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS combo_group_id UUID DEFAULT NULL;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS is_combo_parent BOOLEAN DEFAULT FALSE;

-- ─── 2. Update create_order_with_items to handle combo_group_id ───
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
      combo_group_id, is_combo_parent,
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
      (v_item->>'combo_group_id')::UUID,
      COALESCE((v_item->>'is_combo_parent')::BOOLEAN, FALSE),
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
