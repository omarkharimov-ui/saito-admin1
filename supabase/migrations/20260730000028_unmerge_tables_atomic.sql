-- unmerge_tables_atomic: undo merge, restore child tables to standalone orders
CREATE OR REPLACE FUNCTION public.unmerge_tables_atomic(
  p_parent_table_number INT,
  p_child_table_numbers INT[],
  p_performed_by UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_parent_order_id UUID;
  v_child_order RECORD;
  v_child_total NUMERIC := 0;
BEGIN
  IF p_parent_table_number = ANY(p_child_table_numbers) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Parent cannot be in child list');
  END IF;

  SELECT id INTO v_parent_order_id FROM public.orders 
    WHERE table_number = p_parent_table_number 
      AND status NOT IN ('paid', 'cancelled', 'closed', 'completed')
    ORDER BY created_at ASC LIMIT 1;

  IF v_parent_order_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No active order on parent table');
  END IF;

  FOR v_child_order IN 
    SELECT * FROM public.orders 
    WHERE table_number = ANY(p_child_table_numbers) 
      AND merged_into = v_parent_order_id
    FOR UPDATE
  LOOP
    UPDATE public.orders SET
      table_number = v_child_order.table_number,
      merged_into = NULL,
      updated_at = NOW()
    WHERE id = v_child_order.id;

    v_child_total := v_child_total + COALESCE(v_child_order.total_amount, 0);

    UPDATE public.table_floors SET
      status = 'occupied',
      current_order_id = v_child_order.id,
      merged_into_table = NULL,
      updated_at = NOW()
    WHERE table_number = v_child_order.table_number;
  END LOOP;

  UPDATE public.orders SET
    total_amount = GREATEST(0, total_amount - v_child_total),
    updated_at = NOW()
  WHERE id = v_parent_order_id;

  UPDATE public.table_floors SET
    merged_into_table = NULL,
    updated_at = NOW()
  WHERE table_number = p_parent_table_number;

  INSERT INTO public.operation_logs (
    table_number, order_id, action, old_values, new_values, performed_by
  ) VALUES (
    p_parent_table_number, v_parent_order_id, 'unmerge_tables',
    jsonb_build_object('children', p_child_table_numbers),
    jsonb_build_object('parent_order_id', v_parent_order_id),
    p_performed_by
  );

  RETURN jsonb_build_object('success', true, 'parent_order_id', v_parent_order_id);
END;
$$;
