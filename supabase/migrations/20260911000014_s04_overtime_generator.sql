-- ============================================================================
-- 20260911000014 — S-04: overtime generator (close-time, location-local, idempotent)
--
-- FROZEN CONTRACT (E/S gate): worked = actual − break; >8h/day → 1.5× (and
-- >12h/day → 2.0×, the 'double' threshold); >40h/week → 1.5×; break deducted;
-- business date = location-local (S-05 local_day). Money =
-- hours × staff.hourly_rate × multiplier.
--   (overtime_rate column is a flat 1.5 redundant multiplier on ALL staff —
--    NOT a money rate; deliberately NOT used, per data-grounded audit.)
--
-- Idempotency: recalculating a shift deletes its prior UNAPPROVED
-- overtime_records before re-inserting (approved records are never touched →
-- manager approval is a separate, audited step).
-- No double-pay: weekly overtime is net of daily-overtime hours already paid
-- in the same ISO week.
--
-- Hooked into the 3 close paths: close_shift, clock_out_token,
-- clock_out_atomic_token. get_overtime_summary switched to business_date.
--
-- GOLDEN RULE 5: auto-commit. Idempotent (OR REPLACE / ADD COLUMN IF NOT).
-- ============================================================================

ALTER TABLE public.overtime_records
  ADD COLUMN IF NOT EXISTS business_date date;

-- ----------------------------------------------------------------------------
-- calculate_shift_overtime(p_shift_id) — recompute overtime for one closed
-- shift (daily tiered + weekly net). Idempotent for unapproved rows.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.calculate_shift_overtime(
  p_shift_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_shift RECORD;
  v_rate NUMERIC;
  v_tz text;
  v_worked NUMERIC;          -- hours this shift (actual - break)
  v_day_worked NUMERIC;      -- all closed shifts same local business_date
  v_week_worked NUMERIC;     -- all closed shifts same local ISO week
  v_week_daily_ot NUMERIC;   -- daily/double ot hours already in this week
  v_daily_ot NUMERIC;        -- 1.5x portion (8-12h)
  v_double_ot NUMERIC;       -- 2.0x portion (>12h)
  v_weekly_ot NUMERIC;       -- remaining after daily, net of 40h
  v_daily_th NUMERIC := 8;
  v_double_th NUMERIC := 12;
  v_weekly_th NUMERIC := 40;
  v_daily_rate NUMERIC := 1.5;
  v_double_rate NUMERIC := 2.0;
  v_weekly_rate NUMERIC := 1.5;
  v_bdate date;
  v_week_monday date;
  v_week_sunday date;
  v_week_start timestamptz;
  v_week_end timestamptz;
BEGIN
  SELECT * INTO v_shift FROM shifts WHERE id = p_shift_id;
  IF NOT FOUND OR v_shift.closed_at IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Shift not found or not closed');
  END IF;

  -- live thresholds (fallback to frozen defaults if row missing)
  SELECT hours INTO v_daily_th FROM overtime_thresholds WHERE threshold_type='daily' AND is_active LIMIT 1;
  SELECT hours INTO v_double_th FROM overtime_thresholds WHERE threshold_type='double' AND is_active LIMIT 1;
  SELECT hours INTO v_weekly_th FROM overtime_thresholds WHERE threshold_type='weekly' AND is_active LIMIT 1;
  SELECT rate_multiplier INTO v_daily_rate FROM overtime_thresholds WHERE threshold_type='daily' AND is_active LIMIT 1;
  SELECT rate_multiplier INTO v_double_rate FROM overtime_thresholds WHERE threshold_type='double' AND is_active LIMIT 1;
  SELECT rate_multiplier INTO v_weekly_rate FROM overtime_thresholds WHERE threshold_type='weekly' AND is_active LIMIT 1;
  v_daily_th := coalesce(v_daily_th, 8); v_double_th := coalesce(v_double_th, 12);
  v_weekly_th := coalesce(v_weekly_th, 40);
  v_daily_rate := coalesce(v_daily_rate, 1.5); v_double_rate := coalesce(v_double_rate, 2.0);
  v_weekly_rate := coalesce(v_weekly_rate, 1.5);

  v_tz := COALESCE((SELECT timezone FROM locations WHERE id = v_shift.location_id), current_setting('TimeZone'));
  v_rate := (SELECT hourly_rate FROM staff WHERE id = v_shift.staff_id);
  v_bdate := public.local_day(v_shift.opened_at, v_shift.location_id);

  -- worked hours this shift = actual - total recorded break
  SELECT COALESCE(EXTRACT(EPOCH FROM (v_shift.closed_at - v_shift.opened_at))/3600.0, 0)
       - COALESCE(EXTRACT(EPOCH FROM (
            SELECT SUM(sb.ended_at - sb.started_at)
            FROM shift_breaks sb WHERE sb.shift_id = v_shift.id AND sb.ended_at IS NOT NULL
          ))/3600.0, 0)
    INTO v_worked;
  v_worked := GREATEST(v_worked, 0);

  -- daily aggregate for the local business_date
  SELECT COALESCE(SUM(
        GREATEST(EXTRACT(EPOCH FROM (s.closed_at - s.opened_at))/3600.0
        - COALESCE(EXTRACT(EPOCH FROM (
             SELECT SUM(sb.ended_at - sb.started_at) FROM shift_breaks sb
             WHERE sb.shift_id = s.id AND sb.ended_at IS NOT NULL)) / 3600.0, 0), 0)
      ), 0) INTO v_day_worked
  FROM shifts s
  WHERE s.staff_id = v_shift.staff_id AND s.closed_at IS NOT NULL
    AND public.local_day(s.opened_at, s.location_id) = v_bdate;

  -- weekly window = local ISO week (Mon 00:00 → next Mon) of the shift's business_date
  v_week_monday := v_bdate - extract(isodow FROM v_bdate::timestamp)::int + 1;
  v_week_sunday := v_week_monday + 6;
  v_week_start := (v_week_monday::timestamp AT TIME ZONE v_tz);
  v_week_end   := ((v_week_monday + 7)::timestamp AT TIME ZONE v_tz);

  SELECT COALESCE(SUM(
        GREATEST(EXTRACT(EPOCH FROM (s.closed_at - s.opened_at))/3600.0
        - COALESCE(EXTRACT(EPOCH FROM (
             SELECT SUM(sb.ended_at - sb.started_at) FROM shift_breaks sb
             WHERE sb.shift_id = s.id AND sb.ended_at IS NOT NULL)) / 3600.0, 0), 0)
      ), 0) INTO v_week_worked
  FROM shifts s
  WHERE s.staff_id = v_shift.staff_id AND s.closed_at IS NOT NULL
    AND s.opened_at >= v_week_start AND s.opened_at < v_week_end;

  -- weekly tiered hours per day (deterministic, from shifts — no record-state
  -- dependency): 1.5x portion (8-12h) + 2.0x portion (>12h), summed over the week
  SELECT COALESCE(SUM(
        GREATEST(LEAST(day_w, v_double_th) - v_daily_th, 0)
      + GREATEST(day_w - v_double_th, 0)), 0) INTO v_week_daily_ot
  FROM (
    SELECT COALESCE(SUM(
              GREATEST(EXTRACT(EPOCH FROM (s.closed_at - s.opened_at))/3600.0
              - COALESCE(EXTRACT(EPOCH FROM (
                   SELECT SUM(sb.ended_at - sb.started_at) FROM shift_breaks sb
                   WHERE sb.shift_id = s.id AND sb.ended_at IS NOT NULL)) / 3600.0, 0), 0)
            ), 0) AS day_w
    FROM shifts s
    WHERE s.staff_id = v_shift.staff_id AND s.closed_at IS NOT NULL
      AND s.opened_at >= v_week_start AND s.opened_at < v_week_end
    GROUP BY public.local_day(s.opened_at, s.location_id)
  ) d;

  -- daily tiered for the business_date (1.5x: 8-12h portion, 2.0x: >12h portion)
  v_daily_ot  := GREATEST(LEAST(v_day_worked, v_double_th) - v_daily_th, 0);
  v_double_ot := GREATEST(v_day_worked - v_double_th, 0);

  -- weekly: hours above the 40h cap, NET of daily/double already paid in the week
  v_weekly_ot := GREATEST(v_week_worked - v_weekly_th - v_week_daily_ot, 0);

  -- Idempotency (recompute on any re-close of a same-day/week shift):
  -- daily/double are DAY-level → drop unapproved daily/double for this staff+business_date;
  -- weekly is WEEK-level → drop unapproved weekly for this staff+week. Approved rows
  -- are NEVER touched (manager approval is a separate, audited step).
  DELETE FROM overtime_records
  WHERE staff_id = v_shift.staff_id AND overtime_type IN ('daily','double')
    AND approved = false AND business_date = v_bdate;
  DELETE FROM overtime_records
  WHERE staff_id = v_shift.staff_id AND overtime_type = 'weekly' AND approved = false
    AND business_date >= v_week_monday AND business_date <= v_week_sunday;

  -- Approval lock: if an APPROVED row already exists for (staff, type, day/week),
  -- do not re-insert (that period is locked; corrections = manager path, S-10).
  IF v_daily_ot > 0 AND v_rate IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM overtime_records
                     WHERE staff_id=v_shift.staff_id AND overtime_type='daily' AND approved=true AND business_date=v_bdate) THEN
    INSERT INTO overtime_records (staff_id, shift_id, overtime_type, hours, rate_multiplier, calculated_amount, business_date, approved)
    VALUES (v_shift.staff_id, v_shift.id, 'daily', ROUND(v_daily_ot,3), v_daily_rate, ROUND(v_daily_ot * v_rate * v_daily_rate, 2), v_bdate, false);
  END IF;
  IF v_double_ot > 0 AND v_rate IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM overtime_records
                     WHERE staff_id=v_shift.staff_id AND overtime_type='double' AND approved=true AND business_date=v_bdate) THEN
    INSERT INTO overtime_records (staff_id, shift_id, overtime_type, hours, rate_multiplier, calculated_amount, business_date, approved)
    VALUES (v_shift.staff_id, v_shift.id, 'double', ROUND(v_double_ot,3), v_double_rate, ROUND(v_double_ot * v_rate * v_double_rate, 2), v_bdate, false);
  END IF;
  IF v_weekly_ot > 0 AND v_rate IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM overtime_records
                     WHERE staff_id=v_shift.staff_id AND overtime_type='weekly' AND approved=true
                       AND business_date >= v_week_monday AND business_date <= v_week_sunday) THEN
    INSERT INTO overtime_records (staff_id, shift_id, overtime_type, hours, rate_multiplier, calculated_amount, business_date, approved)
    VALUES (v_shift.staff_id, v_shift.id, 'weekly', ROUND(v_weekly_ot,3), v_weekly_rate, ROUND(v_weekly_ot * v_rate * v_weekly_rate, 2), v_bdate, false);
  END IF;

  RETURN jsonb_build_object(
    'success', true, 'shift_id', p_shift_id, 'business_date', v_bdate,
    'worked_hours', ROUND(v_worked,3), 'day_worked', ROUND(v_day_worked,3),
    'week_worked', ROUND(v_week_worked,3),
    'daily_ot_hours', ROUND(v_daily_ot,3), 'double_ot_hours', ROUND(v_double_ot,3),
    'weekly_ot_hours', ROUND(v_weekly_ot,3), 'hourly_rate', v_rate
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.calculate_shift_overtime(uuid) TO service_role;

-- ----------------------------------------------------------------------------
-- Hook the close paths. close_shift:
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.close_shift(text, uuid, numeric, text);
CREATE OR REPLACE FUNCTION public.close_shift(
  p_token text,
  p_shift_id uuid,
  p_actual_cash numeric DEFAULT 0,
  p_notes text DEFAULT NULL::text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_staff_id uuid;
    v_org_id uuid;
    v_shift RECORD;
    v_ot jsonb;
BEGIN
    PERFORM set_session_staff(p_token);
    v_staff_id := current_staff_id();
    v_org_id := current_org_id();

    SELECT * INTO v_shift FROM shifts WHERE id = p_shift_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Shift not found'; END IF;
    IF v_shift.staff_id != v_staff_id AND NOT is_superadmin() THEN
        RAISE EXCEPTION 'Cannot close another staff shift';
    END IF;
    IF v_shift.status = 'CLOSED' THEN
        RAISE EXCEPTION 'Shift already closed';
    END IF;

    UPDATE shifts
    SET closed_at = now(), status = 'CLOSED', actual_cash = p_actual_cash,
        difference = p_actual_cash - v_shift.expected_cash,
        notes = COALESCE(p_notes, notes)
    WHERE id = p_shift_id;

    -- S-04: compute overtime on close (idempotent)
    BEGIN
      v_ot := public.calculate_shift_overtime(p_shift_id);
    EXCEPTION WHEN OTHERS THEN
      v_ot := jsonb_build_object('success', false, 'error', SQLERRM);
    END;

    INSERT INTO operation_logs (entity_type, entity_id, operation, after_state, performed_by, correlation_id, location_id, organization_id)
    VALUES ('shift', p_shift_id, 'shift.closed',
            jsonb_build_object('actual_cash', p_actual_cash, 'difference', p_actual_cash - v_shift.expected_cash, 'overtime', v_ot),
            v_staff_id, gen_random_uuid(), v_shift.location_id, v_org_id);

    RETURN jsonb_build_object('shift_id', p_shift_id, 'status', 'CLOSED',
                              'difference', p_actual_cash - v_shift.expected_cash, 'overtime', v_ot);
END;
$$;

-- ----------------------------------------------------------------------------
-- clock_out_token + clock_out_atomic_token: call calculate on close.
-- Re-add the two fns with the overtime hook (PIN-agnostic, from S-03).
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
  v_shifts uuid[]; v_sid uuid; v_open_loc uuid; v_tz text;
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

  -- S-05: business "today" in the open shift's location timezone
  SELECT location_id INTO v_open_loc FROM shifts
  WHERE staff_id = p_target_id AND closed_at IS NULL
  ORDER BY opened_at DESC LIMIT 1;
  IF v_open_loc IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Not clocked in');
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

  -- S-04: overtime on each closed shift (idempotent)
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
-- clock_out_atomic_token: overtime hook on close (frozen: overtime on close).
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
  v_staff staff%ROWTYPE; v_open_shift shifts%ROWTYPE; v_result shifts%ROWTYPE; v_ot jsonb;
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
  UPDATE shifts SET closed_at = now(), notes = CASE WHEN notes IS NULL OR notes = '' THEN p_notes ELSE notes || ' | ' || p_notes END, updated_at = now()
  WHERE id = v_open_shift.id RETURNING * INTO v_result;

  -- S-04: overtime on close (idempotent)
  BEGIN
    v_ot := public.calculate_shift_overtime(v_result.id);
  EXCEPTION WHEN OTHERS THEN
    v_ot := jsonb_build_object('success', false, 'error', SQLERRM);
  END;

  PERFORM log_audit('clock_out'::text, 'staff'::text, v_target::text, v_actor, NULL::text,
    jsonb_build_object('shift_id', v_open_shift.id, 'override', v_override),
    jsonb_build_object('shift_id', v_result.id, 'closed_at', now(), 'overtime', v_ot), NULL::jsonb, NULL::jsonb, NULL::text);
  RETURN jsonb_build_object('success', true, 'shift_id', v_result.id::text, 'staff_id', v_target, 'override', v_override, 'closed_at', now(), 'overtime', v_ot);
END;
$$;

GRANT EXECUTE ON FUNCTION public.clock_out_atomic_token(text, uuid, text) TO service_role;

-- ----------------------------------------------------------------------------
-- get_overtime_summary: report on business_date (location-local) not created_at
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_overtime_summary(uuid, date, date);
CREATE OR REPLACE FUNCTION public.get_overtime_summary(
  p_staff_id uuid,
  p_start_date date DEFAULT (CURRENT_DATE - '7 days'::interval),
  p_end_date date DEFAULT CURRENT_DATE
) RETURNS json
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT json_build_object(
    'daily_overtime',   COALESCE(SUM(CASE WHEN overtime_type='daily'  THEN hours ELSE 0 END),0),
    'weekly_overtime',  COALESCE(SUM(CASE WHEN overtime_type='weekly' THEN hours ELSE 0 END),0),
    'double_overtime',  COALESCE(SUM(CASE WHEN overtime_type='double' THEN hours ELSE 0 END),0),
    'total_overtime',   COALESCE(SUM(hours),0),
    'total_amount',     COALESCE(SUM(calculated_amount),0)
  )
  FROM overtime_records
  WHERE staff_id = p_staff_id
    AND business_date BETWEEN p_start_date AND p_end_date;
$$;

GRANT EXECUTE ON FUNCTION public.get_overtime_summary(uuid, date, date) TO service_role;
