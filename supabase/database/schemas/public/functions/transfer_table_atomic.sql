CREATE OR REPLACE FUNCTION public.transfer_table_atomic (
  p_from_table               integer,
  p_to_table                 integer,
  p_performed_by             uuid    DEFAULT NULL::uuid,
  p_performed_by_terminal_id text    DEFAULT NULL::text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  AS $function$
  DECLARE
  v_from RECORD;
  v_to RECORD;
  v_order RECORD;
  v_total_guests INT := 0;
  v_total_amount NUMERIC := 0;
BEGIN
  PERFORM public.validate_actor(p_performed_by);
  IF p_from_table = p_to_table THEN
    RETURN jsonb_build_object('success', false, 'error', 'Source and target are the same');
  END IF;

  SELECT * INTO v_from FROM public.table_floors WHERE table_number = p_from_table FOR UPDATE;
  SELECT * INTO v_to FROM public.table_floors WHERE table_number = p_to_table FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Table not found');
  END IF;

  SELECT * INTO v_order FROM public.orders 
  WHERE table_number = p_from_table 
    AND status NOT IN ('paid', 'cancelled', 'closed', 'completed')
  ORDER BY created_at ASC LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'No active order on source table');
  END IF;

  v_total_guests := COALESCE(v_order.guest_count, 0);
  v_total_amount := COALESCE(v_order.total_amount, 0);

  UPDATE public.orders SET
    table_number = p_to_table,
    updated_at = NOW(),
    version = COALESCE(version, 0) + 1,
    updated_by_terminal_id = p_performed_by_terminal_id
  WHERE table_number = p_from_table 
    AND status NOT IN ('paid', 'cancelled', 'closed', 'completed');

  UPDATE public.table_floors SET
    status = 'occupied',
    guest_count = v_total_guests,
    total_amount = v_total_amount,
    current_order_id = v_order.id,
    merged_into_table = NULL,
    reservation_id = NULL,
    reservation_name = NULL,
    reservation_phone = NULL,
    reservation_time = NULL,
    updated_at = NOW(),
    updated_by_terminal_id = p_performed_by_terminal_id
  WHERE table_number = p_to_table;

  IF v_from.reservation_id IS NOT NULL THEN
    UPDATE public.reservations SET
      table_ids = array_remove(table_ids, p_from_table),
      updated_at = NOW()
    WHERE id = v_from.reservation_id;

    IF NOT (table_ids @> ARRAY[p_to_table]) THEN
      UPDATE public.reservations SET
        table_ids = array_append(table_ids, p_to_table),
        updated_at = NOW()
      WHERE id = v_from.reservation_id;
    END IF;
  END IF;

  UPDATE public.table_floors SET
    status = 'empty',
    guest_count = NULL,
    total_amount = 0,
    current_order_id = NULL,
    merged_into_table = NULL,
    reservation_id = NULL,
    reservation_name = NULL,
    reservation_phone = NULL,
    reservation_time = NULL,
    updated_at = NOW(),
    updated_by_terminal_id = p_performed_by_terminal_id
  WHERE table_number = p_from_table;

  INSERT INTO public.operation_logs (
    table_number, order_id, action, old_values, new_values, performed_by
  ) VALUES (
    p_from_table,
    v_order.id,
    'transfer_table',
    jsonb_build_object('from_table', p_from_table),
    jsonb_build_object('to_table', p_to_table),
    p_performed_by
  );

  RETURN jsonb_build_object('success', true, 'order_id', v_order.id);
END;
$function$;



