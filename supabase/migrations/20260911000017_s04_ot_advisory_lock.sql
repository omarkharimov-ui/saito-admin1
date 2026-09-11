-- ============================================================================
-- 20260911000017 — S-04 harden: advisory lock on calculate_shift_overtime
--
-- FINAL GATE pre-fix: two concurrent closes of the same shift (drawer-close
-- hook + clock-out hook, or 2 parallel close calls) could both pass the
-- DELETE-then-INSERT window → duplicate unapproved overtime records.
-- pg_advisory_xact_lock(hashtext(shift_id)) serializes per-shift recompute
-- for the transaction; after the first commit the second recompute sees the
-- just-inserted rows and the delete+reinsert keeps exactly one set.
-- ============================================================================
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
  v_worked NUMERIC;
  v_day_worked NUMERIC;
  v_week_worked NUMERIC;
  v_week_daily_ot NUMERIC;
  v_daily_ot NUMERIC;
  v_double_ot NUMERIC;
  v_weekly_ot NUMERIC;
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
  -- S-04 harden: serialize per-shift recompute (TOCTOU window on delete+insert)
  PERFORM pg_advisory_xact_lock(hashtext(p_shift_id::text));

  SELECT * INTO v_shift FROM shifts WHERE id = p_shift_id;
  IF NOT FOUND OR v_shift.closed_at IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Shift not found or not closed');
  END IF;

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

  SELECT COALESCE(EXTRACT(EPOCH FROM (v_shift.closed_at - v_shift.opened_at))/3600.0, 0)
       - COALESCE(EXTRACT(EPOCH FROM (
             SELECT SUM(sb.ended_at - sb.started_at)
             FROM shift_breaks sb WHERE sb.shift_id = v_shift.id AND sb.ended_at IS NOT NULL
           ))/3600.0, 0)
    INTO v_worked;
  v_worked := GREATEST(v_worked, 0);

  SELECT COALESCE(SUM(
        GREATEST(EXTRACT(EPOCH FROM (s.closed_at - s.opened_at))/3600.0
        - COALESCE(EXTRACT(EPOCH FROM (
             SELECT SUM(sb.ended_at - sb.started_at) FROM shift_breaks sb
             WHERE sb.shift_id = s.id AND sb.ended_at IS NOT NULL)) / 3600.0, 0), 0)
      ), 0) INTO v_day_worked
  FROM shifts s
  WHERE s.staff_id = v_shift.staff_id AND s.closed_at IS NOT NULL
    AND public.local_day(s.opened_at, s.location_id) = v_bdate;

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

  v_daily_ot  := GREATEST(LEAST(v_day_worked, v_double_th) - v_daily_th, 0);
  v_double_ot := GREATEST(v_day_worked - v_double_th, 0);
  v_weekly_ot := GREATEST(v_week_worked - v_weekly_th - v_week_daily_ot, 0);

  DELETE FROM overtime_records
  WHERE staff_id = v_shift.staff_id AND overtime_type IN ('daily','double')
    AND approved = false AND business_date = v_bdate;
  DELETE FROM overtime_records
  WHERE staff_id = v_shift.staff_id AND overtime_type = 'weekly' AND approved = false
    AND business_date >= v_week_monday AND business_date <= v_week_sunday;

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
