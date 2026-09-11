-- ============================================================================
-- 20260911000016 — S-08: shift↔cash-drawer 1:1 binding + open_cash crash fix
--
-- USER-FROZEN DECISIONS (2026-09-11):
--   Q2/Q3/Q10: 1:1 shift↔drawer (cashier opens drawer at shift open, closes at
--              shift close). Atomic bind; a second concurrent bind is blocked.
--   Q4/Q6/Q7:  close_shift derives expected_cash from the bound drawer's
--              expected_balance; a shift with an OPEN drawer cannot be closed
--              standalone (must run close_cash_register first). The
--              expected_cash=0 hardcode is fully removed on the drawer path.
--   Q5:        non-cashier opening is validated (active staff, A-frozen); the
--              drawer binds to the opener's own open shift.
--
-- AUDIT FINDINGS being fixed (evidence-backed, no invented rules):
--   * open_cash_register CRASHED on every open (live-verified):
--     cash_drawer_sessions.location_id/organization_id are NOT NULL with no
--     default, and the fn inserted neither → enforce_cash_drawer_staff_org
--     raised "drawer org=<NULL>". Now resolved from the opener's ACTIVE
--     session (session.organization_id + active_location_id), same S-01
--     pattern; the org-enforcement trigger is satisfied (session org = staff org).
--   * close_cash_register_v2 previously left the bound shift OPEN and never
--     wrote cash_drawer_logs. Now it atomically closes the bound shift,
--     derives expected_cash from the drawer expected_balance, writes the
--     cash_drawer_logs audit row, and triggers overtime (S-04 hook).
--
-- The existing manager-approval + variance-threshold + audit chain in
-- close_cash_register_v2 is PRESERVED unchanged (it is correct).
--
-- GOLDEN RULE 5: auto-commit. Idempotent (ALTER ADD COLUMN IF NOT / DO block).
-- ============================================================================

-- 1:1 binding column (NULL-able: legacy/standalone drawers stay unbound)
ALTER TABLE public.cash_drawer_sessions ADD COLUMN IF NOT EXISTS shift_id uuid;

-- 1:1 guard: an OPEN drawer may bind to at most one shift; a shift may have at
-- most one OPEN drawer. (Closed drawers keep their historical shift_id, so the
-- uniqueness is scoped to open sessions.)
CREATE UNIQUE INDEX IF NOT EXISTS cash_drawer_open_shift_1to1
  ON public.cash_drawer_sessions (shift_id)
  WHERE status = 'open';

-- ----------------------------------------------------------------------------
-- open_cash_register(p_token, p_opening_balance, p_notes) — FIXED + BINDS.
-- Identity = opener token (A-frozen set_session_staff). Resolves loc/org from
-- the opener's active session and binds to the opener's single open shift.
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.open_cash_register(numeric, text, uuid);
CREATE OR REPLACE FUNCTION public.open_cash_register(
  p_token text,
  p_opening_balance numeric,
  p_notes text DEFAULT NULL::text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_opener uuid;
  v_org uuid;
  v_loc uuid;
  v_shift shifts%ROWTYPE;
  v_session_id uuid;
BEGIN
  PERFORM set_session_staff(p_token);
  v_opener := current_staff_id();
  v_org := current_org_id();
  v_loc := nullif(current_setting('app.current_location_id'), '')::uuid;

  -- Q5: opener must have an ACTIVE session with a location/org
  IF v_org IS NULL OR v_loc IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No active location in session');
  END IF;

  -- bind to the opener's single open shift (1:1). FOR UPDATE makes concurrent
  -- binds on the same shift serialize; the second gets ALREADY_BOUND via the
  -- unique open-drawer check below.
  SELECT * INTO v_shift FROM shifts
  WHERE staff_id = v_opener AND closed_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'OPEN_SHIFT_REQUIRED');
  END IF;

  IF EXISTS (SELECT 1 FROM cash_drawer_sessions
             WHERE shift_id = v_shift.id AND status = 'open') THEN
    RETURN jsonb_build_object('success', false, 'error', 'DRAWER_ALREADY_BOUND');
  END IF;

  -- Atomic 1:1 (Q10): the unique index cash_drawer_open_shift_1to1 is the
  -- backstop for the TOCTOU race — two concurrent opens serialize on the shift
  -- FOR UPDATE; the loser gets a clean DRAWER_ALREADY_BOUND, not a raw 500.
  BEGIN
    INSERT INTO cash_drawer_sessions
      (opening_balance, status, notes, opened_by, organization_id, location_id, shift_id)
    VALUES (p_opening_balance, 'open', p_notes, v_opener, v_org, v_loc, v_shift.id)
    RETURNING id INTO v_session_id;
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('success', false, 'error', 'DRAWER_ALREADY_BOUND');
  END;

  -- propagate opening cash to the shift (expected_cash derived later at close)
  UPDATE shifts SET starting_cash = p_opening_balance WHERE id = v_shift.id;

  INSERT INTO cash_drawer_log (session_id, type, amount, description, created_by)
  VALUES (v_session_id, 'open', p_opening_balance, COALESCE(p_notes, 'Kassa açıldı'), v_opener);

  PERFORM log_audit(
    'cash_register_opened'::text, 'cash_drawer_session'::text, v_session_id::text,
    v_opener, NULL::text, NULL::jsonb,
    jsonb_build_object('opening_balance', p_opening_balance, 'shift_id', v_shift.id,
                       'location_id', v_loc, 'organization_id', v_org),
    NULL::jsonb, NULL::text
  );

  RETURN jsonb_build_object('success', true, 'id', v_session_id,
                            'opening_balance', p_opening_balance, 'shift_id', v_shift.id);
END;
$$;
GRANT EXECUTE ON FUNCTION public.open_cash_register(text, numeric, text) TO service_role;

-- ----------------------------------------------------------------------------
-- close_cash_register_v2 — PRESERVES the existing manager-approval + variance
-- + audit chain; ADDS: after the drawer closes, atomically close the bound
-- shift (expected_cash := drawer expected_balance, actual_cash := counted),
-- write the cash_drawer_logs audit row, and trigger overtime (S-04 hook).
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.close_cash_register_v2(uuid, numeric, text, uuid, uuid);
CREATE OR REPLACE FUNCTION public.close_cash_register_v2(
  p_session_id uuid,
  p_actual_cash numeric,
  p_notes text,
  p_manager_id uuid,
  p_performed_by uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session RECORD;
  v_expected_balance NUMERIC;
  v_difference NUMERIC;
  v_log_entry RECORD;
  v_manager_name TEXT;
  v_performer_name TEXT;
  v_requires_approval BOOLEAN := false;
  v_metadata JSONB;
  v_now TIMESTAMPTZ := NOW();
  v_threshold NUMERIC;
  v_manager_required BOOLEAN;
  v_shift RECORD;
  v_shift_closed BOOLEAN := false;
  v_ot jsonb;
BEGIN
  SELECT * INTO v_session FROM public.cash_drawer_sessions
  WHERE id = p_session_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Session not found');
  END IF;

  IF v_session.status = 'closed' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Session already closed', 'closed_at', v_session.closed_at);
  END IF;

  -- Read policy from settings
  SELECT cash_close_variance_threshold, cash_close_manager_required
    INTO v_threshold, v_manager_required
  FROM public.settings LIMIT 1;

  v_threshold := COALESCE(v_threshold, 0);
  v_manager_required := COALESCE(v_manager_required, false);

  -- Calculate expected balance SERVER-SIDE from the LEDGER (never trust client).
  -- Bug fix: the original also started from opening_balance, double-counting the
  -- opening float (open_cash_register writes an 'open' ledger row for it). The
  -- ledger is the single source of truth (SSOT); start from 0.
  v_expected_balance := 0;
  FOR v_log_entry IN
    SELECT type, amount FROM public.cash_drawer_log
    WHERE session_id = p_session_id
    ORDER BY created_at ASC
  LOOP
    IF v_log_entry.type IN ('cash_in', 'payment', 'open') THEN
      v_expected_balance := v_expected_balance + v_log_entry.amount;
    ELSIF v_log_entry.type IN ('cash_out', 'close') THEN
      v_expected_balance := v_expected_balance - v_log_entry.amount;
    END IF;
  END LOOP;

  v_difference := COALESCE(p_actual_cash, 0) - v_expected_balance;

  -- Manager approval required when: variance exceeds threshold OR policy demands it
  v_requires_approval := (ABS(v_difference) > v_threshold) OR v_manager_required;

  IF v_requires_approval THEN
    IF p_manager_id IS NULL THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Manager approval required',
        'requires_approval', true,
        'difference', v_difference,
        'expected_balance', v_expected_balance,
        'threshold', v_threshold,
        'manager_required_policy', v_manager_required
      );
    END IF;

    -- Bug fix: original referenced non-existent staff.role (it is role_id).
    -- Correct A-frozen pattern: normalize_role(roles.name) via staff→roles join.
    IF NOT EXISTS (
      SELECT 1 FROM public.staff st
      JOIN public.roles r ON r.id = st.role_id
      WHERE st.id = p_manager_id
        AND normalize_role(r.name) IN ('superadmin', 'admin', 'manager')
        AND st.is_active = true
    ) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Invalid manager credentials');
    END IF;

    SELECT name INTO v_manager_name FROM public.staff WHERE id = p_manager_id;
  END IF;

  IF p_performed_by IS NOT NULL THEN
    SELECT name INTO v_performer_name FROM public.staff WHERE id = p_performed_by;
  END IF;

  UPDATE public.cash_drawer_sessions SET
    status = 'closed',
    closing_balance = p_actual_cash,
    expected_balance = v_expected_balance,
    difference = v_difference,
    closed_at = v_now,
    closed_by = p_performed_by,
    notes = COALESCE(p_notes, notes),
    approved_by = CASE WHEN v_requires_approval THEN p_manager_id ELSE NULL END,
    approval_note = CASE WHEN v_requires_approval THEN 'manager approval ' || coalesce(p_manager_id::text, '') ELSE NULL END
  WHERE id = p_session_id;

  INSERT INTO public.cash_drawer_log (
    session_id, type, amount, description, created_by
  ) VALUES (
    p_session_id, 'close', COALESCE(p_actual_cash, 0),
    COALESCE(p_notes, 'Kassa bağlandı. Fərq: ' || ROUND(v_difference, 2) || '₼'),
    p_performed_by
  );

  v_metadata := jsonb_build_object(
    'session_id', p_session_id,
    'opening_balance', v_session.opening_balance,
    'expected_balance', v_expected_balance,
    'actual_cash', p_actual_cash,
    'difference', v_difference,
    'requires_approval', v_requires_approval,
    'manager_id', p_manager_id,
    'manager_name', v_manager_name,
    'notes', p_notes,
    'threshold', v_threshold,
    'manager_required_policy', v_manager_required
  );

  PERFORM public.log_audit(
    'cash_close', 'cash_drawer_session', p_session_id::text,
    p_performed_by, v_performer_name,
    jsonb_build_object('status', 'open', 'opening_balance', v_session.opening_balance),
    jsonb_build_object('status', 'closed', 'closing_balance', p_actual_cash, 'difference', v_difference),
    v_metadata, NULL
  );

  IF v_requires_approval AND p_manager_id IS NOT NULL THEN
    PERFORM public.log_audit(
      'manager_approval', 'cash_drawer_session', p_session_id::text,
      p_manager_id, v_manager_name, NULL,
      jsonb_build_object('approved', true, 'difference', v_difference),
      jsonb_build_object('variance', v_difference, 'cashier_id', p_performed_by, 'cashier_name', v_performer_name),
      NULL
    );
  END IF;

  -- ===========================================================================
  -- S-08 (frozen 1:1 + bind&derive): atomically close the bound shift.
  -- expected_cash := drawer expected_balance (server-derived, NEVER 0);
  -- actual_cash := counted. Writes the cash_drawer_logs audit row and triggers
  -- overtime (S-04 hook). Best-effort: if the shift is already closed we still
  -- keep the drawer closed and report it.
  -- ===========================================================================
  IF v_session.shift_id IS NOT NULL THEN
    SELECT * INTO v_shift FROM public.shifts
    WHERE id = v_session.shift_id FOR UPDATE;
    IF FOUND AND v_shift.closed_at IS NULL THEN
      UPDATE public.shifts SET
        closed_at = v_now,
        status = 'CLOSED',
        expected_cash = v_expected_balance,
        actual_cash = COALESCE(p_actual_cash, 0),
        difference = v_difference,
        notes = COALESCE(p_notes, notes)
      WHERE id = v_shift.id;
      v_shift_closed := true;

      INSERT INTO public.cash_drawer_logs (
        shift_id, staff_id, action, amount, description,
        starting_cash, expected_cash, actual_cash, difference,
        opened_at, closed_at, notes
      ) VALUES (
        v_shift.id, v_shift.staff_id, 'close_day',
        v_expected_balance,
        'Drawer close → shift close (expected from cash_drawer_session ' || left(p_session_id::text, 8) || ')',
        COALESCE(v_shift.starting_cash, 0),
        v_expected_balance,
        COALESCE(p_actual_cash, 0),
        v_difference,
        v_shift.opened_at,
        v_now,
        p_notes
      );

      -- S-04: overtime on close (idempotent)
      BEGIN
        v_ot := public.calculate_shift_overtime(v_shift.id);
      EXCEPTION WHEN OTHERS THEN
        v_ot := jsonb_build_object('success', false, 'error', SQLERRM);
      END;

      PERFORM public.log_audit(
        'shift_closed_via_drawer', 'shift', v_shift.id::text,
        COALESCE(p_performed_by, v_shift.staff_id), v_performer_name,
        jsonb_build_object('status', 'OPEN', 'expected_cash', v_expected_balance),
        jsonb_build_object('status', 'CLOSED', 'expected_cash', v_expected_balance,
                           'actual_cash', p_actual_cash, 'difference', v_difference, 'overtime', v_ot),
        NULL, NULL
      );
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'session_id', p_session_id,
    'expected_balance', v_expected_balance,
    'actual_cash', p_actual_cash,
    'difference', v_difference,
    'requires_approval', v_requires_approval,
    'manager_approved', v_requires_approval,
    'closed_at', v_now,
    'shift_id', v_session.shift_id,
    'shift_closed', v_shift_closed,
    'overtime', v_ot
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.close_cash_register_v2(uuid, numeric, text, uuid, uuid) TO service_role;

-- ----------------------------------------------------------------------------
-- close_shift — S-08: a shift with an OPEN bound drawer cannot be closed
-- standalone (must close the drawer first, which closes the shift).
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
    v_open_drawer uuid;
BEGIN
    PERFORM set_session_staff(p_token);
    v_staff_id := current_staff_id();
    v_org_id := current_org_id();

    SELECT * INTO v_shift FROM shifts WHERE id = p_shift_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Shift not found'; END IF;
    IF v_shift.staff_id != v_staff_id AND NOT is_superadmin() THEN
        RAISE EXCEPTION 'Cannot close another staff shift';
    END IF;
    IF v_shift.status = 'CLOSED' THEN
        RAISE EXCEPTION 'Shift already closed';
    END IF;

    -- S-08 (frozen): if a drawer is still OPEN and bound to this shift, the
    -- drawer must be closed first (close_cash_register_v2 closes the shift
    -- atomically). Prevents losing the expected_cash derivation.
    SELECT id INTO v_open_drawer FROM cash_drawer_sessions
    WHERE shift_id = p_shift_id AND status = 'open';
    IF FOUND THEN
        RAISE EXCEPTION 'DRAWER_OPEN: close the cash drawer first (session %)', v_open_drawer;
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
GRANT EXECUTE ON FUNCTION public.close_shift(text, uuid, numeric, text) TO service_role;


-- ----------------------------------------------------------------------------
-- recalculate_cash_session — same double-count fix: ledger is SSOT (start 0),
-- the 'open' row already carries the opening float.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.recalculate_cash_session(p_session_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session cash_drawer_sessions%ROWTYPE;
  v_expected NUMERIC;
BEGIN
  SELECT * INTO v_session FROM cash_drawer_sessions WHERE id = p_session_id FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT COALESCE(SUM(CASE WHEN type IN ('payment','cash_in','card_payment','open') THEN amount ELSE 0 END), 0)
         - COALESCE(SUM(CASE WHEN type IN ('cash_out') THEN amount ELSE 0 END), 0)
    INTO v_expected
    FROM cash_drawer_log
    WHERE session_id = p_session_id;
  UPDATE cash_drawer_sessions SET expected_balance = v_expected WHERE id = p_session_id;
  RETURN v_expected;
END;
$$;
GRANT EXECUTE ON FUNCTION public.recalculate_cash_session(uuid) TO service_role;
