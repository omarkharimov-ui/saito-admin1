CREATE FUNCTION public.log_order_event (
  p_order_id      uuid,
  p_event_type    text,
  p_old_value     jsonb DEFAULT NULL::jsonb,
  p_new_value     jsonb DEFAULT NULL::jsonb,
  p_metadata      jsonb DEFAULT NULL::jsonb,
  p_performed_by  uuid  DEFAULT NULL::uuid,
  p_employee_name text  DEFAULT NULL::text,
  p_ip_address    text  DEFAULT NULL::text,
  p_device_id     text  DEFAULT NULL::text
)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
DECLARE
  v_event_id UUID;
BEGIN
  INSERT INTO order_events (
    order_id, event_type, old_value, new_value, metadata,
    performed_by, employee_name, ip_address, device_id, created_at
  ) VALUES (
    p_order_id, p_event_type::order_event_type,
    p_old_value, p_new_value, p_metadata,
    p_performed_by, p_employee_name, p_ip_address, p_device_id, now()
  )
  RETURNING id INTO v_event_id;

  RETURN v_event_id;
END;
$function$;

GRANT ALL ON FUNCTION public.log_order_event(uuid, text, jsonb, jsonb, jsonb, uuid, text, text, text) TO anon;

GRANT ALL ON FUNCTION public.log_order_event(uuid, text, jsonb, jsonb, jsonb, uuid, text, text, text) TO authenticated;

GRANT ALL ON FUNCTION public.log_order_event(uuid, text, jsonb, jsonb, jsonb, uuid, text, text, text) TO service_role;