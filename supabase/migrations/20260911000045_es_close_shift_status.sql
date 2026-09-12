-- ============================================================================
-- 20260911000045 — E/S (proven regression, demonstrated): the TWO close paths
--                  migration 019 missed must set shifts.status = 'CLOSED'
--
-- ROOT CAUSE (live evidence):
--   Migration 019 (`20260911000019_shift_close_status`) fixed the two clock-out
--   token functions (clock_out_token, clock_out_atomic_token) to set
--   status='CLOSED' on close, because a shift left at status='OPEN' + closed_at
--   set is still counted OPEN by trg_shift_no_overlap -> the staff can NEVER
--   clock in again. 019 also repaired the 7 rows that existed then.
--   BUT TWO OTHER close paths were missed:
--     1) auto_clockout_staff  (12h auto-close): sets closed_at + auto_closed but
--        NOT status -> leaves the shift 'OPEN'. (This is the origin of the 4
--        live violating rows, all auto_closed=true, owned by prior G2/ES gate
--        fixtures: G2mtwuj3zt_* @ 23:05, ESGmtwse8zs_* @ 22:05 on 2026-09-11.)
--     2) close_shift_atomic   (service-role close): sets closed_at/actual_cash/
--        difference but NOT status -> leaves the shift 'OPEN'.
--   Both produce rows violating 019's invariant:
--       "closed_at IS NOT NULL AND status <> 'CLOSED'"  (E/S gate Z10).
--
-- FIX (smallest correct layer, E/S shift-status boundary only):
--   * auto_clockout_staff: add status='CLOSED' to its close UPDATE.
--   * close_shift_atomic:  add status='CLOSED' to its close UPDATE.
--   * one-time repair of ALL currently-inconsistent rows (the 4 pre-existing
--     auto-clock rows + any closed-but-OPEN test residue).
--
-- UNCHANGED: no permission, no location scope, no RLS, no other E/S contract.
-- This restores the E/S gate to 54/54 (Z10) — a precondition for K freeze.
-- ============================================================================

-- ---- 1. auto_clockout_staff: set status='CLOSED' on the 12h auto-close ----
CREATE OR REPLACE FUNCTION public.auto_clockout_staff()
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    SET closed_at = NOW(), auto_closed = true, auto_closed_at = NOW(),
        status = 'CLOSED',          -- 045 (E/S, proven regression): 019 invariant
        updated_at = NOW()
    WHERE id = v_shift.id;
    v_count := v_count + 1;
  END LOOP;
  RETURN json_build_object('success', true, 'auto_closed_count', v_count);
END;
$function$;

-- ---- 2. close_shift_atomic: set status='CLOSED' on the service-role close ----
CREATE OR REPLACE FUNCTION public.close_shift_atomic(p_shift_id uuid, p_actual_cash numeric, p_reason text DEFAULT NULL::text, p_performed_by uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_shift shifts%ROWTYPE;
  v_expected numeric;
  v_difference numeric;
  v_requires_review boolean;
BEGIN
  SELECT * INTO v_shift FROM shifts WHERE id = p_shift_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'SHIFT_NOT_FOUND');
  END IF;

  IF v_shift.closed_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'SHIFT_ALREADY_CLOSED');
  END IF;

  -- Calculate expected cash
  v_expected := COALESCE(v_shift.starting_cash, 0) + COALESCE(v_shift.expected_cash, 0);
  v_difference := p_actual_cash - v_expected;
  v_requires_review := ABS(v_difference) > 10;

  -- Close shift
  UPDATE shifts SET
    closed_at = now(),
    status = 'CLOSED',              -- 045 (E/S, proven regression): 019 invariant
    actual_cash = p_actual_cash,
    expected_cash = v_expected,
    difference = v_difference,
    notes = COALESCE(notes, '') || COALESCE(' | Close: ' || p_reason, ''),
    updated_at = now()
  WHERE id = p_shift_id;

  -- Audit
  PERFORM log_audit(
    'shift_closed', 'shifts', p_shift_id::text, p_performed_by,
    jsonb_build_object(
      'starting_cash', v_shift.starting_cash,
      'expected', v_expected
    ),
    jsonb_build_object(
      'actual_cash', p_actual_cash,
      'difference', v_difference,
      'requires_review', v_requires_review
    ),
    NULL, NULL, NULL
  );

  RETURN jsonb_build_object(
    'success', true,
    'shift_id', p_shift_id,
    'expected_cash', v_expected,
    'actual_cash', p_actual_cash,
    'difference', v_difference,
    'requires_review', v_requires_review
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$function$;

-- ---- 3. one-time repair of ALL currently-inconsistent rows ----
-- (the 4 pre-existing auto-clock rows + any closed-but-OPEN test residue)
DO $$
DECLARE
  v_before int;
BEGIN
  SELECT count(*) INTO v_before FROM shifts WHERE closed_at IS NOT NULL AND status <> 'CLOSED';
  UPDATE shifts SET status = 'CLOSED' WHERE closed_at IS NOT NULL AND status <> 'CLOSED';
  RAISE NOTICE '045 repaired % inconsistent shift row(s) (closed_at set, status not CLOSED)', v_before;
END $$;

-- ---- fail-safe: the invariant now holds globally + both fns set status ----
DO $$
DECLARE
  v_bad int;
  v_both boolean;
BEGIN
  SELECT count(*) INTO v_bad FROM shifts WHERE closed_at IS NOT NULL AND status <> 'CLOSED';
  IF v_bad <> 0 THEN
    RAISE EXCEPTION '045 FAIL-SAFE: % closed shift(s) still have status not CLOSED', v_bad;
  END IF;
  SELECT bool_and(p.prosrc LIKE '%status = ''CLOSED''%')
    INTO v_both
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('auto_clockout_staff','close_shift_atomic');
  IF NOT v_both THEN
    RAISE EXCEPTION '045 FAIL-SAFE: auto_clockout_staff/close_shift_atomic must both set status=CLOSED';
  END IF;
END $$;
