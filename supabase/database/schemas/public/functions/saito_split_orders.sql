CREATE FUNCTION public.saito_split_orders (
  p_table_numbers integer[],
  p_performed_by  uuid      DEFAULT NULL::uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  AS $function$
DECLARE
  v_primary_table int;
  v_child_tables int[];
  v_split_orders uuid[];
  v_order RECORD;
  v_now timestamptz := now();
  v_result jsonb;
  v_subtract_total numeric := 0;
  v_subtract_guests int := 0;
BEGIN
  IF array_length(p_table_numbers, 1) < 2 THEN
    RAISE EXCEPTION 'Need at least 2 tables to split';
  END IF;

  v_primary_table := p_table_numbers[1];

  FOR i IN 2 .. array_length(p_table_numbers, 1) LOOP
    SELECT id, total_amount, guest_count INTO v_order
    FROM orders
    WHERE table_number = p_table_numbers[i] AND status NOT IN ('paid', 'cancelled')
    LIMIT 1;

    IF NOT FOUND THEN
      INSERT INTO orders (table_number, status, total_amount, guest_count, order_type, created_at, updated_at)
      VALUES (p_table_numbers[i], 'confirmed', 0, 0, 'dine_in', v_now, v_now)
      RETURNING id, total_amount, guest_count INTO v_order;
    END IF;

    -- Clear any merged_into reference
    UPDATE orders
    SET merged_into = NULL, updated_at = v_now
    WHERE id = v_order.id;

    v_subtract_total := v_subtract_total + v_order.total_amount;
    v_subtract_guests := v_subtract_guests + v_order.guest_count;
  END LOOP;

  -- Subtract split amounts from the primary order
  UPDATE orders
  SET total_amount = GREATEST(total_amount - v_subtract_total, 0),
      guest_count = GREATEST(guest_count - v_subtract_guests, 0),
      updated_at = v_now
  WHERE table_number = v_primary_table AND status NOT IN ('paid', 'cancelled');

  -- Refresh table floor totals
  FOR i IN 1 .. array_length(p_table_numbers, 1) LOOP
    UPDATE table_floors
    SET total_amount = (SELECT COALESCE(SUM(total_amount), 0)
        FROM orders WHERE table_number = p_table_numbers[i] AND status NOT IN ('paid', 'cancelled')),
        guest_count = (SELECT COALESCE(SUM(guest_count), 0)
        FROM orders WHERE table_number = p_table_numbers[i] AND status NOT IN ('paid', 'cancelled'))
    WHERE table_number = p_table_numbers[i];
  END LOOP;

  INSERT INTO audit_log (table_name, record_id, action, old_data, new_data, changed_by)
  VALUES ('orders'::text, v_primary_table::text, 'split'::text, '{}'::jsonb,
    jsonb_build_object('tables', p_table_numbers, 'subtract_total', v_subtract_total),
    p_performed_by);

  SELECT jsonb_build_object('split_count', array_length(p_table_numbers, 1)) INTO v_result;
  RETURN v_result;
END;
$function$;

GRANT ALL ON FUNCTION public.saito_split_orders(integer[], uuid) TO anon;

GRANT ALL ON FUNCTION public.saito_split_orders(integer[], uuid) TO authenticated;

GRANT ALL ON FUNCTION public.saito_split_orders(integer[], uuid) TO service_role;