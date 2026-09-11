-- ============================================================================
-- 20260911000021 — FINAL GATE fixes (found by .es-gate.cjs, live-verified)
--
-- G-1 (CRITICAL): start_break_token inserted shift_breaks WITHOUT staff_id
--   (NOT NULL) → EVERY break-start failed. The S-02 token rewrite dropped the
--   staff_id the legacy start_break(uuid,text) had. Now sets staff_id.
--
-- G-2 (authz): /api/time-clock/[id]/status and /audit routes had NO
--   authentication → any unauthenticated/any-session client could read ANY
--   staff's clock status (hours, break, OT approach flags) via
--   get_time_clock_status(p_staff_id). These are READ routes so they are
--   fixed at the ROUTE layer (TS): requireAuth + self-or-timeclock.override
--   (same rule as the write RPCs). The RPC itself stays read-only.
--
-- GOLDEN RULE 5: auto-commit. Idempotent (OR REPLACE).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.start_break_token(
  p_token text,
  p_target_id uuid,
  p_break_type text DEFAULT 'unpaid'::text
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid;
  v_override boolean;
  v_shift RECORD;
  v_active_break RECORD;
  v_break_id uuid;
BEGIN
  PERFORM set_session_staff(p_token);
  v_actor := current_staff_id();
  v_override := (p_target_id IS DISTINCT FROM v_actor)
                AND coalesce(has_permission(v_actor, 'timeclock.override'), false);
  IF p_target_id IS DISTINCT FROM v_actor AND NOT v_override THEN
    INSERT INTO security_events (staff_id, event_type, success, metadata)
    VALUES (v_actor, 'permission_denied', false,
      jsonb_build_object('action', 'start_break', 'target', p_target_id));
    RETURN json_build_object('success', false, 'error', 'PERMISSION_DENIED');
  END IF;

  SELECT * INTO v_shift FROM shifts
  WHERE staff_id = p_target_id AND closed_at IS NULL
  ORDER BY opened_at DESC LIMIT 1;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'No active shift');
  END IF;

  SELECT * INTO v_active_break FROM shift_breaks
  WHERE shift_id = v_shift.id AND ended_at IS NULL;
  IF FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Break already in progress');
  END IF;

  -- G-1: staff_id is NOT NULL on shift_breaks (was missing → every break failed)
  -- G-3: shift_breaks.id is gen_random_uuid() (NO sequence) → currval() always
  --      crashed. Capture the id via RETURNING.
  INSERT INTO shift_breaks (staff_id, shift_id, break_type, started_at)
  VALUES (p_target_id, v_shift.id, p_break_type, NOW())
  RETURNING id INTO v_break_id;

  INSERT INTO time_clock_entries (staff_id, entry_type, source, timestamp)
  VALUES (p_target_id, 'break_start', 'pos_terminal', NOW());

  INSERT INTO time_clock_audit (action, performed_by, details)
  VALUES ('break_start', p_target_id, jsonb_build_object('break_type', p_break_type, 'actor', v_actor, 'override', v_override));

  RETURN json_build_object(
    'success', true, 'break_id', v_break_id,
    'override', v_override, 'started_at', NOW()
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.start_break_token(text, uuid, text) TO service_role;
