CREATE FUNCTION public.remove_table_from_reservation (
  p_reservation_id uuid,
  p_table_id       uuid,
  p_performed_by   uuid DEFAULT NULL::uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
DECLARE
  v_reservation RECORD;
  v_table_number INTEGER;
BEGIN
  SELECT * INTO v_reservation FROM reservations WHERE id = p_reservation_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'RESERVATION_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  IF v_reservation.status NOT IN ('pending', 'confirmed') THEN
    RAISE EXCEPTION 'RESERVATION_NOT_MOVABLE' USING ERRCODE = 'P0001';
  END IF;

  SELECT table_number INTO v_table_number FROM table_floors WHERE id = p_table_id;

  IF v_table_number IS NULL THEN
    RAISE EXCEPTION 'TABLE_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  -- Free the table
  UPDATE table_floors SET
    status = 'empty',
    reservation_id = NULL,
    reservation_name = NULL,
    reservation_phone = NULL,
    reservation_time = NULL,
    guest_count = NULL
  WHERE id = p_table_id;

  -- Remove from reservation table_ids
  UPDATE reservations SET
    table_ids = (
      SELECT jsonb_agg(elem)
      FROM jsonb_array_elements(table_ids) AS elem
      WHERE elem <> p_table_id::text
    ),
    updated_at = now()
  WHERE id = p_reservation_id;

  RETURN jsonb_build_object(
    'success', true,
    'removed_table', v_table_number,
    'reservation_id', p_reservation_id
  );
END;
$function$;

GRANT ALL ON FUNCTION public.remove_table_from_reservation(uuid, uuid, uuid) TO anon;

GRANT ALL ON FUNCTION public.remove_table_from_reservation(uuid, uuid, uuid) TO authenticated;

GRANT ALL ON FUNCTION public.remove_table_from_reservation(uuid, uuid, uuid) TO service_role;