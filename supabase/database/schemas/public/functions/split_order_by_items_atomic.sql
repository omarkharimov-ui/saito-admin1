CREATE FUNCTION public.split_order_by_items_atomic (
  p_original_order_id uuid,
  p_splits            jsonb,
  p_performed_by      uuid  DEFAULT NULL::uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
DECLARE
  v_original RECORD;
  v_split JSONB;
  v_new_order_id UUID;
  v_new_total NUMERIC := 0;
BEGIN
  SELECT * INTO v_original FROM orders WHERE id = p_original_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;
  IF v_original.status = 'paid' THEN
    RAISE EXCEPTION 'ORDER_ALREADY_PAID' USING ERRCODE = 'P0001';
  END IF;

  FOR v_split IN SELECT * FROM jsonb_array_elements(p_splits)
  LOOP
    INSERT INTO orders (
      table_number, total_amount, guest_count, status, kitchen_status,
      merged_into, version, created_at
    ) VALUES (
      v_original.table_number,
      0, 1, 'confirmed', 'pending',
      p_original_order_id, 1, now()
    )
    RETURNING id INTO v_new_order_id;

    INSERT INTO order_items (
      order_id, product_id, product_name, quantity, unit_price, total_price,
      modifiers, special_notes, combo_group_id, variant_id, kitchen_status, seat_number
    )
    SELECT
      v_new_order_id,
      (i->>'product_id')::UUID,
      i->>'product_name',
      (i->>'quantity')::INTEGER,
      (i->>'unit_price')::NUMERIC,
      (i->>'unit_price')::NUMERIC * (i->>'quantity')::INTEGER,
      i->>'modifiers',
      i->>'special_notes',
      (i->>'combo_group_id')::UUID,
      (i->>'variant_id')::UUID,
      'ready',
      (i->>'seat_number')::INTEGER
    FROM jsonb_array_elements(v_split->'items') AS i;

    SELECT COALESCE(SUM((i->>'unit_price')::NUMERIC * (i->>'quantity')::INTEGER), 0)
    INTO v_new_total
    FROM jsonb_array_elements(v_split->'items') AS i;

    UPDATE orders SET total_amount = v_new_total WHERE id = v_new_order_id;
  END LOOP;

  RETURN jsonb_build_object('success', true);
END;
$function$;

GRANT ALL ON FUNCTION public.split_order_by_items_atomic(uuid, jsonb, uuid) TO anon;

GRANT ALL ON FUNCTION public.split_order_by_items_atomic(uuid, jsonb, uuid) TO authenticated;

GRANT ALL ON FUNCTION public.split_order_by_items_atomic(uuid, jsonb, uuid) TO service_role;