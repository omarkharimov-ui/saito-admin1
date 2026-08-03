CREATE FUNCTION public.validate_transition (
  p_entity      text,
  p_from_status text,
  p_to_status   text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
DECLARE
  v_rule RECORD;
BEGIN
  SELECT * INTO v_rule
  FROM state_transitions
  WHERE entity = p_entity
    AND from_status = p_from_status
    AND to_status = p_to_status
    AND is_active = true;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'valid', false,
      'error', format('Invalid transition: %s → %s for %s', p_from_status, p_to_status, p_entity)
    );
  END IF;

  RETURN jsonb_build_object(
    'valid', true,
    'requires_role', v_rule.requires_role,
    'requires_manager_pin', v_rule.requires_manager_pin,
    'description', v_rule.description
  );
END;
$function$;

GRANT ALL ON FUNCTION public.validate_transition(text, text, text) TO anon;

GRANT ALL ON FUNCTION public.validate_transition(text, text, text) TO authenticated;

GRANT ALL ON FUNCTION public.validate_transition(text, text, text) TO service_role;