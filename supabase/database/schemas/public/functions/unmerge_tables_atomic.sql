CREATE FUNCTION public.unmerge_tables_atomic (
  p_parent_table_number      integer,
  p_child_table_numbers      integer[],
  p_performed_by             uuid      DEFAULT NULL::uuid,
  p_performed_by_terminal_id text      DEFAULT NULL::text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  AS $function$
DECLARE
  v_parent_order_id UUID;
  v_child_order RECORD;
  v_orig_table INTEGER;
BEGIN
  IF p_parent_table_number = ANY(p_child_table_numbers) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Parent cannot be in child list');
  END IF;

  SELECT id INTO v_parent_order_id FROM public.orders
    WHERE table_number = p_parent_table_number
      AND status NOT IN ('paid', 'cancelled', 'closed', 'completed')
    ORDER BY created_at ASC LIMIT 1;

  IF v_parent_order_id IS NOT NULL THEN
    FOR v_child_order IN
      SELECT * FROM public.orders
      WHERE merged_into = v_parent_order_id
      FOR UPDATE
    LOOP
      v_orig_table := COALESCE(v_child_order.merged_from_table, p_parent_table_number);

      UPDATE public.orders SET
        table_number = v_orig_table,
        merged_into = NULL,
        merged_from_table = NULL,
        updated_at = NOW(),
        version = COALESCE(v_child_order.version, 0) + 1,
        updated_by_terminal_id = p_performed_by_terminal_id
      WHERE id = v_child_order.id;

      UPDATE public.table_floors SET
        status = 'occupied',
        current_order_id = v_child_order.id,
        merged_into_table = NULL,
        updated_at = NOW()
      WHERE table_number = v_orig_table;
    END LOOP;
  ELSE
    FOR v_child_order IN
      SELECT * FROM public.orders
      WHERE table_number = p_parent_table_number
        AND merged_from_table IS NOT NULL
      FOR UPDATE
    LOOP
      v_orig_table := v_child_order.merged_from_table;

      UPDATE public.orders SET
        table_number = v_orig_table,
        merged_into = NULL,
        merged_from_table = NULL,
        updated_at = NOW(),
        version = COALESCE(v_child_order.version, 0) + 1,
        updated_by_terminal_id = p_performed_by_terminal_id
      WHERE id = v_child_order.id;

      UPDATE public.table_floors SET
        status = 'occupied',
        current_order_id = v_child_order.id,
        merged_into_table = NULL,
        updated_at = NOW()
      WHERE table_number = v_orig_table;
    END LOOP;
  END IF;

  UPDATE public.table_floors SET
    merged_into_table = NULL,
    updated_at = NOW()
  WHERE table_number = p_parent_table_number;

  INSERT INTO public.operation_logs (
    table_number, order_id, action, old_values, new_values, performed_by
  ) VALUES (
    p_parent_table_number,
    v_parent_order_id,
    'unmerge_tables',
    jsonb_build_object('children', p_child_table_numbers),
    jsonb_build_object('parent_order_id', v_parent_order_id),
    p_performed_by
  );

  RETURN jsonb_build_object('success', true, 'parent_order_id', v_parent_order_id);
END;
$function$;

GRANT ALL ON FUNCTION public.unmerge_tables_atomic(integer, integer[], uuid, text) TO anon;

GRANT ALL ON FUNCTION public.unmerge_tables_atomic(integer, integer[], uuid, text) TO authenticated;

GRANT ALL ON FUNCTION public.unmerge_tables_atomic(integer, integer[], uuid, text) TO service_role;