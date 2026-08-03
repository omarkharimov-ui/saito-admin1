CREATE FUNCTION public.create_or_append_order (
  p_table_number   integer,
  p_items          jsonb,
  p_status         text    DEFAULT 'confirmed'::text,
  p_guest_count    integer DEFAULT 1,
  p_customer_note  text    DEFAULT NULL::text,
  p_order_type     text    DEFAULT 'dine_in'::text,
  p_reservation_id uuid    DEFAULT NULL::uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  AS $function$
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
$function$;

GRANT ALL ON FUNCTION public.create_or_append_order(integer, jsonb, text, integer, text, text, uuid) TO anon;

GRANT ALL ON FUNCTION public.create_or_append_order(integer, jsonb, text, integer, text, text, uuid) TO authenticated;

GRANT ALL ON FUNCTION public.create_or_append_order(integer, jsonb, text, integer, text, text, uuid) TO service_role;