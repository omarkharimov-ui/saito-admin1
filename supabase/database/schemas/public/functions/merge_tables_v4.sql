CREATE FUNCTION public.merge_tables_v4 (
  p_primary_table integer,
  p_child_tables  integer[],
  p_performed_by  uuid      DEFAULT NULL::uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  AS $function$
DECLARE
  v_group_id UUID;
  v_primary_order_id UUID;
  v_child_num INTEGER;
  v_log_id UUID;
BEGIN
  -- Lock primary floor
  PERFORM 1 FROM table_floors WHERE table_number = p_primary_table FOR UPDATE;

  -- Find primary order
  SELECT id, group_id INTO v_primary_order_id, v_group_id FROM orders 
  WHERE table_number = p_primary_table AND status = 'confirmed' LIMIT 1 FOR UPDATE;

  IF v_primary_order_id IS NULL THEN
    RAISE EXCEPTION 'PRIMARY_TABLE_EMPTY' USING ERRCODE = 'P0001';
  END IF;

  -- Reuse or Create Group
  IF v_group_id IS NULL THEN
    INSERT INTO dining_groups (primary_order_id) VALUES (v_primary_order_id) RETURNING id INTO v_group_id;
    UPDATE orders SET group_id = v_group_id WHERE id = v_primary_order_id;
  END IF;

  -- Merge Children
  FOREACH v_child_num IN ARRAY p_child_tables LOOP
    UPDATE orders SET group_id = v_group_id 
    WHERE table_number = v_child_num AND status = 'confirmed';
    
    UPDATE table_floors SET status = 'occupied', merged_into_table = p_primary_table 
    WHERE table_number = v_child_num;
  END LOOP;

  -- Audit
  INSERT INTO operation_logs (type, payload, inverse_payload, performed_by)
  VALUES ('MERGE', 
    jsonb_build_object('primary', p_primary_table, 'children', p_child_tables, 'group_id', v_group_id),
    jsonb_build_object('primary', p_primary_table, 'children', p_child_tables, 'group_id', v_group_id),
    p_performed_by
  ) RETURNING id INTO v_log_id;

  RETURN jsonb_build_object('success', true, 'group_id', v_group_id, 'log_id', v_log_id);
END;
$function$;

GRANT ALL ON FUNCTION public.merge_tables_v4(integer, integer[], uuid) TO anon;

GRANT ALL ON FUNCTION public.merge_tables_v4(integer, integer[], uuid) TO authenticated;

GRANT ALL ON FUNCTION public.merge_tables_v4(integer, integer[], uuid) TO service_role;