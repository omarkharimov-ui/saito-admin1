CREATE FUNCTION public.fire_course_atomic (
  p_order_id     uuid,
  p_course       text,
  p_performed_by uuid DEFAULT NULL::uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
DECLARE
  v_updated INTEGER := 0;
BEGIN
  UPDATE order_items
  SET kitchen_status = 'preparing'
  WHERE order_id = p_order_id
    AND (course = p_course OR (course IS NULL AND p_course = 'main'))
    AND kitchen_status IN ('pending', 'accepted');

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  RETURN jsonb_build_object('success', true, 'updated_items', v_updated);
END;
$function$;

GRANT ALL ON FUNCTION public.fire_course_atomic(uuid, text, uuid) TO anon;

GRANT ALL ON FUNCTION public.fire_course_atomic(uuid, text, uuid) TO authenticated;

GRANT ALL ON FUNCTION public.fire_course_atomic(uuid, text, uuid) TO service_role;