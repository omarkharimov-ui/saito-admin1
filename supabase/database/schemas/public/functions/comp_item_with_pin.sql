CREATE FUNCTION public.comp_item_with_pin (
  p_order_item_id uuid,
  p_reason        text,
  p_manager_pin   text,
  p_performed_by  uuid DEFAULT NULL::uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
DECLARE
  v_pin_result JSONB;
  v_manager_id UUID;
  v_manager_name TEXT;
BEGIN
  v_pin_result := verify_manager_pin(p_manager_pin);
  IF NOT (v_pin_result->>'valid')::BOOLEAN THEN
    RAISE EXCEPTION 'INVALID_MANAGER_PIN: %', v_pin_result->>'error' USING ERRCODE = 'P0001';
  END IF;

  v_manager_id := (v_pin_result->>'staff_id')::UUID;
  v_manager_name := v_pin_result->>'name';

  RETURN comp_order_item_atomic(
    p_order_item_id,
    p_reason || ' (Manager: ' || v_manager_name || ')',
    COALESCE(p_performed_by, v_manager_id)
  );
END;
$function$;

GRANT ALL ON FUNCTION public.comp_item_with_pin(uuid, text, text, uuid) TO anon;

GRANT ALL ON FUNCTION public.comp_item_with_pin(uuid, text, text, uuid) TO authenticated;

GRANT ALL ON FUNCTION public.comp_item_with_pin(uuid, text, text, uuid) TO service_role;