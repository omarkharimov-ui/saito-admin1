CREATE FUNCTION public.get_valid_transitions (
  p_entity         text,
  p_current_status text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
DECLARE
  v_result JSONB;
BEGIN
  SELECT jsonb_agg(jsonb_build_object(
    'to_status', to_status,
    'description', description,
    'requires_role', requires_role,
    'requires_manager_pin', requires_manager_pin
  )) INTO v_result
  FROM state_transitions
  WHERE entity = p_entity
    AND from_status = p_current_status
    AND is_active = true;

  RETURN jsonb_build_object(
    'entity', p_entity,
    'current_status', p_current_status,
    'transitions', COALESCE(v_result, '[]'::JSONB)
  );
END;
$function$;

GRANT ALL ON FUNCTION public.get_valid_transitions(text, text) TO anon;

GRANT ALL ON FUNCTION public.get_valid_transitions(text, text) TO authenticated;

GRANT ALL ON FUNCTION public.get_valid_transitions(text, text) TO service_role;