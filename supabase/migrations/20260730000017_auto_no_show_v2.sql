-- auto_no_show_v2: mark expired confirmed reservations as no_show, free tables
CREATE OR REPLACE FUNCTION public.auto_no_show_v2()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
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
      updated_at = NOW()
    WHERE id = v_reservation.id;

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
      reservation_id, action, old_values, new_values
    ) VALUES (
      v_reservation.id, 'auto_no_show',
      jsonb_build_object('status', 'confirmed'),
      jsonb_build_object('status', 'no_show'),
      NULL
    );

    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'processed', v_count);
END;
$$;
