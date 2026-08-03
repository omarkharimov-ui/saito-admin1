CREATE FUNCTION public.auto_no_show_v2()
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  AS $function$
DECLARE
  v_reservation RECORD;
  v_count INT := 0;
BEGIN
  FOR v_reservation IN
    SELECT * FROM public.reservations
    WHERE status = 'confirmed'
      AND date < CURRENT_DATE
    FOR UPDATE
  LOOP
    UPDATE public.reservations SET
      status = 'no_show',
      no_show_at = NOW(),
      updated_at = NOW()
    WHERE id = v_reservation.id;

    IF v_reservation.table_ids IS NOT NULL AND cardinality(v_reservation.table_ids) > 0 THEN
      UPDATE public.table_floors SET
        status = 'empty',
        reservation_id = NULL,
        reservation_name = NULL,
        reservation_phone = NULL,
        reservation_time = NULL,
        updated_at = NOW()
      WHERE table_number = ANY(v_reservation.table_ids);
    END IF;

    INSERT INTO public.operation_logs (
      operation, old_state, new_state
    ) VALUES (
      'auto_no_show',
      jsonb_build_object('status', 'confirmed'),
      jsonb_build_object('status', 'no_show')
    );

    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'processed', v_count);
END;
$function$;

GRANT ALL ON FUNCTION public.auto_no_show_v2() TO anon;

GRANT ALL ON FUNCTION public.auto_no_show_v2() TO authenticated;

GRANT ALL ON FUNCTION public.auto_no_show_v2() TO service_role;