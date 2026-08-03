CREATE FUNCTION public.saito_undo_table_operation (
  p_action       text,
  p_data         jsonb,
  p_performed_by uuid  DEFAULT NULL::uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  AS $function$
DECLARE
  v_now timestamptz := now();
  v_result jsonb;
BEGIN
  CASE p_action
    WHEN 'merge' THEN
      UPDATE orders
      SET merged_into = NULL,
          table_number = (p_data->>'table_number')::int,
          updated_at = v_now
      WHERE id = (p_data->>'order_id')::uuid;

      UPDATE table_floors
      SET status = 'occupied',
          total_amount = (SELECT COALESCE(SUM(total_amount), 0)
            FROM orders WHERE table_number = (p_data->>'table_number')::int AND status NOT IN ('paid', 'cancelled')),
          guest_count = (SELECT COALESCE(SUM(guest_count), 0)
            FROM orders WHERE table_number = (p_data->>'table_number')::int AND status NOT IN ('paid', 'cancelled'))
      WHERE table_number = (p_data->>'table_number')::int;

      -- Recalculate primary table
      UPDATE table_floors
      SET total_amount = (SELECT COALESCE(SUM(total_amount), 0)
          FROM orders WHERE table_number = (p_data->>'table_number')::int AND status NOT IN ('paid', 'cancelled')),
          guest_count = (SELECT COALESCE(SUM(guest_count), 0)
          FROM orders WHERE table_number = (p_data->>'table_number')::int AND status NOT IN ('paid', 'cancelled'))
      WHERE table_number = (SELECT table_number FROM orders WHERE id = ((p_data->>'merged_into')::uuid));

    WHEN 'transfer' THEN
      UPDATE orders
      SET table_number = (p_data->>'from_table')::int,
          merged_into = CASE WHEN (p_data->>'merged')::bool THEN (p_data->>'target_order_id')::uuid::text ELSE NULL END,
          updated_at = v_now
      WHERE id = (p_data->>'order_id')::uuid;

      UPDATE table_floors
      SET status = 'occupied', total_amount = (p_data->>'total_amount')::numeric, guest_count = (p_data->>'guest_count')::int
      WHERE table_number = (p_data->>'from_table')::int;

    WHEN 'split' THEN
      UPDATE orders
      SET total_amount = (p_data->>'total_amount')::numeric,
          guest_count = (p_data->>'guest_count')::int,
          updated_at = v_now
      WHERE id = (p_data->>'order_id')::uuid;

    ELSE
      RAISE EXCEPTION 'Unknown undo action: %', p_action;
  END CASE;

  INSERT INTO audit_log (table_name, record_id, action, old_data, new_data, changed_by)
  VALUES ('table_floors', p_data->>'table_number', 'undo_' || p_action, p_data, '{}'::jsonb, p_performed_by);

  SELECT jsonb_build_object('success', true) INTO v_result;
  RETURN v_result;
END;
$function$;

GRANT ALL ON FUNCTION public.saito_undo_table_operation(text, jsonb, uuid) TO anon;

GRANT ALL ON FUNCTION public.saito_undo_table_operation(text, jsonb, uuid) TO authenticated;

GRANT ALL ON FUNCTION public.saito_undo_table_operation(text, jsonb, uuid) TO service_role;