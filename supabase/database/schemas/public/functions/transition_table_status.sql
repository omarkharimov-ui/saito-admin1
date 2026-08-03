CREATE FUNCTION public.transition_table_status (
  p_table_number  integer,
  p_new_status    text,
  p_performed_by  uuid    DEFAULT NULL::uuid,
  p_employee_name text    DEFAULT NULL::text,
  p_reason        text    DEFAULT NULL::text,
  p_metadata      jsonb   DEFAULT NULL::jsonb,
  p_undo_payload  jsonb   DEFAULT NULL::jsonb,
  p_ip_address    text    DEFAULT NULL::text,
  p_device_id     text    DEFAULT NULL::text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
DECLARE
  v_table RECORD;
  v_validation JSONB;
  v_old_status TEXT;
BEGIN
  -- 1. Lock and fetch table
  SELECT * INTO v_table FROM table_floors WHERE table_number = p_table_number FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TABLE_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  v_old_status := v_table.status;

  -- 2. Validate transition
  v_validation := validate_transition('table', v_old_status, p_new_status);
  IF NOT (v_validation->>'valid')::BOOLEAN THEN
    RAISE EXCEPTION 'INVALID_TRANSITION: %', v_validation->>'error' USING ERRCODE = 'P0001';
  END IF;

  -- 3. Apply transition
  UPDATE table_floors SET
    status = p_new_status,
    updated_at = now()
  WHERE table_number = p_table_number;

  -- 4. Clear reservation data when table becomes empty
  IF p_new_status = 'empty' THEN
    UPDATE table_floors SET
      reservation_id = NULL,
      reservation_name = NULL,
      reservation_phone = NULL,
      reservation_time = NULL,
      bill_requested = false
    WHERE table_number = p_table_number;
  END IF;

  -- 5. Log operation
  PERFORM log_operation(
    'status_change',
    NULL,
    p_table_number,
    NULL,
    jsonb_build_object('status', v_old_status),
    jsonb_build_object('status', p_new_status, 'reason', p_reason),
    p_undo_payload,
    p_performed_by,
    p_employee_name,
    p_reason,
    p_ip_address,
    p_device_id
  );

  -- 6. Audit log
  INSERT INTO audit_logs (table_name, record_id, action, old_data, new_data, performed_by, created_at)
  VALUES (
    'table_floors', v_table.id, 'status_change',
    jsonb_build_object('status', v_old_status, 'table_number', p_table_number),
    jsonb_build_object('status', p_new_status, 'reason', p_reason),
    p_performed_by, now()
  );

  RETURN jsonb_build_object(
    'success', true,
    'table_number', p_table_number,
    'old_status', v_old_status,
    'new_status', p_new_status
  );
END;
$function$;

GRANT ALL ON FUNCTION public.transition_table_status(integer, text, uuid, text, text, jsonb, jsonb, text, text) TO anon;

GRANT ALL ON FUNCTION public.transition_table_status(integer, text, uuid, text, text, jsonb, jsonb, text, text) TO authenticated;

GRANT ALL ON FUNCTION public.transition_table_status(integer, text, uuid, text, text, jsonb, jsonb, text, text) TO service_role;