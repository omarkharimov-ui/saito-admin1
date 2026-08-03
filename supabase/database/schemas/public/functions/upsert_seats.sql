CREATE FUNCTION public.upsert_seats (
  p_table_number integer,
  p_seats        jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
DECLARE
  v_seat JSONB;
  v_result JSONB := '[]'::JSONB;
  v_seat_id UUID;
BEGIN
  FOR v_seat IN SELECT * FROM jsonb_array_elements(p_seats)
  LOOP
    INSERT INTO seats (table_number, seat_number, label, sort_order)
    VALUES (
      p_table_number,
      (v_seat->>'seat_number')::INTEGER,
      v_seat->>'label',
      COALESCE((v_seat->>'sort_order')::INTEGER, 0)
    )
    ON CONFLICT (table_number, seat_number)
    DO UPDATE SET
      label = EXCLUDED.label,
      sort_order = EXCLUDED.sort_order,
      updated_at = now()
    RETURNING id INTO v_seat_id;

    v_result := v_result || jsonb_build_object(
      'id', v_seat_id,
      'seat_number', (v_seat->>'seat_number')::INTEGER,
      'label', v_seat->>'label'
    );
  END LOOP;

  RETURN jsonb_build_object('success', true, 'seats', v_result);
END;
$function$;

GRANT ALL ON FUNCTION public.upsert_seats(integer, jsonb) TO anon;

GRANT ALL ON FUNCTION public.upsert_seats(integer, jsonb) TO authenticated;

GRANT ALL ON FUNCTION public.upsert_seats(integer, jsonb) TO service_role;