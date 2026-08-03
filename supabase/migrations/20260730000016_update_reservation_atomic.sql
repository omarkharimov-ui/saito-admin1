-- update_reservation_atomic: update reservation with table reassignment
CREATE OR REPLACE FUNCTION public.update_reservation_atomic(
  p_reservation_id UUID,
  p_name TEXT DEFAULT NULL,
  p_phone TEXT DEFAULT NULL,
  p_guests INT DEFAULT NULL,
  p_date DATE DEFAULT NULL,
  p_time TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_vip BOOLEAN DEFAULT NULL,
  p_table_ids INT[] DEFAULT NULL,
  p_performed_by UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_reservation RECORD;
  v_old_table_ids INT[];
BEGIN
  SELECT * INTO v_reservation FROM public.reservations WHERE id = p_reservation_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Reservation not found');
  END IF;

  v_old_table_ids := CASE 
    WHEN v_reservation.table_ids IS NULL THEN '{}'
    WHEN jsonb_typeof(v_reservation.table_ids::jsonb) = 'array' THEN 
      (SELECT array_agg(x::int) FROM jsonb_array_elements_text(v_reservation.table_ids::jsonb) AS x)
    ELSE '{}'
  END;

  UPDATE public.reservations SET
    name = COALESCE(p_name, name),
    phone = COALESCE(p_phone, phone),
    guests = COALESCE(p_guests, guests),
    date = COALESCE(p_date, date),
    time = COALESCE(p_time, time),
    notes = COALESCE(p_notes, notes),
    is_vip = COALESCE(p_vip, is_vip),
    table_ids = p_table_ids,
    updated_at = NOW()
  WHERE id = p_reservation_id;

  IF p_table_ids IS NOT NULL THEN
    DELETE FROM public.reservation_tables WHERE reservation_id = p_reservation_id;
    INSERT INTO public.reservation_tables (reservation_id, table_number, created_at)
    SELECT p_reservation_id, unnest(p_table_ids), NOW();
  END IF;

  INSERT INTO public.operation_logs (
    reservation_id, action, old_values, new_values, performed_by
  ) VALUES (
    p_reservation_id, 'update_reservation',
    jsonb_build_object('table_ids', v_old_table_ids, 'name', v_reservation.name, 'guests', v_reservation.guests),
    jsonb_build_object('table_ids', p_table_ids, 'name', p_name, 'guests', p_guests),
    p_performed_by
  );

  RETURN jsonb_build_object('success', true);
END;
$$;
