CREATE OR REPLACE FUNCTION public.reopen_order_with_pin (
  p_order_id     uuid,
  p_manager_pin  text,
  p_performed_by uuid DEFAULT NULL::uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
  DECLARE
  v_pin_result JSONB;
  v_manager_id UUID;
BEGIN
  PERFORM public.validate_actor(p_performed_by);
  v_pin_result := verify_manager_pin(p_manager_pin);
  IF NOT (v_pin_result->>'valid')::BOOLEAN THEN
    RAISE EXCEPTION 'INVALID_MANAGER_PIN: %', v_pin_result->>'error' USING ERRCODE = 'P0001';
  END IF;

  v_manager_id := (v_pin_result->>'staff_id')::UUID;

  RETURN reopen_order(p_order_id, COALESCE(p_performed_by, v_manager_id));
END;
$function$;



