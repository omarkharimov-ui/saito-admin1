CREATE FUNCTION public.undo_operation_v4 (
  p_log_id uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  AS $function$
DECLARE
  v_log RECORD;
BEGIN
  -- Check time limit (5 mins)
  SELECT * INTO v_log FROM operation_logs WHERE id = p_log_id AND created_at > now() - interval '5 minutes';
  
  IF v_log IS NULL THEN
    RAISE EXCEPTION 'UNDO_TIMEOUT_OR_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  -- Inverse Logic based on Type
  IF v_log.type = 'MERGE' THEN
    -- Restore relations (detach children)
    UPDATE orders SET group_id = NULL 
    WHERE table_number = ANY(ARRAY(SELECT jsonb_array_elements_text(v_log.payload->'children'))::integer[])
    AND group_id = (v_log.payload->>'group_id')::uuid;
    
    UPDATE table_floors SET merged_into_table = NULL 
    WHERE table_number = ANY(ARRAY(SELECT jsonb_array_elements_text(v_log.payload->'children'))::integer[]);
    
  ELSIF v_log.type = 'TRANSFER' THEN
    -- Inverse transfer
    UPDATE orders SET table_number = (v_log.payload->>'from')::integer 
    WHERE table_number = (v_log.payload->>'to')::integer AND status = 'confirmed';
    
    UPDATE table_floors SET status = 'empty' WHERE table_number = (v_log.payload->>'to')::integer;
    UPDATE table_floors SET status = 'occupied' WHERE table_number = (v_log.payload->>'from')::integer;
  END IF;

  -- Remove log after successful undo
  DELETE FROM operation_logs WHERE id = p_log_id;

  RETURN jsonb_build_object('success', true);
END;
$function$;

GRANT ALL ON FUNCTION public.undo_operation_v4(uuid) TO anon;

GRANT ALL ON FUNCTION public.undo_operation_v4(uuid) TO authenticated;

GRANT ALL ON FUNCTION public.undo_operation_v4(uuid) TO service_role;