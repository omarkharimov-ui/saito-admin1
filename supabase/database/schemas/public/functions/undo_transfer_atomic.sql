CREATE FUNCTION public.undo_transfer_atomic (
  p_from_table   integer,
  p_to_table     integer,
  p_performed_by uuid    DEFAULT NULL::uuid
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
  IF p_from_table = p_to_table THEN
    RETURN jsonb_build_object('success', false, 'error', 'Source and target are the same');
  END IF;

  SELECT * INTO v_from FROM public.table_floors WHERE table_number = p_from_table FOR UPDATE;
  SELECT * INTO v_to FROM public.table_floors WHERE table_number = p_to_table FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Table not found');
  END IF;

  SELECT * INTO v_order FROM public.orders
    WHERE table_number = p_to_table
      AND status NOT IN ('paid', 'cancelled', 'closed', 'completed')
    ORDER BY created_at ASC LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'No active order on target table to revert');
  END IF;

  v_total_guests := COALESCE(v_order.guest_count, 0);
  v_total_amount := COALESCE(v_order.total_amount, 0);

  UPDATE public.orders SET
    table_number = p_from_table,
    updated_at = NOW()
  WHERE table_number = p_to_table
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
    updated_at = NOW()
  WHERE table_number = p_from_table;

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
    updated_at = NOW()
  WHERE table_number = p_to_table;

  INSERT INTO public.operation_logs (
    table_number, order_id, action, old_values, new_values, performed_by
  ) VALUES (
    p_from_table,
    v_order.id,
    'undo_transfer',
    jsonb_build_object('from_table', p_from_table, 'to_table', p_to_table),
    jsonb_build_object('from_table', p_from_table, 'to_table', p_to_table, 'reverted', true),
    p_performed_by
  );

  RETURN jsonb_build_object('success', true, 'order_id', v_order.id);
END;
$function$;

GRANT ALL ON FUNCTION public.undo_transfer_atomic(integer, integer, uuid) TO anon;

GRANT ALL ON FUNCTION public.undo_transfer_atomic(integer, integer, uuid) TO authenticated;

GRANT ALL ON FUNCTION public.undo_transfer_atomic(integer, integer, uuid) TO service_role;