-- Create log_operation RPC for SSOT operation tracking
CREATE OR REPLACE FUNCTION public.log_operation (
  p_operation           text,
  p_order_id            uuid    DEFAULT NULL::uuid,
  p_source_table_number integer DEFAULT NULL::integer,
  p_target_table_number integer DEFAULT NULL::integer,
  p_old_state           jsonb   DEFAULT '{}'::jsonb,
  p_new_state           jsonb   DEFAULT '{}'::jsonb,
  p_undo_payload        jsonb   DEFAULT NULL::jsonb,
  p_performed_by        uuid    DEFAULT NULL::uuid,
  p_employee_name       text    DEFAULT NULL::text,
  p_reason              text    DEFAULT NULL::text,
  p_ip_address          text    DEFAULT NULL::text,
  p_device_id           text    DEFAULT NULL::text
)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
DECLARE
  v_log_id UUID;
BEGIN
  INSERT INTO operation_logs (
    operation, order_id, source_table_number, target_table_number,
    old_state, new_state, undo_payload,
    performed_by, employee_name, reason, ip_address, device_id, created_at
  ) VALUES (
    p_operation, p_order_id,
    p_source_table_number, p_target_table_number,
    p_old_state, p_new_state, p_undo_payload,
    p_performed_by, p_employee_name, p_reason, p_ip_address, p_device_id, now()
  )
  RETURNING id INTO v_log_id;

  RETURN v_log_id;
END;
$function$;

GRANT ALL ON FUNCTION public.log_operation(text, uuid, integer, integer, jsonb, jsonb, jsonb, uuid, text, text, text, text) TO service_role;
REVOKE ALL ON FUNCTION public.log_operation(text, uuid, integer, integer, jsonb, jsonb, jsonb, uuid, text, text, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.log_operation(text, uuid, integer, integer, jsonb, jsonb, jsonb, uuid, text, text, text, text) FROM authenticated;
