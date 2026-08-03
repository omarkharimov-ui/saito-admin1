CREATE FUNCTION public.transfer_table_v4 (
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
BEGIN
  -- Validate target
  SELECT status INTO v_target_status FROM table_floors WHERE table_number = p_to_table FOR UPDATE;
  IF v_target_status != 'empty' THEN
    RAISE EXCEPTION 'TARGET_TABLE_NOT_EMPTY' USING ERRCODE = 'P0001';
  END IF;

  -- Move Orders
  UPDATE orders SET table_number = p_to_table 
  WHERE table_number = p_from_table AND status = 'confirmed';

  -- Sync Floors
  UPDATE table_floors SET status = 'empty', merged_into_table = NULL WHERE table_number = p_from_table;
  UPDATE table_floors SET status = 'occupied' WHERE table_number = p_to_table;

  RETURN jsonb_build_object('success', true);
END;
$function$;

GRANT ALL ON FUNCTION public.transfer_table_v4(integer, integer, uuid) TO anon;

GRANT ALL ON FUNCTION public.transfer_table_v4(integer, integer, uuid) TO authenticated;

GRANT ALL ON FUNCTION public.transfer_table_v4(integer, integer, uuid) TO service_role;