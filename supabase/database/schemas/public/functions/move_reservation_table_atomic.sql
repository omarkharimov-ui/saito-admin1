CREATE FUNCTION public.move_reservation_table_atomic (
  p_reservation_id uuid,
  p_from_table     integer,
  p_to_table       integer,
  p_performed_by   uuid    DEFAULT NULL::uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  AS $function$
DECLARE
  v_reservation RECORD;
  v_from_table RECORD;
  v_to_table RECORD;
BEGIN
  SELECT * INTO v_reservation FROM public.reservations WHERE id = p_reservation_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Reservation not found');
  END IF;

  IF v_reservation.status NOT IN ('pending', 'confirmed', 'waiting') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot move reservation in current status');
  END IF;

  SELECT * INTO v_from_table FROM public.table_floors WHERE table_number = p_from_table FOR UPDATE;
  SELECT * INTO v_to_table FROM public.table_floors WHERE table_number = p_to_table FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Table not found');
  END IF;

  IF v_to_table.status != 'empty' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Destination table is not empty');
  END IF;

  UPDATE public.table_floors SET
    status = 'empty',
    reservation_id = NULL,
    reservation_name = NULL,
    reservation_phone = NULL,
    reservation_time = NULL,
    current_order_id = NULL,
    updated_at = NOW()
  WHERE table_number = p_from_table;

  UPDATE public.table_floors SET
    status = 'reserved',
    reservation_id = p_reservation_id,
    reservation_name = v_reservation.name,
    reservation_phone = v_reservation.phone,
    reservation_time = v_reservation.time,
    updated_at = NOW()
  WHERE table_number = p_to_table;

  UPDATE public.reservations SET
    table_ids = array_remove(table_ids, p_from_table),
    updated_at = NOW()
  WHERE id = p_reservation_id;

  IF NOT (table_ids @> ARRAY[p_to_table]) THEN
    UPDATE public.reservations SET
      table_ids = array_append(table_ids, p_to_table),
      updated_at = NOW()
    WHERE id = p_reservation_id;
  END IF;

  INSERT INTO public.operation_logs (
    reservation_id, table_number, action, old_values, new_values, performed_by
  ) VALUES (
    p_reservation_id,
    p_to_table,
    'move_reservation_table',
    jsonb_build_object('from_table', p_from_table),
    jsonb_build_object('to_table', p_to_table),
    p_performed_by
  );

  RETURN jsonb_build_object('success', true);
END;
$function$;

GRANT ALL ON FUNCTION public.move_reservation_table_atomic(uuid, integer, integer, uuid) TO anon;

GRANT ALL ON FUNCTION public.move_reservation_table_atomic(uuid, integer, integer, uuid) TO authenticated;

GRANT ALL ON FUNCTION public.move_reservation_table_atomic(uuid, integer, integer, uuid) TO service_role;