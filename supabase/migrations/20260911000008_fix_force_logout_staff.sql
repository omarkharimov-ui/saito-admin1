-- ============================================================================
-- 20260911000008 — A-FREEZE: fix force_logout_staff (was COMPLETELY BROKEN)
--
-- Regression A11/A26 root cause: force_logout_staff called log_audit with the
-- WRONG signature (9 args, entity_id as text, but log_audit expects
-- (action, entity_type, entity_id, actor_id, actor_name, old_data, new_data,
-- metadata, ip_address) with the call passing positional args that did not
-- match) → "function log_audit(...) does not exist" → swallowed by the
-- generic EXCEPTION → returned success:false → **sessions were never revoked**
-- and **no audit row was written**. Force-logout did nothing.
--
-- Fix: correct log_audit call + explicit status='REVOKED' (validateAuth and
-- middleware now honor revoked_at/status — see api-auth.ts + middleware.ts).
--
-- GOLDEN RULE 5: auto-commit. Idempotent (DROP + CREATE, same signature).
-- ============================================================================

DROP FUNCTION IF EXISTS public.force_logout_staff(uuid, uuid);

CREATE OR REPLACE FUNCTION public.force_logout_staff(
  p_staff_id uuid,
  p_performed_by uuid
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE sessions SET status = 'REVOKED', revoked_at = now()
  WHERE user_id = p_staff_id AND status = 'ACTIVE';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  PERFORM public.log_audit(
    'force_logout', 'staff', p_staff_id::text, p_performed_by, NULL,
    NULL, NULL, jsonb_build_object('sessions_revoked', v_count), NULL
  );
  RETURN jsonb_build_object('success', true, 'staff_id', p_staff_id, 'sessions_revoked', v_count);
END;
$$;

GRANT EXECUTE ON FUNCTION public.force_logout_staff(uuid, uuid) TO service_role;
