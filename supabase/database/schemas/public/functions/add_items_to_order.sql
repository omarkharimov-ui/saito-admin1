CREATE FUNCTION public.add_items_to_order (
  p_order_id    uuid,
  p_items       jsonb,
  p_terminal_id text  DEFAULT NULL::text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
DECLARE
  v_order RECORD;
  v_item JSONB;
  v_new_total NUMERIC;
  v_new_version INTEGER;
BEGIN
  -- Lock the order row FOR UPDATE to prevent concurrent modification
  SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;

  -- Insert items
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    INSERT INTO order_items (
      order_id, product_id, product_name, variant_id, quantity,
      unit_price, total_price, modifiers, special_notes,
      kitchen_status, seat_number, updated_by_terminal_id, price_snapshot, created_at
    ) VALUES (
      p_order_id,
      (v_item->>'product_id')::UUID,
      v_item->>'product_name',
      v_item->>'variant_id',
      COALESCE((v_item->>'quantity')::INTEGER, 1),
      COALESCE((v_item->>'unit_price')::NUMERIC, 0),
      COALESCE((v_item->>'unit_price')::NUMERIC, 0) * COALESCE((v_item->>'quantity')::INTEGER, 1),
      COALESCE(v_item->'modifiers', '[]'::JSONB),
      v_item->>'special_notes',
      'pending',
      (v_item->>'seat_number')::INTEGER,
      p_terminal_id,
      jsonb_build_object(
        'unit_price', COALESCE((v_item->>'unit_price')::NUMERIC, 0),
        'discount_price', GREATEST(0, COALESCE((v_item->>'original_unit_price')::NUMERIC, 0) - COALESCE((v_item->>'unit_price')::NUMERIC, 0)),
        'campaign_id', v_item->>'campaign_id',
        'campaign_discount', COALESCE((v_item->>'campaign_discount_amount')::NUMERIC, 0),
        'total_price', COALESCE((v_item->>'unit_price')::NUMERIC, 0) * COALESCE((v_item->>'quantity')::INTEGER, 1),
        'snapshot_at', now()::TEXT
      ),
      now()
    );
  END LOOP;

  -- Recalculate total from all non-cancelled items
  SELECT COALESCE(SUM(total_price), 0)
  INTO v_new_total
  FROM order_items
  WHERE order_id = p_order_id AND kitchen_status != 'cancelled';

  -- Increment version
  v_new_version := v_order.version + 1;

  -- Update order atomically
  UPDATE orders SET
    total_amount = v_new_total,
    version = v_new_version,
    is_draft = false,
    status = 'confirmed',
    updated_at = now(),
    updated_by_terminal_id = COALESCE(p_terminal_id, updated_by_terminal_id),
    -- Only reset kitchen_status to 'pending' if it wasn't already 'pending'
    kitchen_status = CASE
      WHEN v_order.kitchen_status IS NULL OR v_order.kitchen_status = '' THEN 'pending'
      ELSE v_order.kitchen_status
    END
  WHERE id = p_order_id;

  -- Update table_floors total_amount
  IF v_order.table_number IS NOT NULL THEN
    UPDATE table_floors SET
      total_amount = v_new_total,
      status = CASE WHEN v_new_total > 0 THEN 'occupied' ELSE status END,
      last_activity_at = now()
    WHERE table_number = v_order.table_number;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'order_id', p_order_id,
    'total_amount', v_new_total,
    'version', v_new_version
  );
END;
$function$;

CREATE FUNCTION public.add_items_to_order (
  p_order_id     uuid,
  p_items        jsonb,
  p_performed_by uuid  DEFAULT NULL::uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
DECLARE
  v_order RECORD;
  v_item JSONB;
  v_added INTEGER := 0;
  v_total_add NUMERIC := 0;
BEGIN
  SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;
  IF v_order.status IN ('paid', 'closed', 'cancelled') THEN
    RAISE EXCEPTION 'ORDER_FINALIZED' USING ERRCODE = 'P0001';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    INSERT INTO order_items (
      order_id, product_id, product_name, quantity, unit_price, total_price,
      modifiers, special_notes, kitchen_status
    ) VALUES (
      p_order_id,
      (v_item->>'product_id')::UUID,
      v_item->>'product_name',
      COALESCE((v_item->>'quantity')::INTEGER, 1),
      (v_item->>'unit_price')::NUMERIC,
      (v_item->>'unit_price')::NUMERIC * COALESCE((v_item->>'quantity')::INTEGER, 1),
      COALESCE(v_item->'modifiers', '[]'::JSONB),
      v_item->>'special_notes',
      'pending'
    );

    v_total_add := v_total_add + (v_item->>'unit_price')::NUMERIC * COALESCE((v_item->>'quantity')::INTEGER, 1);
    v_added := v_added + 1;

    PERFORM log_order_event(
      p_order_id, 'item_added',
      NULL,
      jsonb_build_object('product_name', v_item->>'product_name', 'quantity', (v_item->>'quantity')::INTEGER),
      NULL, p_performed_by, NULL, NULL, NULL
    );
  END LOOP;

  UPDATE orders SET
    total_amount = COALESCE(total_amount, 0) + v_total_add,
    version = COALESCE(version, 0) + 1,
    updated_at = now()
  WHERE id = p_order_id;

  RETURN jsonb_build_object(
    'success', true,
    'items_added', v_added,
    'total_increase', v_total_add,
    'new_total', COALESCE(v_order.total_amount, 0) + v_total_add
  );
END;
$function$;

GRANT ALL ON FUNCTION public.add_items_to_order(uuid, jsonb, text) TO anon;

GRANT ALL ON FUNCTION public.add_items_to_order(uuid, jsonb, text) TO authenticated;

GRANT ALL ON FUNCTION public.add_items_to_order(uuid, jsonb, text) TO service_role;

GRANT ALL ON FUNCTION public.add_items_to_order(uuid, jsonb, uuid) TO anon;

GRANT ALL ON FUNCTION public.add_items_to_order(uuid, jsonb, uuid) TO authenticated;

GRANT ALL ON FUNCTION public.add_items_to_order(uuid, jsonb, uuid) TO service_role;