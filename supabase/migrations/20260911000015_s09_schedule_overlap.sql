-- ============================================================================
-- 20260911000015 — S-09: scheduled shift overlap = DENY (atomic DB guard)
--
-- FROZEN BUSINESS RULE (user, 2026-09-11): same staff's PLANNED intervals must
-- not overlap:
--   10:00-18:00 + 14:00-22:00 → DENY
--   10:00-18:00 + 18:00-22:00 → ALLOW (no boundary overlap)
-- Guard is DB-level (NOT UI): an EXCLUSION constraint (btree_gist) makes
-- concurrent schedule creates atomically safe (exactly one wins).
-- update_schedule previously had NO conflict check → now checked too.
-- This covers scheduled/planned shifts only; the separate actual open-shift
-- ownership rule (trg_shift_no_overlap) is unchanged.
--
-- Pre-check: 0 existing overlapping pairs (verified 2026-09-11) → constraint
-- can be added without violation.
--
-- GOLDEN RULE 5: auto-commit. Idempotent (extension/constraint IF NOT).
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Atomic overlap guard: [start,end) ranges per (staff, date). Boundary touch
-- (18:00 = 18:00) is NOT an overlap → allowed per frozen rule.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'schedule_no_staff_overlap'
  ) THEN
    ALTER TABLE public.schedule
      ADD CONSTRAINT schedule_no_staff_overlap
      EXCLUDE USING gist (
        staff_id WITH =,
        schedule_date WITH =,
        tsrange(schedule_date + planned_start, schedule_date + planned_end) WITH &&
      );
  END IF;
END;
$$;

-- ----------------------------------------------------------------------------
-- create_schedule — keep early clean check; constraint is the atomic backstop.
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.create_schedule(uuid, date, time without time zone, time without time zone, text);
CREATE OR REPLACE FUNCTION public.create_schedule(
  p_staff_id uuid,
  p_date date,
  p_start time without time zone,
  p_end time without time zone,
  p_notes text DEFAULT NULL::text
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_schedule_id UUID;
BEGIN
  IF p_start >= p_end THEN
    RETURN json_build_object('success', false, 'error', 'planned_start must be before planned_end');
  END IF;

  -- Early clean rejection (constraint is the atomic backstop for races)
  IF EXISTS (
    SELECT 1 FROM schedule
    WHERE staff_id = p_staff_id
      AND schedule_date = p_date
      AND (planned_start, planned_end) OVERLAPS (p_start, p_end)
  ) THEN
    RETURN json_build_object('success', false, 'error', 'Schedule conflict detected');
  END IF;

  BEGIN
    INSERT INTO schedule (staff_id, schedule_date, planned_start, planned_end, notes)
    VALUES (p_staff_id, p_date, p_start, p_end, p_notes)
    RETURNING id INTO v_schedule_id;
  EXCEPTION WHEN exclusion_violation THEN
    RETURN json_build_object('success', false, 'error', 'Schedule conflict detected');
  END;

  RETURN json_build_object('success', true, 'schedule_id', v_schedule_id);
END;
$$;

-- ----------------------------------------------------------------------------
-- update_schedule — S-09: conflict check (was: none).
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.update_schedule(uuid, time without time zone, time without time zone, text);
CREATE OR REPLACE FUNCTION public.update_schedule(
  p_schedule_id uuid,
  p_start time without time zone,
  p_end time without time zone,
  p_notes text DEFAULT NULL::text
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row schedule%ROWTYPE;
  v_new_start time;
  v_new_end time;
BEGIN
  SELECT * INTO v_row FROM schedule WHERE id = p_schedule_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Schedule not found');
  END IF;

  v_new_start := COALESCE(p_start, v_row.planned_start);
  v_new_end   := COALESCE(p_end, v_row.planned_end);

  IF v_new_start >= v_new_end THEN
    RETURN json_build_object('success', false, 'error', 'planned_start must be before planned_end');
  END IF;

  IF EXISTS (
    SELECT 1 FROM schedule
    WHERE staff_id = v_row.staff_id
      AND schedule_date = v_row.schedule_date
      AND id <> p_schedule_id
      AND (planned_start, planned_end) OVERLAPS (v_new_start, v_new_end)
  ) THEN
    RETURN json_build_object('success', false, 'error', 'Schedule conflict detected');
  END IF;

  BEGIN
    UPDATE schedule
    SET planned_start = v_new_start,
        planned_end = v_new_end,
        notes = COALESCE(p_notes, notes),
        updated_at = NOW()
    WHERE id = p_schedule_id;
  EXCEPTION WHEN exclusion_violation THEN
    RETURN json_build_object('success', false, 'error', 'Schedule conflict detected');
  END;

  RETURN json_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_schedule(uuid, date, time, time, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.update_schedule(uuid, time, time, text) TO service_role;
