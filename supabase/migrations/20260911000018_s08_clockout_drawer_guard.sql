-- ============================================================================
-- 20260911000018 — S-08 gap (found in FINAL GATE): clock-out paths must not
-- close a shift that still has an OPEN bound cash drawer.
--
-- Rationale (frozen 1:1 + "bind & derive"): the drawer-close
-- (close_cash_register_v2) is what derives the shift's expected_cash and
-- auto-closes the shift. If a plain clock-out closed the shift first, the
-- drawer would lose its shift target → orphan drawer / expected_cash not
-- derived (violates residue invariant "orphan drawer sessions = 0").
-- close_shift already refuses while a drawer is open; now clock_out_token and
-- clock_out_atomic_token do too, so the invariant holds on EVERY close path.
--
-- Identity/override/atomic logic unchanged. GOLDEN RULE 5: auto-commit.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- clock_out_token — + drawer-open guard (before closing the shift)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.clock_out_token(
  p_token text,
  p_target_id uuid,
  p_notes text DEFAULT NULL::text
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid; v_override boolean; v_latest_entry RECORD; v_active_break RECORD;
  v_shifts uuid[]; v_sid uuid; v_open_loc uuid; v_tz text; v_drawer uuid;
BEGIN
  PERFORM set_session_staff(p_token);
  v_actor := current_staff_id();
  v_override := (p_target_id IS DISTINCT FROM v_actor)
                AND coalesce(has_permission(v_actor, 'timeclock.override'), false);
  IF p_target_id IS DISTINCT FROM v_actor AND NOT v_override THEN
    INSERT INTO security_events (staff_id, event_type, success, metadata)
    VALUES (v_actor, 'permission_denied', false, jsonb_build_object('action', 'clock_out', 'target', p_target_id));
    RETURN json_build_object('success', false, 'error', 'PERMISSION_DENIED');
  END IF;

  SELECT location_id INTO v_open_loc FROM shifts
  WHERE staff_id = p_target_id AND closed_at IS NULL
  ORDER BY opened_at DESC LIMIT 1;
  IF v_open_loc IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Not clocked in');
  END IF;

  -- S-08: a shift with an OPEN bound drawer must be closed via the drawer
  -- (close_cash_register_v2) so expected_cash is derived and the shift closes
  -- atomically. Refuse plain clock-out to preserve the 1:1 / no-orphan rule.
  SELECT id INTO v_drawer FROM cash_drawer_sessions
  WHERE shift_id = (SELECT id FROM shifts WHERE staff_id=p_target_id AND closed_at IS NULL ORDER BY opened_at DESC LIMIT 1)
    AND status = 'open';
  IF FOUND THEN
    RETURN json_build_object('success', false, 'error', 'DRAWER_OPEN', 'drawer_id', v_drawer);
  END IF;

  v_tz := COALESCE((SELECT timezone FROM locations WHERE id = v_open_loc), current_setting('TimeZone'));

  SELECT * INTO v_latest_entry FROM time_clock_entries
  WHERE staff_id = p_target_id
    AND timestamp > (public.local_day(now(), v_open_loc)::timestamp AT TIME ZONE v_tz)
  ORDER BY timestamp DESC LIMIT 1;
  IF v_latest_entry IS NULL OR v_latest_entry.entry_type = 'clock_out' THEN
    RETURN json_build_object('success', false, 'error', 'Not clocked in');
  END IF;

  SELECT * INTO v_active_break FROM shift_breaks sb JOIN shifts s ON s.id = sb.shift_id
  WHERE s.staff_id = p_target_id AND sb.ended_at IS NULL;
  IF FOUND THEN
    UPDATE shift_breaks SET ended_at = NOW() WHERE id = v_active_break.id;
    INSERT INTO time_clock_entries (staff_id, entry_type, source, timestamp)
    VALUES (p_target_id, 'break_end', 'pos_terminal', NOW());
  END IF;

  SELECT array_agg(id) INTO v_shifts FROM shifts WHERE staff_id = p_target_id AND closed_at IS NULL;
  UPDATE shifts SET closed_at = NOW(), notes = COALESCE(p_notes, notes)
  WHERE staff_id = p_target_id AND closed_at IS NULL;

  INSERT INTO time_clock_entries (staff_id, entry_type, pin_verified, notes, source, timestamp)
  VALUES (p_target_id, 'clock_out', true, p_notes, 'pos_terminal', NOW());

  IF v_shifts IS NOT NULL THEN
    FOREACH v_sid IN ARRAY v_shifts LOOP
      BEGIN PERFORM public.calculate_shift_overtime(v_sid); EXCEPTION WHEN OTHERS THEN NULL; END;
    END LOOP;
  END IF;

  INSERT INTO time_clock_audit (action, performed_by, details)
  VALUES ('clock_out', p_target_id, jsonb_build_object('notes', p_notes, 'actor', v_actor, 'override', v_override, 'pin_verified_by', 'route_verifyPin'));

  RETURN json_build_object('success', true, 'override', v_override, 'timestamp', NOW());
END;
$$;
GRANT EXECUTE ON FUNCTION public.clock_out_token(text, uuid, text) TO service_role;

-- ----------------------------------------------------------------------------
-- clock_out_atomic_token — + drawer-open guard
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
  v_actor uuid; v_target uuid; v_override boolean;
  v_staff staff%ROWTYPE; v_open_shift shifts%ROWTYPE; v_result shifts%ROWTYPE; v_ot jsonb; v_drawer uuid;
BEGIN
  PERFORM set_session_staff(p_token);
  v_actor := current_staff_id();
  v_target := COALESCE(p_target_id, v_actor);
  v_override := (v_target IS DISTINCT FROM v_actor) AND coalesce(has_permission(v_actor, 'timeclock.override'), false);
  IF v_target IS DISTINCT FROM v_actor AND NOT v_override THEN
    INSERT INTO security_events (staff_id, event_type, success, metadata)
    VALUES (v_actor, 'permission_denied', false, jsonb_build_object('action', 'clock_out_atomic', 'target', v_target));
    RETURN jsonb_build_object('success', false, 'error', 'PERMISSION_DENIED');
  END IF;
  SELECT * INTO v_staff FROM staff WHERE id = v_target FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'STAFF_NOT_FOUND'); END IF;
  IF NOT v_staff.is_active THEN RETURN jsonb_build_object('success', false, 'error', 'STAFF_INACTIVE'); END IF;
  SELECT * INTO v_open_shift FROM shifts WHERE staff_id = v_target AND closed_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'NO_OPEN_SHIFT'); END IF;

  -- S-08: refuse to close a shift that still has an OPEN bound drawer.
  SELECT id INTO v_drawer FROM cash_drawer_sessions
  WHERE shift_id = v_open_shift.id AND status = 'open';
  IF FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'DRAWER_OPEN', 'drawer_id', v_drawer);
  END IF;

  UPDATE shifts SET closed_at = now(), notes = CASE WHEN notes IS NULL OR notes = '' THEN p_notes ELSE notes || ' | ' || p_notes END, updated_at = now()
  WHERE id = v_open_shift.id RETURNING * INTO v_result;

  BEGIN
    v_ot := public.calculate_shift_overtime(v_result.id);
  EXCEPTION WHEN OTHERS THEN
    v_ot := jsonb_build_object('success', false, 'error', SQLERRM);
  END;

  -- log_audit(p_action, p_entity_type, p_entity_id, p_actor_id, p_actor_name,
  --           p_old_data, p_new_data, p_metadata, p_ip_address) — 9 params.
  -- (Bug fix: the S-04 rewrite passed 10 args → runtime crash on every close.)
  PERFORM log_audit('clock_out'::text, 'staff'::text, v_target::text, v_actor, NULL::text,
    jsonb_build_object('shift_id', v_open_shift.id, 'override', v_override),
    jsonb_build_object('shift_id', v_result.id, 'closed_at', now(), 'overtime', v_ot),
    NULL::jsonb, NULL::text);
  RETURN jsonb_build_object('success', true, 'shift_id', v_result.id::text, 'staff_id', v_target, 'override', v_override, 'closed_at', now(), 'overtime', v_ot);
END;
$$;
GRANT EXECUTE ON FUNCTION public.clock_out_atomic_token(text, uuid, text) TO service_role;
