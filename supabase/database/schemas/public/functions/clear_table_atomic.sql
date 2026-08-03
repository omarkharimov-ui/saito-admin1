CREATE FUNCTION public.clear_table_atomic (
  p_table_number integer,
  p_performed_by uuid    DEFAULT NULL::uuid,
  p_terminal_id  text    DEFAULT NULL::text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  AS $function$
DECLARE
  v_table RECORD;
BEGIN
  SELECT * INTO v_table FROM public.table_floors WHERE table_number = p_table_number FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Table not found');
  END IF;

  UPDATE public.table_floors SET
    status = 'empty',
    total_amount = 0,
    order_count = 0,
    guest_count = NULL,
    current_order_id = NULL,
    merged_into_table = NULL,
    reservation_id = NULL,
    reservation_name = NULL,
    reservation_phone = NULL,
    reservation_time = NULL,
    reservation_status_snapshot = NULL,
    reserved_at = NULL,
    reserved_until = NULL,
    has_pending = false,
    oldest_pending_at = NULL,
    bill_requested = false,
    updated_at = NOW(),
    updated_by_terminal_id = p_terminal_id
  WHERE table_number = p_table_number;

  INSERT INTO public.operation_logs (
    operation, order_id, source_table_number, old_state, new_state, performed_by, created_at
  ) VALUES (
    'clear_table',
    NULL,
    p_table_number,
    jsonb_build_object('status', v_table.status),
    jsonb_build_object('status', 'empty'),
    p_performed_by,
    NOW()
  );

  RETURN jsonb_build_object('success', true);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$function$;

GRANT ALL ON FUNCTION public.clear_table_atomic(integer, uuid, text) TO anon;

GRANT ALL ON FUNCTION public.clear_table_atomic(integer, uuid, text) TO authenticated;

GRANT ALL ON FUNCTION public.clear_table_atomic(integer, uuid, text) TO service_role;