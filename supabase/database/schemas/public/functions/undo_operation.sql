CREATE FUNCTION public.undo_operation (
  p_operation_log_id uuid,
  p_performed_by     uuid DEFAULT NULL::uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
DECLARE
  v_log RECORD;
BEGIN
  SELECT * INTO v_log FROM operation_logs WHERE id = p_operation_log_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'OPERATION_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;
  IF v_log.is_undone THEN
    RAISE EXCEPTION 'ALREADY_UNDONE' USING ERRCODE = 'P0001';
  END IF;
  IF v_log.undo_payload IS NULL THEN
    RAISE EXCEPTION 'NO_UNDO_PAYLOAD' USING ERRCODE = 'P0001';
  END IF;

  UPDATE operation_logs
  SET is_undone = true, undone_at = now(), undone_by = p_performed_by
  WHERE id = p_operation_log_id;

  RETURN jsonb_build_object(
    'success', true,
    'operation', v_log.operation,
    'undo_payload', v_log.undo_payload
  );
END;
$function$;

GRANT ALL ON FUNCTION public.undo_operation(uuid, uuid) TO anon;

GRANT ALL ON FUNCTION public.undo_operation(uuid, uuid) TO authenticated;

GRANT ALL ON FUNCTION public.undo_operation(uuid, uuid) TO service_role;