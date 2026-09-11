-- ============================================================================
-- 20260911000020 — GATE-CRITICAL: serialize open-shift creation (advisory lock)
--
-- FOUND BY CONCURRENCY BATTERY: under READ COMMITTED, trg_shift_no_overlap's
-- count query cannot see the other txn's UNCOMMITTED open shift, so two
-- parallel clock-ins of the same staff BOTH insert -> 2 open shifts (1-open
-- invariant violated). The trigger is a constraint, not a lock.
-- pg_advisory_xact_lock(hashtext(staff_id)) on the 3 open-shift insert paths
-- serializes per-staff; the second then sees the committed open shift and
-- rejects. Lock is xact-scoped (released on commit). Identity/override/atomic
-- logic otherwise unchanged (S-01/S-02/S-03/S-05 behavior preserved).
-- ============================================================================

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

    -- GATE R1: serialize per-staff open-shift creation (trigger count is RC-isolated)
  PERFORM pg_advisory_xact_lock(hashtext(v_target::text));
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

GRANT EXECUTE ON FUNCTION public.clock_in_atomic_token(text, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.clock_in_token(
  p_token text,
  p_target_id uuid,
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
  v_today date;
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

    -- GATE R1: serialize per-staff open-shift creation
  PERFORM pg_advisory_xact_lock(hashtext(p_target_id::text));
SELECT * INTO v_staff FROM staff WHERE id = p_target_id AND is_active = true;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Staff not found or inactive');
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

  -- S-05: business "today" in the location's timezone
  v_today := public.local_day(now(), v_loc);

  SELECT * INTO v_latest_entry FROM time_clock_entries
  WHERE staff_id = p_target_id AND timestamp > (v_today::timestamp AT TIME ZONE COALESCE(
             (SELECT timezone FROM locations WHERE id = v_loc), current_setting('TimeZone')))
  ORDER BY timestamp DESC LIMIT 1;
  IF v_latest_entry.entry_type IN ('clock_in', 'break_end') THEN
    RETURN json_build_object('success', false, 'error', 'Already clocked in');
  END IF;

  INSERT INTO shifts (staff_id, report_date, opened_at, starting_cash, organization_id, location_id)
  VALUES (v_staff.id, v_today, NOW(), 0, v_staff.organization_id, v_loc)
  RETURNING id INTO v_shift_id;

  INSERT INTO time_clock_entries (staff_id, entry_type, pin_verified, source, timestamp)
  VALUES (v_staff.id, 'clock_in', true, p_source, NOW());

  INSERT INTO time_clock_audit (action, performed_by, details)
  VALUES ('clock_in', v_staff.id,
    jsonb_build_object('shift_id', v_shift_id, 'location_id', v_loc, 'report_date', v_today,
                       'actor', v_actor, 'override', v_override, 'pin_verified_by', 'route_verifyPin'));

  RETURN json_build_object(
    'success', true, 'shift_id', v_shift_id, 'staff_name', v_staff.full_name,
    'location_id', v_loc, 'report_date', v_today, 'override', v_override, 'timestamp', NOW()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.clock_in_token(text, uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.open_shift(
  p_token text,
  p_starting_cash numeric DEFAULT 0
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_staff_id uuid;
    v_org_id uuid;
    v_loc_id uuid;
    v_shift_id uuid;
BEGIN
    PERFORM set_session_staff(p_token);
    v_staff_id := current_staff_id();
    v_org_id := current_org_id();
    
    -- GATE R1: serialize per-staff open-shift creation
    PERFORM pg_advisory_xact_lock(hashtext(v_staff_id::text));
v_loc_id := nullif(current_setting('app.current_location_id'), '')::uuid;

    IF v_loc_id IS NULL THEN
        RAISE EXCEPTION 'No active location';
    END IF;

    INSERT INTO shifts (staff_id, report_date, opened_at, starting_cash, expected_cash, actual_cash, difference, location_id, organization_id)
    VALUES (v_staff_id, public.local_day(now(), v_loc_id), now(), p_starting_cash, 0, 0, 0, v_loc_id, v_org_id)
    RETURNING id INTO v_shift_id;

    INSERT INTO operation_logs (entity_type, entity_id, operation, after_state, performed_by, correlation_id, location_id, organization_id)
    VALUES ('shift', v_shift_id, 'shift.opened',
            jsonb_build_object('staff_id', v_staff_id, 'starting_cash', p_starting_cash),
            v_staff_id, gen_random_uuid(), v_loc_id, v_org_id);

    RETURN jsonb_build_object('shift_id', v_shift_id, 'status', 'OPEN', 'started_at', now()::text,
                              'report_date', public.local_day(now(), v_loc_id));
END;
$$;

GRANT EXECUTE ON FUNCTION public.open_shift(text, numeric) TO service_role;
