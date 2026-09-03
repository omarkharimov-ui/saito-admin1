-- =============================================
-- FIX: get_time_clock_status crashes when staff has no active shift
-- Because v_active_break is only assigned when there is an active shift,
-- but RETURN references v_active_break unconditionally.
-- Cause: 'record "v_active_break" is not assigned yet'
-- =============================================
CREATE OR REPLACE FUNCTION public.get_time_clock_status(p_staff_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
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
  SELECT * INTO v_latest FROM time_clock_entries
  WHERE staff_id = p_staff_id AND timestamp > CURRENT_DATE
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

  SELECT COALESCE(SUM(
    EXTRACT(EPOCH FROM (closed_at - opened_at)) / 3600
  ), 0) INTO v_today_hours
  FROM shifts
  WHERE staff_id = p_staff_id AND DATE(opened_at) = CURRENT_DATE;

  SELECT COALESCE(SUM(
    EXTRACT(EPOCH FROM (closed_at - opened_at)) / 3600
  ), 0) INTO v_weekly_hours
  FROM shifts
  WHERE staff_id = p_staff_id
  AND opened_at >= date_trunc('week', CURRENT_DATE)
  AND opened_at < date_trunc('week', CURRENT_DATE) + INTERVAL '7 days';

  -- is_clocked_in: active open shift that is NOT on break
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
    'approaching_weekly_ot', v_weekly_hours >= 37.5
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_time_clock_status(uuid) TO anon, authenticated, service_role;
