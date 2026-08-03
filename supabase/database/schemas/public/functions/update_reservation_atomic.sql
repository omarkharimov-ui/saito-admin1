CREATE FUNCTION public.update_reservation_atomic (
  p_reservation_id uuid,
  p_name           text    DEFAULT NULL::text,
  p_phone          text    DEFAULT NULL::text,
  p_guests         integer DEFAULT NULL::integer,
  p_date           text    DEFAULT NULL::text,
  p_time           text    DEFAULT NULL::text,
  p_notes          text    DEFAULT NULL::text,
  p_vip            boolean DEFAULT NULL::boolean,
  p_table_ids      jsonb   DEFAULT NULL::jsonb,
  p_performed_by   uuid    DEFAULT NULL::uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
DECLARE
  v_reservation RECORD;
  v_table_id UUID;
  v_table_number INTEGER;
  v_new_ids UUID[] := '{}';
  v_old_nums INTEGER[] := '{}';
  v_new_nums INTEGER[] := '{}';
BEGIN
  SELECT * INTO v_reservation FROM reservations WHERE id = p_reservation_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'RESERVATION_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  -- Collect old table numbers from reservation_tables
  SELECT COALESCE(array_agg(rt.table_number), '{}') INTO v_old_nums
  FROM reservation_tables rt
  WHERE rt.reservation_id = p_reservation_id;

  -- Collect new table UUIDs from frontend
  IF p_table_ids IS NOT NULL AND jsonb_array_length(p_table_ids) > 0 THEN
    SELECT array_agg(x::UUID) INTO v_new_ids
    FROM jsonb_array_elements_text(p_table_ids) AS x;
  END IF;

  -- If no new IDs, keep old
  IF v_new_ids IS NULL OR array_length(v_new_ids, 1) IS NULL THEN
    v_new_ids := '{}';
  END IF;

  -- Resolve new UUIDs to table_numbers
  IF array_length(v_new_ids, 1) > 0 THEN
    SELECT COALESCE(array_agg(tf.table_number ORDER BY tf.table_number), '{}') INTO v_new_nums
    FROM table_floors tf
    WHERE tf.id = ANY(v_new_ids);
  END IF;

  -- Free tables that are no longer assigned (by table_number)
  FOR v_table_number IN SELECT unnest(v_old_nums) LOOP
    IF NOT (v_table_number = ANY(v_new_nums)) THEN
      UPDATE table_floors SET
        status = 'empty',
        reservation_id = NULL,
        reservation_name = NULL,
        reservation_phone = NULL,
        reservation_time = NULL,
        guest_count = NULL
      WHERE table_number = v_table_number;
    END IF;
  END LOOP;

  -- Remove old reservation_tables entries
  DELETE FROM reservation_tables WHERE reservation_id = p_reservation_id;

  -- Insert new reservation_tables and mark tables
  FOR v_table_id IN SELECT unnest(v_new_ids) LOOP
    SELECT table_number INTO v_table_number FROM table_floors WHERE id = v_table_id;

    IF v_table_number IS NOT NULL THEN
      -- Insert junction row with table_number
      INSERT INTO reservation_tables (reservation_id, table_number)
      VALUES (p_reservation_id, v_table_number)
      ON CONFLICT DO NOTHING;

      -- Mark table as reserved
      UPDATE table_floors SET
        status = 'reserved',
        reservation_id = p_reservation_id,
        reservation_name = COALESCE(p_name, v_reservation.name),
        reservation_phone = COALESCE(p_phone, v_reservation.phone),
        reservation_time = COALESCE(p_time, v_reservation.time::text),
        guest_count = COALESCE(p_guests, v_reservation.guests)
      WHERE id = v_table_id
        AND status IS DISTINCT FROM 'occupied';
    END IF;
  END LOOP;

  -- Update reservation record
  UPDATE reservations SET
    name = COALESCE(p_name, name),
    phone = COALESCE(p_phone, phone),
    guests = COALESCE(p_guests, guests),
    date = COALESCE(p_date::date, date),
    time = COALESCE(p_time::time without time zone, time),
    note = COALESCE(p_notes, note),
    is_vip = COALESCE(p_vip, is_vip),
    updated_at = now()
  WHERE id = p_reservation_id;

  RETURN jsonb_build_object(
    'success', true,
    'reservation_id', p_reservation_id
  );
END;
$function$;

GRANT ALL ON FUNCTION public.update_reservation_atomic(uuid, text, text, integer, text, text, text, boolean, jsonb, uuid) TO anon;

GRANT ALL ON FUNCTION public.update_reservation_atomic(uuid, text, text, integer, text, text, text, boolean, jsonb, uuid) TO authenticated;

GRANT ALL ON FUNCTION public.update_reservation_atomic(uuid, text, text, integer, text, text, text, boolean, jsonb, uuid) TO service_role;