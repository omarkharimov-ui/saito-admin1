CREATE FUNCTION public.verify_manager_pin (
  p_pin text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
DECLARE
  v_admin RECORD;
BEGIN
  -- Check admin_users table
  SELECT id, role INTO v_admin
  FROM admin_users
  WHERE pin_hash = md5(p_pin)
    AND role IN ('admin', 'superadmin')
    AND is_active = true
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'valid', true,
      'staff_id', v_admin.id,
      'name', 'Manager',
      'role', v_admin.role
    );
  END IF;

  -- Fallback: check staff table
  SELECT id, name, role INTO v_admin
  FROM staff
  WHERE pin_hash = md5(p_pin)
    AND role IN ('admin', 'superadmin')
    AND is_active = true
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'error', 'Invalid manager PIN');
  END IF;

  RETURN jsonb_build_object(
    'valid', true,
    'staff_id', v_admin.id,
    'name', v_admin.name,
    'role', v_admin.role
  );
END;
$function$;

GRANT ALL ON FUNCTION public.verify_manager_pin(text) TO anon;

GRANT ALL ON FUNCTION public.verify_manager_pin(text) TO authenticated;

GRANT ALL ON FUNCTION public.verify_manager_pin(text) TO service_role;