-- Run this in Supabase Dashboard SQL editor to fix create_order_with_items RPC
-- Two bugs: (1) v_item alias conflict, (2) modifiers text→jsonb cast needed

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
  v_item record;
  v_total numeric;
  v_table_id uuid;
  v_now timestamptz := now();
  v_result jsonb;
BEGIN
  -- Check if table exists
  SELECT id INTO v_table_id
  FROM table_floors
  WHERE table_number = p_table_number
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Table % not found', p_table_number;
  END IF;

  -- Check for existing order on this table
  SELECT id INTO v_order_id
  FROM orders
  WHERE table_number = p_table_number
    AND status NOT IN ('paid', 'cancelled')
  LIMIT 1;

  IF NOT FOUND THEN
    -- Create new order
    INSERT INTO orders (
      table_number, status, total_amount, guest_count,
      customer_note, order_type, created_at, updated_at
    ) VALUES (
      p_table_number, p_status,
      COALESCE(p_total_amount, 0), p_guest_count,
      p_customer_note, p_order_type, v_now, v_now
    )
    RETURNING id INTO v_order_id;
  END IF;

  -- Insert order items
  FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS item_rec(
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
      v_order_id, v_item.product_id, v_item.variant_id,
      v_item.quantity, v_item.unit_price, v_item.total_price,
      COALESCE(v_item.modifiers, '[]'::jsonb),
      v_item.special_notes, v_now
    );

    -- Update product availability if it becomes sold out
    -- (kitchen_stock check could go here)
  END LOOP;

  -- Recalculate total from items
  SELECT COALESCE(SUM(total_price), 0)
  INTO v_total
  FROM order_items
  WHERE order_id = v_order_id;

  UPDATE orders
  SET total_amount = v_total,
      guest_count = p_guest_count,
      updated_at = v_now
  WHERE id = v_order_id;

  -- Update table status
  UPDATE table_floors
  SET status = 'occupied',
      total_amount = v_total,
      guest_count = p_guest_count,
      order_count = (SELECT COUNT(*) FROM orders WHERE table_number = p_table_number AND status NOT IN ('paid', 'cancelled'))
  WHERE table_number = p_table_number;

  -- Audit log
  INSERT INTO audit_log (table_name, record_id, action, old_data, new_data, changed_by)
  VALUES ('orders', v_order_id, 'created', '{}', jsonb_build_object(
    'table_number', p_table_number,
    'total_amount', v_total,
    'items', (SELECT jsonb_agg(jsonb_build_object('product_id', product_id, 'quantity', quantity, 'total_price', total_price)) FROM order_items WHERE order_id = v_order_id)
  ), 'system');

  -- Notification
  INSERT INTO notifications (title, message, type, created_at)
  VALUES (
    'Yeni sifariş',
    'Masa ' || p_table_number || ' — ' || v_total || ' AZN',
    'new_order',
    v_now
  );

  SELECT jsonb_build_object(
    'id', v_order_id,
    'table_number', p_table_number,
    'total_amount', v_total,
    'status', p_status,
    'guest_count', p_guest_count
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- Also fix the route to not stringify modifiers
