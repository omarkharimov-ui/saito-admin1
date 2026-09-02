-- =============================================
-- SHIFT LIFECYCLE ENGINE
-- Binds staff cards (admin) + future staff app to a single 1:1 source of truth:
--   schedule  -> planned shift (SSOT)
--   shifts    -> active/completed clock session
--   time_clock_entries -> clock in/out + break events
--   shift_breaks -> paid/unpaid break detail
--   break_rules / staff.break_allowance_mins -> configurable break limit
-- =============================================

-- ---------------------------------------------------------------------------
-- 1) CONFIGURABLE BREAK ALLOWANCE (per staff, fallback to break_rules)
-- ---------------------------------------------------------------------------
ALTER TABLE public.staff ADD COLUMN IF NOT EXISTS break_allowance_mins INTEGER;

COMMENT ON COLUMN public.staff.break_allowance_mins
  IS 'Paid/unpaid break allowance in minutes for this staff member. When NULL the system falls back to the matching break_rules row (or 45).';

-- ---------------------------------------------------------------------------
-- 2) STAFF ANNOUNCEMENTS (manager -> staff notice board)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.staff_announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  body TEXT,
  created_by UUID REFERENCES public.staff(id),
  audience VARCHAR(20) NOT NULL DEFAULT 'all' CHECK (audience IN ('all', 'role', 'staff')),
  staff_ids UUID[] DEFAULT '{}',
  role_ids UUID[] DEFAULT '{}',
  is_sticky BOOLEAN DEFAULT false,
  is_visible BOOLEAN DEFAULT true,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.staff_announcements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for authenticated" ON public.staff_announcements;
CREATE POLICY "Allow all for authenticated" ON public.staff_announcements FOR ALL USING (true);

CREATE INDEX IF NOT EXISTS idx_staff_announcements_visible
  ON public.staff_announcements(is_visible, created_at DESC);

-- ---------------------------------------------------------------------------
-- 3) DEFAULT BREAK RULES (configurable, apply-to role is soft)
-- ---------------------------------------------------------------------------
INSERT INTO public.break_rules (name, work_duration_minutes, break_duration_minutes, break_type, is_paid, is_active, applies_to_minors)
SELECT 'Standard', 300, 45, 'unpaid', false, true, false
WHERE NOT EXISTS (SELECT 1 FROM public.break_rules WHERE name = 'Standard');

-- ---------------------------------------------------------------------------
-- 4) GET STAFF LIFECYCLE STATUS
--    Returns each staff member's live phase + late flag + break info for today.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_staff_lifecycle_status()
RETURNS TABLE (
  staff_id UUID,
  phase TEXT,                    -- scheduled | on_shift | on_break | completed | unclosed | no_schedule
  scheduled_start TIME,
  scheduled_end TIME,
  has_schedule BOOLEAN,
  is_clocked_in BOOLEAN,
  shift_id UUID,
  shift_opened_at TIMESTAMPTZ,
  clock_in_at TIMESTAMPTZ,
  late_minutes INTEGER,
  is_late BOOLEAN,
  on_break BOOLEAN,
  break_started_at TIMESTAMPTZ,
  break_used_minutes INTEGER,
  break_allowance_mins INTEGER,
  hours_worked_net NUMERIC,
  is_unclosed BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_member RECORD;
  v_sched RECORD;
  v_shift RECORD;
  v_break_total INTEGER := 0;
  v_has_break BOOLEAN := false;
  v_break_started_ts TIMESTAMPTZ := NULL;
  v_net_hours NUMERIC := 0;
  v_phase TEXT;
  v_late INTEGER := 0;
  v_clock_in_ts TIMESTAMPTZ := NULL;
BEGIN
  FOR v_member IN SELECT s.id, s.break_allowance_mins, r.name AS role_name
                  FROM public.staff s
                  LEFT JOIN public.roles r ON r.id = s.role_id
                  WHERE s.is_active = true
  LOOP
    -- today's planned schedule
    SELECT * INTO v_sched FROM public.schedule
    WHERE public.schedule.staff_id = v_member.id AND schedule_date = CURRENT_DATE
    ORDER BY planned_start LIMIT 1;

    -- active open shift (unclosed guard handled downstream)
    SELECT * INTO v_shift FROM public.shifts
    WHERE public.shifts.staff_id = v_member.id AND closed_at IS NULL
    ORDER BY opened_at DESC LIMIT 1;

    -- active break for that shift
    v_has_break := false;
    v_break_started_ts := NULL;
    IF v_shift.id IS NOT NULL THEN
      SELECT COUNT(*) > 0, MIN(started_at) INTO v_has_break, v_break_started_ts
      FROM public.shift_breaks
      WHERE shift_id = v_shift.id AND ended_at IS NULL;
    END IF;

    -- total break minutes today for this member
    SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (COALESCE(ended_at, NOW()) - started_at)) / 60)::int, 0)
      INTO v_break_total
    FROM public.shift_breaks sb
    JOIN public.shifts sh ON sh.id = sb.shift_id
    WHERE sh.staff_id = v_member.id AND DATE(sb.started_at) = CURRENT_DATE;

    -- net worked hours while clocked in (gross minus breaks)
    IF v_shift.id IS NOT NULL THEN
      SELECT COALESCE(
        (EXTRACT(EPOCH FROM (NOW() - sh.opened_at)) / 3600) -
        COALESCE((SELECT SUM(EXTRACT(EPOCH FROM (COALESCE(sb.ended_at, NOW()) - sb.started_at)) / 3600)
                  FROM public.shift_breaks sb WHERE sb.shift_id = sh.id), 0),
        0) INTO v_net_hours
      FROM public.shifts sh WHERE sh.id = v_shift.id;
    END IF;

    -- phase + late
    v_phase := 'no_schedule';
    IF v_shift.id IS NOT NULL THEN
      -- unclosed guard: > 12h and still open
      IF EXTRACT(EPOCH FROM (NOW() - v_shift.opened_at)) / 3600 > 12 THEN
        v_phase := 'unclosed';
      ELSIF v_has_break THEN
        v_phase := 'on_break';
      ELSE
        v_phase := 'on_shift';
      END IF;
    ELSIF v_sched.id IS NOT NULL THEN
      v_phase := 'scheduled';
    END IF;

    -- late flag: clock-in after scheduled_start + 15 min grace (only for today's scheduled shift)
    v_late := 0;
    IF v_sched.id IS NOT NULL AND v_phase IN ('on_shift', 'on_break', 'unclosed') THEN
      SELECT t.clock_in_at INTO v_clock_in_ts FROM (
        SELECT timestamp AS clock_in_at FROM public.time_clock_entries
        WHERE time_clock_entries.staff_id = v_member.id AND entry_type = 'clock_in' AND timestamp >= CURRENT_DATE
        ORDER BY timestamp DESC LIMIT 1
      ) t;
      IF v_clock_in_ts IS NOT NULL
         AND v_clock_in_ts::time > (v_sched.planned_start::time + INTERVAL '15 minutes') THEN
        v_late := (EXTRACT(EPOCH FROM (v_clock_in_ts::time - v_sched.planned_start::time)) / 60)::int;
      END IF;
    END IF;

    RETURN QUERY SELECT
      v_member.id,
      v_phase,
      v_sched.planned_start,
      v_sched.planned_end,
      v_sched.id IS NOT NULL,
      v_shift.id IS NOT NULL AND NOT v_has_break AND v_phase IN ('on_shift', 'unclosed'),
      v_shift.id,
      v_shift.opened_at,
      v_clock_in_ts,
      v_late,
      v_late > 0,
      v_has_break,
      v_break_started_ts,
      v_break_total,
      COALESCE(v_member.break_allowance_mins, 45),
      v_net_hours,
      v_phase = 'unclosed';
  END LOOP;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.get_staff_lifecycle_status TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5) UNCLOSED GUARD -> bump auto_clockout_staff threshold to 12h per spec
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.auto_clockout_staff()
RETURNS JSON AS $$
DECLARE
  v_shift RECORD;
  v_count INTEGER := 0;
BEGIN
  FOR v_shift IN
    SELECT s.id, s.staff_id, s.opened_at
    FROM public.shifts s
    WHERE s.closed_at IS NULL
      AND s.auto_closed = false
      AND s.opened_at < NOW() - INTERVAL '12 hours'
  LOOP
    UPDATE public.shifts
    SET closed_at = NOW(), auto_closed = true, auto_closed_at = NOW(), updated_at = NOW()
    WHERE id = v_shift.id;
    v_count := v_count + 1;
  END LOOP;
  RETURN json_build_object('success', true, 'auto_closed_count', v_count);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
