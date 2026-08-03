-- merge_reservation_tables_atomic: merge multiple tables under a reservation
CREATE OR REPLACE FUNCTION public.merge_reservation_tables_atomic(
  p_reservation_id UUID,
  p_table_numbers INT[],
  p_performed_by UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_reservation RECORD;
  v_table RECORD;
  v_merged_group_id TEXT;
BEGIN
  SELECT * INTO v_reservation FROM public.reservations WHERE id = p_reservation_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Reservation not found');
  END IF;

  IF v_reservation.status NOT IN ('pending', 'confirmed', 'waiting') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot merge tables in current reservation status');
  END IF;

  IF array_length(p_table_numbers, 1) < 2 THEN
    RETURN jsonb_build_object('success', false, 'error', 'At least 2 tables required for merge');
  END IF;

  FOR v_table IN SELECT * FROM public.table_floors WHERE table_number = ANY(p_table_numbers) FOR UPDATE LOOP
    NULL;
  END LOOP;

  v_merged_group_id := 'res-group-' || p_reservation_id;

  UPDATE public.table_floors SET
    status = 'merged',
    merged_into_table = p_table_numbers[1],
    updated_at = NOW()
  WHERE table_number = ANY(p_table_numbers);

  UPDATE public.reservations SET
    table_ids = p_table_numbers,
    reservation_merge_group_id = v_merged_group_id,
    updated_at = NOW()
  WHERE id = p_reservation_id;

  INSERT INTO public.operation_logs (
    reservation_id, table_number, action, old_values, new_values, performed_by
  ) VALUES (
    p_reservation_id,
    p_table_numbers[1],
    'merge_reservation_tables',
    jsonb_build_object('table_numbers', v_reservation.table_ids),
    jsonb_build_object('table_numbers', p_table_numbers, 'merged_group_id', v_merged_group_id),
    p_performed_by
  );

  RETURN jsonb_build_object('success', true, 'merged_group_id', v_merged_group_id);
END;
$$;
