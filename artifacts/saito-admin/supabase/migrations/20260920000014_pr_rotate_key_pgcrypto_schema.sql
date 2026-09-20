-- 20260920000014 — pr v1 fix: key rotation — pgcrypto schema qualification
--
-- EVIDENCE (live, 2026-09-20, gate round 3): 000013's `gen_random_bytes(24::int)`
-- still raised 42883. Root cause: the pgcrypto extension is installed in the
-- `extensions` schema (Supabase layout); under SET search_path = 'public' the
-- unqualified call cannot resolve it (the column DEFAULT in 000011's DDL
-- context resolved it because the session search_path includes extensions).
-- Fix: schema-qualified extensions.gen_random_bytes().
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
  v_key := encode(extensions.gen_random_bytes(24), 'hex');
  UPDATE print_devices SET agent_key = v_key, updated_at = now() WHERE id = p_id;
  PERFORM log_audit('print_device_rotate_key', 'print_device', v_dev.id::text,
    p_staff_id, v_actor, NULL, _print_device_json(v_dev), NULL, NULL);
  RETURN jsonb_build_object('success', true, 'device', _print_device_json(v_dev),
    'agent_key', v_key);
END;
$function$;

COMMIT;
