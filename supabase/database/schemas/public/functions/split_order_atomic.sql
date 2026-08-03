CREATE FUNCTION public.split_order_atomic (
  p_original_order_id uuid,
  p_split_items       jsonb,
  p_split_total       numeric,
  p_new_guest_count   integer DEFAULT 1,
  p_performed_by      uuid    DEFAULT NULL::uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
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
$function$;

GRANT ALL ON FUNCTION public.split_order_atomic(uuid, jsonb, numeric, integer, uuid) TO anon;

GRANT ALL ON FUNCTION public.split_order_atomic(uuid, jsonb, numeric, integer, uuid) TO authenticated;

GRANT ALL ON FUNCTION public.split_order_atomic(uuid, jsonb, numeric, integer, uuid) TO service_role;