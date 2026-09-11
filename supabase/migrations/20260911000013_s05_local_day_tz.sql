-- ============================================================================
-- 20260911000013 — S-05: UTC store + location.timezone business-date (STEP 1/2)
--
-- FROZEN CONTRACT (E/S gate): DB timestamps = UTC (timestamptz, dəyişmir);
-- business date (report_date / "today" / weekly window) = LOCATION-LOCAL
-- (locations.timezone). 0 function was using AT TIME ZONE (ES_FOUNDATION
-- §S-05). All day/week boundaries below are computed in the staff's
-- location timezone, multi-location safe.
--
-- This migration = DB side. STEP 2/2 = finance/close-day TS route (server
-- computes local day from locations.timezone instead of browser-local date).
--
-- GOLDEN RULE 5: auto-commit. Idempotent (OR REPLACE).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- local_day(p_ts, p_location_id) — business date of a UTC instant in the
-- location's timezone (canonical S-05 helper). No location / no tz →
-- server-timezone day (UTC fallback, never an error).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.local_day(
  p_ts timestamptz,
  p_location_id uuid
) RETURNS date
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT (p_ts AT TIME ZONE COALESCE(
           (SELECT timezone FROM locations WHERE id = p_location_id),
           current_setting('TimeZone')
         ))::date;
$$;

-- ----------------------------------------------------------------------------
-- clock_in_token — S-05: day-guard + report_date in location-local
-- ----------------------------------------------------------------------------
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

-- ----------------------------------------------------------------------------
-- get_time_clock_status — S-05: today/week hours in staff's location tz
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_time_clock_status(
  p_staff_id uuid
) RETURNS json
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_loc uuid;
  v_tz text;
  v_local_now timestamptz;
  v_local_day date;
  v_week_start timestamptz;
  v_latest RECORD;
  v_active_shift RECORD;
  v_active_break RECORD;
  v_today_hours DECIMAL;
  v_weekly_hours DECIMAL;
  v_has_shift BOOLEAN;
  v_has_break BOOLEAN;
  v_break_started TIMESTAMPTZ;
  v_break_id UUID;
  v_shift_id UUID;
  v_clocked_in BOOLEAN;
  v_on_break BOOLEAN;
BEGIN
  -- S-05: resolve the staff's location timezone (primary active assignment)
  SELECT l.location_id INTO v_loc
  FROM staff_locations l
  JOIN staff s ON s.id = l.staff_id
  WHERE l.staff_id = p_staff_id AND l.active = true
    AND (l.is_primary = true OR NOT EXISTS (
        SELECT 1 FROM staff_locations l2
        WHERE l2.staff_id = p_staff_id AND l2.active = true AND l2.is_primary = true))
  LIMIT 1;
  v_tz := COALESCE((SELECT timezone FROM locations WHERE id = v_loc), current_setting('TimeZone'));
  v_local_now := now() AT TIME ZONE v_tz;             -- wall-clock instant (no tz)
  v_local_day := v_local_now::date;                   -- business date
  -- local Monday 00:00 → back to timestamptz for range comparison
  v_week_start := ((v_local_day - extract(isodow from v_local_now)::int + 1)::timestamp AT TIME ZONE v_tz);

  SELECT * INTO v_latest FROM time_clock_entries
  WHERE staff_id = p_staff_id AND timestamp > (v_local_day::timestamp AT TIME ZONE v_tz)
  ORDER BY timestamp DESC LIMIT 1;

  SELECT * INTO v_active_shift FROM shifts
  WHERE staff_id = p_staff_id AND closed_at IS NULL
  ORDER BY opened_at DESC LIMIT 1;

  v_has_shift := v_active_shift.id IS NOT NULL;
  v_has_break := false;
  v_break_started := NULL;
  v_break_id := NULL;
  IF v_has_shift THEN
    SELECT sb.id, sb.started_at INTO v_break_id, v_break_started
    FROM shift_breaks sb
    WHERE sb.shift_id = v_active_shift.id AND sb.ended_at IS NULL
    LIMIT 1;
    v_has_break := v_break_id IS NOT NULL;
  END IF;

  SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (closed_at - opened_at)) / 3600), 0) INTO v_today_hours
  FROM shifts
  WHERE staff_id = p_staff_id
    AND public.local_day(opened_at, v_loc) = v_local_day;

  SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (closed_at - opened_at)) / 3600), 0) INTO v_weekly_hours
  FROM shifts
  WHERE staff_id = p_staff_id
    AND opened_at >= v_week_start
    AND opened_at < v_week_start + INTERVAL '7 days';

  v_clocked_in := v_has_shift AND NOT v_has_break;
  v_on_break := v_has_shift AND v_has_break;

  RETURN json_build_object(
    'is_clocked_in', v_clocked_in,
    'on_break', v_on_break,
    'current_entry_type', COALESCE(v_latest.entry_type, NULL),
    'last_entry', v_latest.timestamp,
    'active_shift_id', v_active_shift.id,
    'active_break_id', v_break_id,
    'break_started_at', v_break_started,
    'today_hours', ROUND(v_today_hours, 2),
    'weekly_hours', ROUND(v_weekly_hours, 2),
    'approaching_daily_ot', v_today_hours >= 7.5,
    'approaching_weekly_ot', v_weekly_hours >= 37.5,
    'business_date', v_local_day,
    'timezone', v_tz
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.local_day(timestamptz, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.clock_in_token(text, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_time_clock_status(uuid) TO service_role;

-- ----------------------------------------------------------------------------
-- open_shift — S-05: report_date in the session location's timezone
-- (was current_date = UTC date)
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.open_shift(text, numeric);
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
