CREATE FUNCTION public.transfer_tables_v3 (
  p_from_table   integer,
  p_to_table     integer,
  p_performed_by uuid    DEFAULT NULL::uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  AS $function$
DECLARE
  v_target_status TEXT;
  v_order_ids UUID[];
  v_total_amount NUMERIC := 0;
  v_total_guests INTEGER := 0;
BEGIN
  -- Validate target
  SELECT status INTO v_target_status FROM table_floors WHERE table_number = p_to_table FOR UPDATE;
  IF v_target_status != 'empty' THEN
    RAISE EXCEPTION 'TARGET_TABLE_NOT_EMPTY' USING ERRCODE = 'P0001';
  END IF;

  -- Collect orders
  SELECT array_agg(id), SUM(total_amount), SUM(guest_count) 
  INTO v_order_ids, v_total_amount, v_total_guests
  FROM orders 
  WHERE table_number = p_from_table AND status NOT IN ('paid', 'cancelled', 'closed')
  FOR UPDATE;

  IF v_order_ids IS NULL THEN
    RAISE EXCEPTION 'SOURCE_TABLE_EMPTY' USING ERRCODE = 'P0001';
  END IF;

  -- Update orders
  UPDATE orders SET table_number = p_to_table, updated_at = now() WHERE id = ANY(v_order_ids);

  -- Update floors
  UPDATE table_floors SET 
    status = 'empty', guest_count = NULL, total_amount = 0, merged_into_table = NULL 
  WHERE table_number = p_from_table;

  UPDATE table_floors SET 
    status = 'occupied', guest_count = v_total_guests, total_amount = v_total_amount 
  WHERE table_number = p_to_table;

  RETURN jsonb_build_object('success', true, 'order_ids', v_order_ids);
END;
$function$;

GRANT ALL ON FUNCTION public.transfer_tables_v3(integer, integer, uuid) TO anon;

GRANT ALL ON FUNCTION public.transfer_tables_v3(integer, integer, uuid) TO authenticated;

GRANT ALL ON FUNCTION public.transfer_tables_v3(integer, integer, uuid) TO service_role;