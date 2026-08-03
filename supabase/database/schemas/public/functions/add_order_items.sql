CREATE FUNCTION public.add_order_items (
  p_order_id uuid,
  p_items    jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
DECLARE
  v_order RECORD;
  v_item JSONB;
  v_item_total NUMERIC;
  v_inserted INTEGER := 0;
BEGIN
  -- Lock order
  SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;
  IF v_order.status IN ('paid', 'cancelled', 'closed') THEN
    RAISE EXCEPTION 'ORDER_CLOSED' USING ERRCODE = 'P0001';
  END IF;

  -- Insert each item
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_item_total := COALESCE((v_item->>'total_price')::NUMERIC,
                             (v_item->>'unit_price')::NUMERIC * (v_item->>'quantity')::NUMERIC);

    INSERT INTO order_items (
      order_id, product_id, product_name, quantity, unit_price, total_price,
      modifiers, special_notes, combo_group_id, parent_order_item_id, variant_id,
      kitchen_status
    ) VALUES (
      p_order_id,
      (v_item->>'product_id')::UUID,
      v_item->>'product_name',
      (v_item->>'quantity')::INTEGER,
      (v_item->>'unit_price')::NUMERIC,
      v_item_total,
      v_item->>'modifiers',
      v_item->>'special_notes',
      (v_item->>'combo_group_id')::UUID,
      (v_item->>'parent_order_item_id')::UUID,
      (v_item->>'variant_id')::UUID,
      'pending'
    );

    v_inserted := v_inserted + 1;
  END LOOP;

  -- Update order total
  UPDATE orders
  SET total_amount = COALESCE(total_amount, 0) + (
    SELECT COALESCE(SUM(total_price), 0) FROM order_items WHERE order_id = p_order_id AND id IN (
      SELECT id FROM order_items WHERE order_id = p_order_id ORDER BY created_at DESC LIMIT v_inserted
    )
  ),
  version = COALESCE(version, 0) + 1
  WHERE id = p_order_id;

  RETURN jsonb_build_object('success', true, 'order_id', p_order_id, 'inserted', v_inserted);
END;
$function$;

GRANT ALL ON FUNCTION public.add_order_items(uuid, jsonb) TO anon;

GRANT ALL ON FUNCTION public.add_order_items(uuid, jsonb) TO authenticated;

GRANT ALL ON FUNCTION public.add_order_items(uuid, jsonb) TO service_role;