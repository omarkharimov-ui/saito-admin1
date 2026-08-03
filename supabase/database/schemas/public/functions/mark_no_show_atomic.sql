CREATE FUNCTION public.mark_no_show_atomic (
  p_reservation_id uuid,
  p_performed_by   uuid DEFAULT NULL::uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  AS $function$
DECLARE
  v_reservation RECORD;
BEGIN
  SELECT * INTO v_reservation FROM public.reservations WHERE id = p_reservation_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Reservation not found');
  END IF;

  IF v_reservation.status NOT IN ('pending', 'confirmed', 'waiting') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot mark no show in current status');
  END IF;

  UPDATE public.reservations SET
    status = 'no_show',
    updated_at = NOW()
  WHERE id = p_reservation_id;

  IF v_reservation.table_ids IS NOT NULL THEN
    UPDATE public.table_floors SET
      status = 'empty',
      reservation_id = NULL,
      reservation_name = NULL,
      reservation_phone = NULL,
      reservation_time = NULL,
      updated_at = NOW()
    WHERE table_number = ANY(
      CASE 
        WHEN jsonb_typeof(v_reservation.table_ids::jsonb) = 'array' THEN
          (SELECT array_agg(x::int) FROM jsonb_array_elements_text(v_reservation.table_ids::jsonb) AS x)
        ELSE ARRAY[]::INT[]
      END
    );
  END IF;

  INSERT INTO public.operation_logs (
    reservation_id, action, old_values, new_values, performed_by
  ) VALUES (
    p_reservation_id,
    'mark_no_show',
    jsonb_build_object('status', v_reservation.status),
    jsonb_build_object('status', 'no_show'),
    p_performed_by
  );

  RETURN jsonb_build_object('success', true);
END;
$function$;

GRANT ALL ON FUNCTION public.mark_no_show_atomic(uuid, uuid) TO anon;

GRANT ALL ON FUNCTION public.mark_no_show_atomic(uuid, uuid) TO authenticated;

GRANT ALL ON FUNCTION public.mark_no_show_atomic(uuid, uuid) TO service_role;