CREATE OR REPLACE FUNCTION public.merge_tables_atomic (
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
  v_parent RECORD;
  v_child RECORD;
  v_parent_order_id UUID;
  v_merged_group_id TEXT;
BEGIN
  PERFORM public.validate_actor(p_performed_by);
  IF p_parent_table_number = ANY(p_child_table_numbers) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Parent cannot be in child list');
  END IF;

  SELECT * INTO v_parent FROM public.table_floors WHERE table_number = p_parent_table_number FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Parent table not found');
  END IF;

  FOR v_child IN SELECT * FROM public.table_floors WHERE table_number = ANY(p_child_table_numbers) FOR UPDATE LOOP
    NULL;
  END LOOP;

  SELECT id INTO v_parent_order_id FROM public.orders
  WHERE table_number = p_parent_table_number
    AND status NOT IN ('paid', 'cancelled', 'closed', 'completed')
  ORDER BY created_at ASC LIMIT 1;

  FOR v_child IN SELECT * FROM public.table_floors WHERE table_number = ANY(p_child_table_numbers) LOOP
    UPDATE public.orders SET
      merged_into = v_parent_order_id,
      merged_from_table = v_child.table_number,
      table_number = p_parent_table_number,
      updated_at = NOW(),
      version = COALESCE(version, 0) + 1,
      updated_by_terminal_id = p_performed_by_terminal_id
    WHERE table_number = v_child.table_number
      AND status NOT IN ('paid', 'cancelled', 'closed', 'completed')
      AND merged_into IS NULL;
  END LOOP;

  UPDATE public.table_floors SET
    merged_into_table = p_parent_table_number,
    status = 'empty',
    current_order_id = NULL,
    updated_at = NOW(),
    updated_by_terminal_id = p_performed_by_terminal_id
  WHERE table_number = ANY(p_child_table_numbers);

  UPDATE public.kitchen_schedule SET
    table_number = p_parent_table_number,
    updated_at = NOW()
  WHERE table_number = ANY(p_child_table_numbers);

  FOR v_child IN SELECT * FROM public.table_floors WHERE table_number = ANY(p_child_table_numbers) LOOP
    IF v_child.reservation_id IS NOT NULL THEN
      UPDATE public.reservations SET
        table_ids = array_remove(table_ids, v_child.table_number),
        updated_at = NOW()
      WHERE id = v_child.reservation_id;

      UPDATE public.reservations SET
        table_ids = array_append(
          CASE WHEN table_ids @> ARRAY[p_parent_table_number] THEN table_ids ELSE array_append(table_ids, p_parent_table_number) END,
          v_child.table_number
        ),
        updated_at = NOW()
      WHERE id = (
        SELECT id FROM public.reservations
        WHERE id != v_child.reservation_id
          AND table_ids @> ARRAY[p_parent_table_number]
        LIMIT 1
      );
    END IF;
  END LOOP;

  v_merged_group_id := 'group-' || p_parent_table_number;

  INSERT INTO public.operation_logs (
    table_number, order_id, action, old_values, new_values, performed_by
  ) VALUES (
    p_parent_table_number,
    v_parent_order_id,
    'merge_tables',
    jsonb_build_object('children', p_child_table_numbers),
    jsonb_build_object('merged_group_id', v_merged_group_id),
    p_performed_by
  );

  RETURN jsonb_build_object('success', true, 'parent_order_id', v_parent_order_id, 'merged_group_id', v_merged_group_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.merge_tables_atomic (
  p_parent_table_number integer,
  p_child_table_numbers integer[],
  p_performed_by        uuid      DEFAULT NULL::uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  AS $function$
  DECLARE
  v_parent RECORD;
  v_child RECORD;
  v_parent_order_id UUID;
  v_child_order_ids UUID[] := '{}';
  v_merged_group_id TEXT;
  v_new_order_created BOOLEAN := false;
BEGIN
  PERFORM public.validate_actor(p_performed_by);
  IF p_parent_table_number = ANY(p_child_table_numbers) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Parent cannot be in child list');
  END IF;

  SELECT * INTO v_parent FROM public.table_floors WHERE table_number = p_parent_table_number FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Parent table not found');
  END IF;

  -- Lock children
  FOR v_child IN SELECT * FROM public.table_floors WHERE table_number = ANY(p_child_table_numbers) FOR UPDATE LOOP
    NULL;
  END LOOP;

  -- Find parent order or create one if parent is empty
  SELECT id INTO v_parent_order_id FROM public.orders
    WHERE table_number = p_parent_table_number
      AND status NOT IN ('paid', 'cancelled', 'closed', 'completed')
    ORDER BY created_at ASC LIMIT 1;

  IF v_parent_order_id IS NULL THEN
    INSERT INTO public.orders (
      table_number, status, guest_count, kitchen_status, order_source, created_at, updated_at, version
    ) VALUES (
      p_parent_table_number, 'new', 0, 'pending', 'dine_in', NOW(), NOW(), 1
    ) RETURNING id INTO v_parent_order_id;
    v_new_order_created := true;

    UPDATE public.table_floors SET
      current_order_id = v_parent_order_id,
      status = 'occupied',
      updated_at = NOW()
    WHERE table_number = p_parent_table_number;
  END IF;

  -- Merge child orders into parent
  FOR v_child IN SELECT * FROM public.table_floors WHERE table_number = ANY(p_child_table_numbers) LOOP
    UPDATE public.orders SET
      merged_into = v_parent_order_id,
      table_number = p_parent_table_number,
      updated_at = NOW()
    WHERE table_number = v_child.table_number
      AND status NOT IN ('paid', 'cancelled', 'closed', 'completed')
      AND merged_into IS NULL;

    SELECT array_agg(id) INTO v_child_order_ids FROM public.orders
      WHERE table_number = v_child.table_number AND merged_into = v_parent_order_id;
  END LOOP;

  -- Update table_floors
  UPDATE public.table_floors SET
    merged_into_table = p_parent_table_number,
    status = 'empty',
    current_order_id = NULL,
    updated_at = NOW()
  WHERE table_number = ANY(p_child_table_numbers);

  -- Move kitchen_schedule references from child tables to parent
  UPDATE public.kitchen_schedule SET
    table_number = p_parent_table_number,
    updated_at = NOW()
  WHERE table_number = ANY(p_child_table_numbers);

  -- Update reservations.table_ids: move child tables into parent reservation association
  FOR v_child IN SELECT * FROM public.table_floors WHERE table_number = ANY(p_child_table_numbers) LOOP
    IF v_child.reservation_id IS NOT NULL THEN
      UPDATE public.reservations SET
        table_ids = array_remove(table_ids, v_child.table_number),
        updated_at = NOW()
      WHERE id = v_child.reservation_id;

      UPDATE public.reservations SET
        table_ids = array_append(
          CASE WHEN table_ids @> ARRAY[p_parent_table_number] THEN table_ids ELSE array_append(table_ids, p_parent_table_number) END,
          v_child.table_number
        ),
        updated_at = NOW()
      WHERE id = (
        SELECT id FROM public.reservations
        WHERE id != v_child.reservation_id
          AND table_ids @> ARRAY[p_parent_table_number]
        LIMIT 1
      );
    END IF;
  END LOOP;

  v_merged_group_id := 'group-' || p_parent_table_number;

  INSERT INTO public.operation_logs (
    table_number, order_id, action, old_values, new_values, performed_by
  ) VALUES (
    p_parent_table_number,
    v_parent_order_id,
    'merge_tables',
    jsonb_build_object('children', p_child_table_numbers, 'new_order_created', v_new_order_created),
    jsonb_build_object('merged_group_id', v_merged_group_id),
    p_performed_by
  );

  RETURN jsonb_build_object('success', true, 'parent_order_id', v_parent_order_id, 'merged_group_id', v_merged_group_id, 'new_order_created', v_new_order_created);
END;
$function$;






