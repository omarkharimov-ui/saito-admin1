CREATE FUNCTION public.merge_tables_v3 (
  p_table_numbers integer[],
  p_performed_by  uuid      DEFAULT NULL::uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  AS $function$
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
$function$;

GRANT ALL ON FUNCTION public.merge_tables_v3(integer[], uuid) TO anon;

GRANT ALL ON FUNCTION public.merge_tables_v3(integer[], uuid) TO authenticated;

GRANT ALL ON FUNCTION public.merge_tables_v3(integer[], uuid) TO service_role;