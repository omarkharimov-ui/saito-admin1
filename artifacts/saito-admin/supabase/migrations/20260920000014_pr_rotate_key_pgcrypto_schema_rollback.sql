-- Rollback for 20260920000014 — restores the 000013 version
-- (unqualified gen_random_bytes(24::int) — still crashes with 42883; do not
-- roll back unless 000011 itself is rolled back).
BEGIN;

CREATE OR REPLACE FUNCTION public.print_device_rotate_key(p_id uuid, p_staff_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $function$
DECLARE
  v_dev print_devices;
  v_key text;
  v_actor text;
BEGIN
  SELECT * INTO v_dev FROM print_devices WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Device not found');
  END IF;
  SELECT name INTO v_actor FROM staff WHERE id = p_staff_id;
  v_key := encode(gen_random_bytes(24::int), 'hex');
  UPDATE print_devices SET agent_key = v_key, updated_at = now() WHERE id = p_id;
  PERFORM log_audit('print_device_rotate_key', 'print_device', v_dev.id::text,
    p_staff_id, v_actor, NULL, _print_device_json(v_dev), NULL, NULL);
  RETURN jsonb_build_object('success', true, 'device', _print_device_json(v_dev),
    'agent_key', v_key);
END;
$function$;

COMMIT;
