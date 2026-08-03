CREATE FUNCTION public.saito_dismiss_table (
  p_table_number integer,
  p_performed_by uuid    DEFAULT NULL::uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
DECLARE
  v_order_ids UUID[];
  v_count INTEGER := 0;
BEGIN
  PERFORM 1 FROM table_floors WHERE table_number = p_table_number FOR UPDATE;

  SELECT array_agg(id)
  INTO v_order_ids
  FROM orders
  WHERE table_number = p_table_number
    AND status NOT IN ('paid', 'cancelled', 'closed')
  FOR UPDATE;

  IF v_order_ids IS NOT NULL AND array_length(v_order_ids, 1) IS NOT NULL THEN
    UPDATE orders
    SET
      status = 'cancelled',
      updated_at = now()
    WHERE id = ANY(v_order_ids);
  END IF;

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
    reservation_time = NULL,
    updated_at = now()
  WHERE table_number = p_table_number;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true,
    'table_number', p_table_number,
    'cancelled_orders', array_length(v_order_ids, 1),
    'updated_tables', v_count
  );
END;
$function$;

GRANT ALL ON FUNCTION public.saito_dismiss_table(integer, uuid) TO anon;

GRANT ALL ON FUNCTION public.saito_dismiss_table(integer, uuid) TO authenticated;

GRANT ALL ON FUNCTION public.saito_dismiss_table(integer, uuid) TO service_role;