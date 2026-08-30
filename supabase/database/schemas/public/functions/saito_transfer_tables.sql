CREATE OR REPLACE FUNCTION public.saito_transfer_tables (
  p_from_table   integer,
  p_to_table     integer,
  p_performed_by uuid    DEFAULT NULL::uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
DECLARE
  v_order_ids UUID[];
  v_total_amount NUMERIC := 0;
  v_total_guests INTEGER := 0;
BEGIN
  PERFORM public.validate_actor(p_performed_by);
  PERFORM 1 FROM table_floors WHERE table_number = p_from_table FOR UPDATE;
  PERFORM 1 FROM table_floors WHERE table_number = p_to_table FOR UPDATE;

  SELECT array_agg(id), COALESCE(SUM(total_amount), 0), COALESCE(SUM(guest_count), 0)
  INTO v_order_ids, v_total_amount, v_total_guests
  FROM orders
  WHERE table_number = p_from_table
    AND status NOT IN ('paid', 'cancelled', 'closed')
  FOR UPDATE;

  IF v_order_ids IS NULL OR array_length(v_order_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'NO_ACTIVE_ORDERS' USING ERRCODE = 'P0001';
  END IF;

  UPDATE orders
  SET
    table_number = p_to_table,
    version = COALESCE(version, 0) + 1
  WHERE id = ANY(v_order_ids);

  UPDATE table_floors
  SET
    status = 'occupied',
    total_amount = v_total_amount,
    guest_count = v_total_guests,
    merged_into_table = NULL,
    reservation_id = NULL,
    reservation_name = NULL,
    reservation_phone = NULL,
    reservation_time = NULL
  WHERE table_number = p_to_table;

  UPDATE table_floors
  SET
    status = 'empty',
    total_amount = 0,
    guest_count = NULL,
    order_count = 0,
    merged_into_table = NULL,
    reservation_id = NULL,
    reservation_name = NULL,
    reservation_phone = NULL,
    reservation_time = NULL
  WHERE table_number = p_from_table;

  RETURN jsonb_build_object(
    'success', true,
    'from_table', p_from_table,
    'to_table', p_to_table,
    'order_ids', v_order_ids,
    'total_amount', v_total_amount,
    'total_guests', v_total_guests
  );
END;
$function$;



