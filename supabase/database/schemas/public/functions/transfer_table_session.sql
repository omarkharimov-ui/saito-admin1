CREATE FUNCTION public.transfer_table_session (
  p_from_table_number integer,
  p_to_table_number   integer
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  AS $function$
DECLARE
  v_from_table RECORD;
  v_to_table RECORD;
  v_order RECORD;
  v_result JSONB;
BEGIN
  -- Lock both tables
  SELECT * INTO v_from_table FROM table_floors WHERE table_number = p_from_table_number FOR UPDATE;
  SELECT * INTO v_to_table FROM table_floors WHERE table_number = p_to_table_number FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'FROM_TABLE_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TO_TABLE_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  -- Move active orders from source to target
  UPDATE orders
  SET table_number = p_to_table_number,
      updated_at = now()
  WHERE table_number = p_from_table_number
    AND status NOT IN ('paid', 'cancelled');

  -- Merge cart items from from-table into to-table (if to-table has existing order)
  -- If to-table has no active order, create draft order from from-table's data

  -- Mark source table as empty
  UPDATE table_floors
  SET status = 'empty',
      reservation_id = NULL,
      reservation_name = NULL,
      reservation_phone = NULL,
      reservation_time = NULL,
      guest_count = NULL,
      total_amount = 0,
      order_count = 0,
      order_ids = '{}'::TEXT[],
      has_pending = false,
      oldest_pending_at = NULL,
      opened_at = NULL,
      merged_into_table = NULL,
      merged_orders = '[]'::JSONB,
      updated_at = now()
  WHERE table_number = p_from_table_number;

  -- Update target table to occupied if not already
  UPDATE table_floors
  SET status = 'occupied',
      updated_at = now()
  WHERE table_number = p_to_table_number
    AND status = 'empty';

  v_result := jsonb_build_object(
    'success', true,
    'from_table', p_from_table_number,
    'to_table', p_to_table_number
  );

  RETURN v_result;
END;
$function$;

GRANT ALL ON FUNCTION public.transfer_table_session(integer, integer) TO anon;

GRANT ALL ON FUNCTION public.transfer_table_session(integer, integer) TO authenticated;

GRANT ALL ON FUNCTION public.transfer_table_session(integer, integer) TO service_role;