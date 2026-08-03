CREATE FUNCTION public.move_reserved_table_atomic (
  p_reservation_id uuid,
  p_from_table_id  uuid,
  p_to_table_id    uuid,
  p_performed_by   uuid DEFAULT NULL::uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
DECLARE
  v_reservation RECORD;
  v_target_status TEXT;
  v_target_table_number INTEGER;
  v_from_table_number INTEGER;
BEGIN
  SELECT * INTO v_reservation FROM reservations WHERE id = p_reservation_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'RESERVATION_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  IF v_reservation.status NOT IN ('pending', 'confirmed') THEN
    RAISE EXCEPTION 'RESERVATION_NOT_MOVABLE' USING ERRCODE = 'P0001';
  END IF;

  SELECT status, table_number INTO v_target_status, v_target_table_number
  FROM table_floors WHERE id = p_to_table_id FOR UPDATE;

  IF v_target_status IS NULL THEN
    RAISE EXCEPTION 'TARGET_TABLE_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  IF v_target_status != 'empty' THEN
    RAISE EXCEPTION 'TARGET_TABLE_NOT_EMPTY' USING ERRCODE = 'P0001';
  END IF;

  SELECT table_number INTO v_from_table_number FROM table_floors WHERE id = p_from_table_id;

  -- Free source table
  UPDATE table_floors SET
    status = 'empty',
    reservation_id = NULL,
    reservation_name = NULL,
    reservation_phone = NULL,
    reservation_time = NULL,
    guest_count = NULL
  WHERE id = p_from_table_id;

  -- Reserve target table
  UPDATE table_floors SET
    status = 'reserved',
    reservation_id = p_reservation_id,
    reservation_name = v_reservation.name || v_reservation.customer_name,
    reservation_phone = v_reservation.phone,
    reservation_time = v_reservation.time,
    guest_count = v_reservation.guests
  WHERE id = p_to_table_id;

  -- Update reservation table_ids (replace from UUID with to UUID)
  UPDATE reservations SET
    table_ids = (
      SELECT jsonb_agg(elem)
      FROM jsonb_array_elements(table_ids) AS elem
      WHERE elem <> p_from_table_id::text
    ) || jsonb_build_array(p_to_table_id::text),
    updated_at = now()
  WHERE id = p_reservation_id;

  RETURN jsonb_build_object(
    'success', true,
    'from_table', v_from_table_number,
    'to_table', v_target_table_number,
    'reservation_id', p_reservation_id
  );
END;
$function$;

GRANT ALL ON FUNCTION public.move_reserved_table_atomic(uuid, uuid, uuid, uuid) TO anon;

GRANT ALL ON FUNCTION public.move_reserved_table_atomic(uuid, uuid, uuid, uuid) TO authenticated;

GRANT ALL ON FUNCTION public.move_reserved_table_atomic(uuid, uuid, uuid, uuid) TO service_role;