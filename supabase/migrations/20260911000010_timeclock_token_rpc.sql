-- ============================================================================
-- 20260911000010 — S-02: time-clock IDOR fix — token-bound RPCs (STEP 1/3)
--
-- ROOT CAUSE (ES_FOUNDATION_CURRENT_STATE §S-02): /api/time-clock/[id]/* and
-- /api/staff/clock called service-role RPCs with CALLER-SUPPLIED staff id and
-- no authorization → any valid session could clock in/out/break ANY staff.
--
-- FIX (frozen contract: self + manager with `timeclock.override`):
-- New *_token RPCs. Identity = session token (set_session_staff → current_staff_id,
-- the A-frozen authoritative chain — caller NEVER supplies who they are).
-- Target rule: p_target_id = self  OR  actor has 'timeclock.override'.
-- Override actions are audited with the actor in details (forensics).
-- PIN check preserved where the legacy fn had it (S-03 PIN-model unification
-- is a separate frozen item; not changed here).
--
-- STEP 2/3 (routes) + STEP 3/3 (DROP legacy uuid-identity RPCs) follow —
-- legacy DROP only after routes are switched, so no broken window.
--
-- GOLDEN RULE 5: auto-commit. Idempotent (OR REPLACE).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- clock_in_token(p_token, p_target_id, p_pin, p_source)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.clock_in_token(
  p_token text,
  p_target_id uuid,
  p_pin text,
  p_source text DEFAULT 'pos_terminal'::text
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid;
  v_override boolean;
  v_staff RECORD;
  v_latest_entry RECORD;
  v_shift_id UUID;
  v_loc uuid;
BEGIN
  PERFORM set_session_staff(p_token);
  v_actor := current_staff_id();

  v_override := (p_target_id IS DISTINCT FROM v_actor)
                AND coalesce(has_permission(v_actor, 'timeclock.override'), false);
  IF p_target_id IS DISTINCT FROM v_actor AND NOT v_override THEN
    INSERT INTO security_events (staff_id, event_type, success, metadata)
    VALUES (v_actor, 'permission_denied', false,
      jsonb_build_object('action', 'clock_in', 'target', p_target_id));
    RETURN json_build_object('success', false, 'error', 'PERMISSION_DENIED');
  END IF;

  IF p_pin IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'PIN_REQUIRED');
  END IF;

  SELECT * INTO v_staff FROM staff WHERE id = p_target_id AND is_active = true;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Staff not found or inactive');
  END IF;

  IF v_staff.pin_hash != md5(p_pin) THEN
    INSERT INTO time_clock_audit (action, performed_by, details)
    VALUES ('failed_clock_in', p_target_id, jsonb_build_object('reason', 'invalid_pin', 'actor', v_actor));
    RETURN json_build_object('success', false, 'error', 'Invalid PIN');
  END IF;

  SELECT * INTO v_latest_entry FROM time_clock_entries
  WHERE staff_id = p_target_id AND timestamp > CURRENT_DATE
  ORDER BY timestamp DESC LIMIT 1;
  IF v_latest_entry.entry_type IN ('clock_in', 'break_end') THEN
    RETURN json_build_object('success', false, 'error', 'Already clocked in');
  END IF;

  SELECT l.location_id INTO v_loc
  FROM staff_locations l
  WHERE l.staff_id = v_staff.id AND l.active = true
    AND (l.is_primary = true OR NOT EXISTS (
        SELECT 1 FROM staff_locations l2
        WHERE l2.staff_id = v_staff.id AND l2.active = true AND l2.is_primary = true))
  LIMIT 1;
  IF v_loc IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'NO_LOCATION_ASSIGNED');
  END IF;

  INSERT INTO shifts (staff_id, opened_at, starting_cash, organization_id, location_id)
  VALUES (v_staff.id, NOW(), 0, v_staff.organization_id, v_loc)
  RETURNING id INTO v_shift_id;

  INSERT INTO time_clock_entries (staff_id, entry_type, pin_verified, source, timestamp)
  VALUES (v_staff.id, 'clock_in', true, p_source, NOW());

  INSERT INTO time_clock_audit (action, performed_by, details)
  VALUES ('clock_in', v_staff.id,
    jsonb_build_object('shift_id', v_shift_id, 'location_id', v_loc,
                       'actor', v_actor, 'override', v_override));

  RETURN json_build_object(
    'success', true, 'shift_id', v_shift_id, 'staff_name', v_staff.full_name,
    'location_id', v_loc, 'override', v_override, 'timestamp', NOW()
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- clock_out_token(p_token, p_target_id, p_pin, p_notes)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.clock_out_token(
  p_token text,
  p_target_id uuid,
  p_pin text,
  p_notes text DEFAULT NULL::text
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid;
  v_override boolean;
  v_latest_entry RECORD;
  v_active_break RECORD;
BEGIN
  PERFORM set_session_staff(p_token);
  v_actor := current_staff_id();
  v_override := (p_target_id IS DISTINCT FROM v_actor)
                AND coalesce(has_permission(v_actor, 'timeclock.override'), false);
  IF p_target_id IS DISTINCT FROM v_actor AND NOT v_override THEN
    INSERT INTO security_events (staff_id, event_type, success, metadata)
    VALUES (v_actor, 'permission_denied', false,
      jsonb_build_object('action', 'clock_out', 'target', p_target_id));
    RETURN json_build_object('success', false, 'error', 'PERMISSION_DENIED');
  END IF;

  IF p_pin IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'PIN_REQUIRED');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM staff WHERE id = p_target_id AND pin_hash = md5(p_pin)) THEN
    RETURN json_build_object('success', false, 'error', 'Invalid PIN');
  END IF;

  SELECT * INTO v_latest_entry FROM time_clock_entries
  WHERE staff_id = p_target_id AND timestamp > CURRENT_DATE
  ORDER BY timestamp DESC LIMIT 1;
  IF v_latest_entry IS NULL OR v_latest_entry.entry_type = 'clock_out' THEN
    RETURN json_build_object('success', false, 'error', 'Not clocked in');
  END IF;

  SELECT * INTO v_active_break FROM shift_breaks sb
  JOIN shifts s ON s.id = sb.shift_id
  WHERE s.staff_id = p_target_id AND sb.ended_at IS NULL;
  IF FOUND THEN
    UPDATE shift_breaks SET ended_at = NOW() WHERE id = v_active_break.id;
    INSERT INTO time_clock_entries (staff_id, entry_type, source, timestamp)
    VALUES (p_target_id, 'break_end', 'pos_terminal', NOW());
  END IF;

  UPDATE shifts SET closed_at = NOW(), notes = COALESCE(p_notes, notes)
  WHERE staff_id = p_target_id AND closed_at IS NULL;

  INSERT INTO time_clock_entries (staff_id, entry_type, pin_verified, notes, source, timestamp)
  VALUES (p_target_id, 'clock_out', true, p_notes, 'pos_terminal', NOW());

  INSERT INTO time_clock_audit (action, performed_by, details)
  VALUES ('clock_out', p_target_id, jsonb_build_object('notes', p_notes, 'actor', v_actor, 'override', v_override));

  RETURN json_build_object('success', true, 'override', v_override, 'timestamp', NOW());
END;
$$;

-- ----------------------------------------------------------------------------
-- start_break_token(p_token, p_target_id, p_break_type)
-- ----------------------------------------------------------------------------
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

  INSERT INTO shift_breaks (shift_id, break_type, started_at)
  VALUES (v_shift.id, p_break_type, NOW());

  INSERT INTO time_clock_entries (staff_id, entry_type, source, timestamp)
  VALUES (p_target_id, 'break_start', 'pos_terminal', NOW());

  INSERT INTO time_clock_audit (action, performed_by, details)
  VALUES ('break_start', p_target_id, jsonb_build_object('break_type', p_break_type, 'actor', v_actor, 'override', v_override));

  RETURN json_build_object(
    'success', true, 'break_id', currval('shift_breaks_id_seq'),
    'override', v_override, 'started_at', NOW()
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- end_break_token(p_token, p_target_id)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.end_break_token(
  p_token text,
  p_target_id uuid
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid;
  v_override boolean;
  v_shift RECORD;
  v_break RECORD;
  v_duration INTEGER;
BEGIN
  PERFORM set_session_staff(p_token);
  v_actor := current_staff_id();
  v_override := (p_target_id IS DISTINCT FROM v_actor)
                AND coalesce(has_permission(v_actor, 'timeclock.override'), false);
  IF p_target_id IS DISTINCT FROM v_actor AND NOT v_override THEN
    INSERT INTO security_events (staff_id, event_type, success, metadata)
    VALUES (v_actor, 'permission_denied', false,
      jsonb_build_object('action', 'end_break', 'target', p_target_id));
    RETURN json_build_object('success', false, 'error', 'PERMISSION_DENIED');
  END IF;

  SELECT * INTO v_shift FROM shifts
  WHERE staff_id = p_target_id AND closed_at IS NULL
  ORDER BY opened_at DESC LIMIT 1;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'No active shift');
  END IF;

  SELECT * INTO v_break FROM shift_breaks
  WHERE shift_id = v_shift.id AND ended_at IS NULL;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'No active break');
  END IF;

  UPDATE shift_breaks SET ended_at = NOW() WHERE id = v_break.id;
  v_duration := EXTRACT(EPOCH FROM (NOW() - v_break.started_at)) / 60;
  IF v_duration > 30 AND v_break.break_type = 'unpaid' THEN
    UPDATE shift_breaks SET is_compliant = false, violation_reason = 'Break exceeded 30 minutes'
    WHERE id = v_break.id;
  END IF;

  INSERT INTO time_clock_entries (staff_id, entry_type, source, timestamp)
  VALUES (p_target_id, 'break_end', 'pos_terminal', NOW());

  INSERT INTO time_clock_audit (action, performed_by, details)
  VALUES ('break_end', p_target_id, jsonb_build_object('duration_minutes', v_duration, 'actor', v_actor, 'override', v_override));

  RETURN json_build_object('success', true, 'duration_minutes', v_duration, 'override', v_override, 'ended_at', NOW());
END;
$$;

-- ----------------------------------------------------------------------------
-- clock_in_atomic_token(p_token, p_target_id) — NO-PIN clock-in (POS/cash).
-- Identity = session token. Target = p_target_id (NULL = self).
-- Allowed: self OR actor has timeclock.override (frozen contract).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.clock_in_atomic_token(
  p_token text,
  p_target_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid;
  v_target uuid;
  v_override boolean;
  v_staff staff%ROWTYPE;
  v_open_shift shifts%ROWTYPE;
  v_result shifts%ROWTYPE;
  v_loc uuid;
BEGIN
  PERFORM set_session_staff(p_token);
  v_actor := current_staff_id();
  v_target := COALESCE(p_target_id, v_actor);

  v_override := (v_target IS DISTINCT FROM v_actor)
                AND coalesce(has_permission(v_actor, 'timeclock.override'), false);
  IF v_target IS DISTINCT FROM v_actor AND NOT v_override THEN
    INSERT INTO security_events (staff_id, event_type, success, metadata)
    VALUES (v_actor, 'permission_denied', false,
      jsonb_build_object('action', 'clock_in_atomic', 'target', v_target));
    RETURN jsonb_build_object('success', false, 'error', 'PERMISSION_DENIED');
  END IF;

  SELECT * INTO v_staff FROM staff WHERE id = v_target FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'STAFF_NOT_FOUND');
  END IF;
  IF NOT v_staff.is_active THEN
    RETURN jsonb_build_object('success', false, 'error', 'STAFF_INACTIVE');
  END IF;

  SELECT * INTO v_open_shift FROM shifts
  WHERE staff_id = v_target AND closed_at IS NULL FOR UPDATE;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'success', false, 'error', 'ALREADY_CLOCKED_IN',
      'shift_id', v_open_shift.id, 'opened_at', v_open_shift.opened_at
    );
  END IF;

  SELECT l.location_id INTO v_loc
  FROM staff_locations l
  WHERE l.staff_id = v_target AND l.active = true
    AND (l.is_primary = true OR NOT EXISTS (
        SELECT 1 FROM staff_locations l2
        WHERE l2.staff_id = v_target AND l2.active = true AND l2.is_primary = true))
  LIMIT 1;
  IF v_loc IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'NO_LOCATION_ASSIGNED');
  END IF;

  INSERT INTO shifts (staff_id, opened_at, organization_id, location_id)
  VALUES (v_target, now(), v_staff.organization_id, v_loc)
  RETURNING * INTO v_result;

  PERFORM log_audit(
    'clock_in'::text, 'staff'::text, v_target::text, v_actor, NULL::text,
    jsonb_build_object('shift_id', v_result.id, 'location_id', v_loc, 'override', v_override),
    NULL::jsonb, NULL::jsonb, NULL::text
  );

  RETURN jsonb_build_object(
    'success', true, 'shift_id', v_result.id::text, 'staff_id', v_target,
    'location_id', v_loc, 'override', v_override, 'opened_at', now()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.clock_in_token(text, uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.clock_out_token(text, uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.start_break_token(text, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.end_break_token(text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.clock_in_atomic_token(text, uuid) TO service_role;

-- ----------------------------------------------------------------------------
-- clock_out_atomic_token(p_token, p_target_id) — NO-PIN close of open shift.
-- Identity = session token; target = self OR timeclock.override (frozen).
-- Closes the single open shift (FOR UPDATE); appends note; audits.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.clock_out_atomic_token(
  p_token text,
  p_target_id uuid DEFAULT NULL,
  p_notes text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid;
  v_target uuid;
  v_override boolean;
  v_staff staff%ROWTYPE;
  v_open_shift shifts%ROWTYPE;
  v_result shifts%ROWTYPE;
BEGIN
  PERFORM set_session_staff(p_token);
  v_actor := current_staff_id();
  v_target := COALESCE(p_target_id, v_actor);

  v_override := (v_target IS DISTINCT FROM v_actor)
                AND coalesce(has_permission(v_actor, 'timeclock.override'), false);
  IF v_target IS DISTINCT FROM v_actor AND NOT v_override THEN
    INSERT INTO security_events (staff_id, event_type, success, metadata)
    VALUES (v_actor, 'permission_denied', false,
      jsonb_build_object('action', 'clock_out_atomic', 'target', v_target));
    RETURN jsonb_build_object('success', false, 'error', 'PERMISSION_DENIED');
  END IF;

  SELECT * INTO v_staff FROM staff WHERE id = v_target FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'STAFF_NOT_FOUND');
  END IF;
  IF NOT v_staff.is_active THEN
    RETURN jsonb_build_object('success', false, 'error', 'STAFF_INACTIVE');
  END IF;

  SELECT * INTO v_open_shift FROM shifts
  WHERE staff_id = v_target AND closed_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'NO_OPEN_SHIFT');
  END IF;

  UPDATE shifts SET closed_at = now(),
      notes = CASE WHEN notes IS NULL OR notes = '' THEN p_notes
                   ELSE notes || ' | ' || p_notes END,
      updated_at = now()
  WHERE id = v_open_shift.id RETURNING * INTO v_result;

  PERFORM log_audit(
    'clock_out'::text, 'staff'::text, v_target::text, v_actor, NULL::text,
    jsonb_build_object('shift_id', v_open_shift.id, 'override', v_override),
    jsonb_build_object('shift_id', v_result.id, 'closed_at', now()),
    NULL::jsonb, NULL::jsonb, NULL::text
  );

  RETURN jsonb_build_object(
    'success', true, 'shift_id', v_result.id::text, 'staff_id', v_target,
    'override', v_override, 'closed_at', now()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.clock_out_atomic_token(text, uuid, text) TO service_role;
