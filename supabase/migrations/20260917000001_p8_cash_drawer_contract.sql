-- ============================================================================
-- P-8 CASH DRAWER CONTRACT (2026-09-17)
-- Ratified: Q1=A Q2=A Q3=matrix-defaults Q4=A Q5=B Q6=A (matrix §10)
-- Scope: cash-drawer contract ONLY. NOT in this file: P-9 schema normalization,
-- any P-1..P-7 contract change (T-3 is a NEW P-8 fix on the drawer surface).
-- E/S frozen-gate compat (54/54 must stay green):
--   * 5-arg close_cash_register_v2 overload KEPT (E/S R5 calls it via psql)
--   * clock_in_token/clock_out_token KEPT (E/S R13 via psql) — client roles only
--   * state guard allows open->closed (E/S direct-SQL cleanups) — postgres role
--   * no 'CURRENT_DATE' literal introduced into E/S A5-listed fn bodies
--   * E/S A7: no p_pin/p_opened_by/legacy rpc patterns (this is SQL, unaffected)
-- Ledger immutability: NO existing cash_drawer_log rows deleted/modified.
-- ============================================================================

-- (single-txn sections below)

-- ────────────────────────────────────────────────────────────────────────────
-- 1. LEDGER CHECKS: new movement types + signed 'reopen' (D-3, Q2=A)
-- Canonical walk (SSOT, single formula everywhere):
--   expected = +(cash_in, payment, open)  - (cash_out, close, refund, void, reopen)
--   'reopen' rows carry SIGNED amount = -(previous 'close' amount), so a
--   (close, reopen) pair nets to zero at re-close. amount < 0 ONLY for 'reopen'.
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.cash_drawer_log DROP CONSTRAINT cash_drawer_log_type_check;
ALTER TABLE public.cash_drawer_log
  ADD CONSTRAINT cash_drawer_log_type_check CHECK (type IN (
    'cash_in','cash_out','payment','card_payment','voucher_payment',
    'open','close','refund','void','reopen'));

ALTER TABLE public.cash_drawer_log DROP CONSTRAINT cash_drawer_log_amount_positive;
ALTER TABLE public.cash_drawer_log
  ADD CONSTRAINT cash_drawer_log_amount_check CHECK (amount >= 0 OR type = 'reopen');

-- ────────────────────────────────────────────────────────────────────────────
-- 2. CANONICAL WALK HELPER (D-4 unification)
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cash_session_expected(p_session_id uuid)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(SUM(
    CASE
      WHEN type IN ('cash_in','payment','open') THEN amount
      WHEN type IN ('cash_out','close','refund','void','reopen') THEN -amount
      ELSE 0
    END), 0)
  FROM public.cash_drawer_log
  WHERE session_id = p_session_id;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. DRAWER <-> PAYMENT BRIDGE REWRITE (D-1 scope, D-3 refund/void, T-3 lock)
--    * location + org scoped (order's own location/org — never global newest)
--    * FOR UPDATE on the chosen session (T-3: serializes vs close v2; a close
--      committed in between makes this tx see 'closed' -> scoped skip)
--    * no open session at that location -> NO ledger row (documented skip)
--    * covers: ->paid (payment), paid->cancelled (void), paid drop (refund /
--      P-6 reopen reversal)
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.find_open_cash_session(p_location_id uuid, p_org_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id uuid;
BEGIN
  SELECT id INTO v_id
  FROM public.cash_drawer_sessions
  WHERE status = 'open'
    AND location_id = p_location_id
    AND (p_org_id IS NULL OR organization_id = p_org_id)
  ORDER BY opened_at DESC
  LIMIT 1
  FOR UPDATE;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_record_cash_drawer()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_session_id uuid;
  v_amount numeric;
BEGIN
  -- Only cash-method orders move physical cash.
  IF NEW.payment_method IS DISTINCT FROM 'cash' THEN
    RETURN NEW;
  END IF;
  IF NEW.location_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- (a) ->paid: book the payment (original P-7-era behavior, now scoped+locked)
  IF NEW.status = 'paid' AND OLD.status IS DISTINCT FROM 'paid' THEN
    v_amount := COALESCE(NEW.paid_amount, 0) - COALESCE(NEW.tip_amount, 0);
    IF v_amount > 0 THEN
      v_session_id := public.find_open_cash_session(NEW.location_id, NEW.organization_id);
      IF v_session_id IS NOT NULL THEN
        INSERT INTO public.cash_drawer_log (session_id, type, amount, description, order_id)
        VALUES (v_session_id, 'payment', v_amount, 'Nağd ödəniş', NEW.id);
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  -- (b) void: paid -> cancelled — full reversal of the booked amount
  IF OLD.status = 'paid' AND NEW.status = 'cancelled' THEN
    v_amount := COALESCE(OLD.paid_amount, 0) - COALESCE(OLD.tip_amount, 0);
    IF v_amount > 0 THEN
      v_session_id := public.find_open_cash_session(NEW.location_id, NEW.organization_id);
      IF v_session_id IS NOT NULL THEN
        INSERT INTO public.cash_drawer_log (session_id, type, amount, description, order_id)
        VALUES (v_session_id, 'void', v_amount, 'Nağd void', NEW.id);
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  -- (c) refund / reopen reversal: paid_amount dropped (partial refund, full
  --     refund, or P-6 trusted reopen resetting the order pre-paid)
  IF OLD.paid_amount IS NOT NULL AND NEW.paid_amount IS NOT NULL
     AND NEW.paid_amount < OLD.paid_amount THEN
    v_amount := OLD.paid_amount - NEW.paid_amount;
    IF v_amount > 0 THEN
      v_session_id := public.find_open_cash_session(NEW.location_id, NEW.organization_id);
      IF v_session_id IS NOT NULL THEN
        INSERT INTO public.cash_drawer_log (session_id, type, amount, description, order_id)
        VALUES (v_session_id, 'refund', v_amount, 'Nağd refund/reopen reversal', NEW.id);
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_record_cash_payment ON public.orders;
DROP FUNCTION IF EXISTS public.fn_record_cash_payment();
CREATE TRIGGER trg_record_cash_drawer
AFTER UPDATE OF status, paid_amount ON public.orders
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status OR OLD.paid_amount IS DISTINCT FROM NEW.paid_amount)
EXECUTE FUNCTION public.fn_record_cash_drawer();

-- ────────────────────────────────────────────────────────────────────────────
-- 4. RECALCULATE = canonical walk (D-4; was: divergent + card-as-cash)
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.recalculate_cash_session(p_session_id uuid)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_session cash_drawer_sessions%ROWTYPE;
  v_expected NUMERIC;
BEGIN
  SELECT * INTO v_session FROM public.cash_drawer_sessions WHERE id = p_session_id FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  v_expected := public.cash_session_expected(p_session_id); -- P-8 canonical walk
  UPDATE public.cash_drawer_sessions SET expected_balance = v_expected WHERE id = p_session_id;
  RETURN v_expected;
END;
$$;


-- ────────────────────────────────────────────────────────────────────────────
-- 5. close_cash_register_v2 — hardened (D-5/D-10/D-11/D-12 + Q2 walk)
--    New 7-arg signature; a 5-arg compat overload is kept for the frozen E/S
--    harness (R5) and service contexts (p_token NULL = trusted, no identity
--    checks — EXACTLY the pre-P-8 behavior for those callers).
-- ────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.close_cash_register_v2(uuid, numeric, text, uuid, uuid);

CREATE FUNCTION public.close_cash_register_v2(
  p_session_id uuid, p_actual_cash numeric, p_notes text,
  p_manager_id uuid, p_performed_by uuid,
  p_token text, p_idempotency_key text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_session RECORD;
  v_expected_balance NUMERIC;
  v_difference NUMERIC;
  v_manager_name TEXT;
  v_performer_name TEXT;
  v_actor uuid;
  v_requires_approval BOOLEAN := false;
  v_metadata JSONB;
  v_now TIMESTAMPTZ := NOW();
  v_threshold NUMERIC;
  v_manager_required BOOLEAN;
  v_shift RECORD;
  v_shift_closed BOOLEAN := false;
  v_ot jsonb;
  v_idem_oid uuid;
  v_idem_amt numeric;
  v_idem_res jsonb;
  v_result jsonb;
BEGIN
  SELECT * INTO v_session FROM public.cash_drawer_sessions
  WHERE id = p_session_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Session not found');
  END IF;

  IF v_session.status = 'closed' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Session already closed', 'closed_at', v_session.closed_at);
  END IF;

  -- P-8 (D-5/D-10/D-11): token path = app/route context → full identity +
  -- location binding + idempotency. p_token NULL = trusted service/postgres
  -- context (harness, cron, internal) → pre-P-8 semantics.
  IF p_token IS NOT NULL THEN
    PERFORM public.set_session_staff(p_token);
    v_actor := current_staff_id();
    IF p_performed_by IS NOT NULL AND p_performed_by IS DISTINCT FROM v_actor THEN
      RETURN jsonb_build_object('success', false, 'error', 'PERFORMER_MISMATCH');
    END IF;
    IF v_session.organization_id IS DISTINCT FROM current_org_id() THEN
      RETURN jsonb_build_object('success', false, 'error', 'ORG_MISMATCH');
    END IF;
    IF v_session.location_id IS NOT NULL AND NOT public.has_location_access(v_session.location_id) THEN
      RETURN jsonb_build_object('success', false, 'error', 'LOCATION_FORBIDDEN');
    END IF;
    IF p_idempotency_key IS NOT NULL THEN
      SELECT order_id, amount, result INTO v_idem_oid, v_idem_amt, v_idem_res
      FROM public.payment_idempotency_keys
      WHERE namespace = 'drawer' AND key = p_idempotency_key;
      IF FOUND THEN
        IF v_idem_oid IS DISTINCT FROM p_session_id
           OR v_idem_amt IS DISTINCT FROM COALESCE(p_actual_cash, 0) THEN
          RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT: key % is bound to session % amount %; request was session % amount %',
            p_idempotency_key, v_idem_oid, v_idem_amt, p_session_id, p_actual_cash;
        END IF;
        RETURN COALESCE(v_idem_res, jsonb_build_object('success', false, 'error', 'IDEMPOTENCY_DATA_MISSING'))
               || jsonb_build_object('idempotent', true, 'duplicate', true);
      END IF;
    END IF;
  END IF;

  -- Read policy from settings
  SELECT cash_close_variance_threshold, cash_close_manager_required
    INTO v_threshold, v_manager_required
  FROM public.settings LIMIT 1;

  v_threshold := COALESCE(v_threshold, 0);
  v_manager_required := COALESCE(v_manager_required, false);

  -- P-8 (D-4): SERVER-SIDE expected from the LEDGER via the single canonical
  -- walk (cash_session_expected) — never trust client; includes the new
  -- refund/void/reopen movement types (Q2).
  v_expected_balance := public.cash_session_expected(p_session_id);

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

    -- A-frozen pattern: normalize_role(roles.name) via staff->roles join.
    -- P-8 (D-5): approver must belong to the SESSION'S organization.
    IF NOT EXISTS (
      SELECT 1 FROM public.staff st
      JOIN public.roles r ON r.id = st.role_id
      WHERE st.id = p_manager_id
        AND normalize_role(r.name) IN ('superadmin', 'admin', 'manager')
        AND st.is_active = true
        AND st.organization_id = v_session.organization_id
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
    closed_by = COALESCE(p_performed_by, v_actor),
    notes = COALESCE(p_notes, notes),
    approved_by = CASE WHEN v_requires_approval THEN p_manager_id ELSE NULL END,
    approval_note = CASE WHEN v_requires_approval THEN 'manager approval ' || coalesce(p_manager_id::text, '') ELSE NULL END
  WHERE id = p_session_id;

  INSERT INTO public.cash_drawer_log (
    session_id, type, amount, description, created_by
  ) VALUES (
    p_session_id, 'close', COALESCE(p_actual_cash, 0),
    COALESCE(p_notes, 'Kassa bağlandı. Fərq: ' || ROUND(v_difference, 2) || '₼'),
    COALESCE(p_performed_by, v_actor)
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
    COALESCE(p_performed_by, v_actor), v_performer_name,
    jsonb_build_object('status', 'open', 'opening_balance', v_session.opening_balance),
    jsonb_build_object('status', 'closed', 'closing_balance', p_actual_cash, 'difference', v_difference),
    v_metadata, NULL
  );

  IF v_requires_approval AND p_manager_id IS NOT NULL THEN
    PERFORM public.log_audit(
      'manager_approval', 'cash_drawer_session', p_session_id::text,
      p_manager_id, v_manager_name, NULL,
      jsonb_build_object('approved', true, 'difference', v_difference),
      jsonb_build_object('variance', v_difference, 'cashier_id', COALESCE(p_performed_by, v_actor), 'cashier_name', v_performer_name),
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
        COALESCE(p_performed_by, v_actor, v_shift.staff_id), v_performer_name,
        jsonb_build_object('status', 'OPEN', 'expected_cash', v_expected_balance),
        jsonb_build_object('status', 'CLOSED', 'expected_cash', v_expected_balance,
                           'actual_cash', p_actual_cash, 'difference', v_difference, 'overtime', v_ot),
        NULL, NULL
      );
    END IF;
  END IF;

  v_result := jsonb_build_object(
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

  -- P-8 (D-11): bind the idempotency key AFTER the domain write (P-4 pattern).
  IF p_token IS NOT NULL AND p_idempotency_key IS NOT NULL THEN
    INSERT INTO public.payment_idempotency_keys (key, order_id, amount, status, result, namespace)
    VALUES (p_idempotency_key, p_session_id, COALESCE(p_actual_cash, 0), 'processed', v_result, 'drawer');
  END IF;

  -- P-8 (D-12): outbox
  PERFORM public.emit_outbox_event(
    'cash_drawer_session', p_session_id, 'cash_drawer_session.closed',
    jsonb_build_object('expected_balance', v_expected_balance, 'actual_cash', p_actual_cash,
                       'difference', v_difference, 'shift_closed', v_shift_closed),
    jsonb_build_object('location_id', v_session.location_id, 'organization_id', v_session.organization_id)
  );

  RETURN v_result;
END;
$$;

-- 5-arg compat overload (frozen E/S R5 + service contexts): trusted path.
CREATE FUNCTION public.close_cash_register_v2(
  p_session_id uuid, p_actual_cash numeric, p_notes text,
  p_manager_id uuid, p_performed_by uuid
) RETURNS jsonb LANGUAGE sql SECURITY DEFINER AS $$
  SELECT public.close_cash_register_v2(p_session_id, p_actual_cash, p_notes,
                                       p_manager_id, p_performed_by, NULL, NULL);
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- 6. open_cash_register — unchanged contract + outbox (D-12)
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.open_cash_register(p_token text, p_opening_balance numeric, p_notes text DEFAULT NULL::text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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

  -- P-8 (D-12): outbox
  PERFORM public.emit_outbox_event(
    'cash_drawer_session', v_session_id, 'cash_drawer_session.opened',
    jsonb_build_object('opening_balance', p_opening_balance, 'shift_id', v_shift.id),
    jsonb_build_object('location_id', v_loc, 'organization_id', v_org)
  );

  RETURN jsonb_build_object('success', true, 'id', v_session_id,
                            'opening_balance', p_opening_balance, 'shift_id', v_shift.id);
END;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- 7. cash_in_atomic / cash_out_atomic — identity + idempotency + outbox
--    (D-5/D-10/D-11/D-12). 6-arg main + 4-arg compat overloads (service paths
--    keep pre-P-8 semantics; app routes pass p_token).
-- ────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.cash_in_atomic(uuid, numeric, text, uuid);
DROP FUNCTION IF EXISTS public.cash_out_atomic(uuid, numeric, text, uuid);

CREATE FUNCTION public.cash_in_atomic(
  p_session_id uuid, p_amount numeric, p_description text,
  p_performed_by uuid, p_token text, p_idempotency_key text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_session RECORD;
  v_actor uuid;
  v_performed uuid;
  v_performer_name TEXT;
  v_now TIMESTAMPTZ := NOW();
  v_idem_oid uuid; v_idem_amt numeric; v_idem_res jsonb;
  v_result jsonb;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Amount must be positive');
  END IF;

  SELECT * INTO v_session FROM public.cash_drawer_sessions
  WHERE id = p_session_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Session not found');
  END IF;

  IF v_session.status != 'open' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Session is not open');
  END IF;

  v_performed := p_performed_by;
  IF p_token IS NOT NULL THEN
    PERFORM public.set_session_staff(p_token);
    v_actor := current_staff_id();
    IF p_performed_by IS NOT NULL AND p_performed_by IS DISTINCT FROM v_actor THEN
      RETURN jsonb_build_object('success', false, 'error', 'PERFORMER_MISMATCH');
    END IF;
    v_performed := v_actor;
    IF v_session.organization_id IS DISTINCT FROM current_org_id() THEN
      RETURN jsonb_build_object('success', false, 'error', 'ORG_MISMATCH');
    END IF;
    IF v_session.location_id IS NOT NULL AND NOT public.has_location_access(v_session.location_id) THEN
      RETURN jsonb_build_object('success', false, 'error', 'LOCATION_FORBIDDEN');
    END IF;
    IF p_idempotency_key IS NOT NULL THEN
      SELECT order_id, amount, result INTO v_idem_oid, v_idem_amt, v_idem_res
      FROM public.payment_idempotency_keys
      WHERE namespace = 'drawer' AND key = p_idempotency_key;
      IF FOUND THEN
        IF v_idem_oid IS DISTINCT FROM p_session_id OR v_idem_amt IS DISTINCT FROM p_amount THEN
          RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT: key % is bound to session % amount %; request was session % amount %',
            p_idempotency_key, v_idem_oid, v_idem_amt, p_session_id, p_amount;
        END IF;
        RETURN COALESCE(v_idem_res, jsonb_build_object('success', false, 'error', 'IDEMPOTENCY_DATA_MISSING'))
               || jsonb_build_object('idempotent', true, 'duplicate', true);
      END IF;
    END IF;
  END IF;

  IF v_performed IS NOT NULL THEN
    SELECT name INTO v_performer_name FROM public.staff WHERE id = v_performed;
  END IF;

  INSERT INTO public.cash_drawer_log (session_id, type, amount, description, created_by)
  VALUES (p_session_id, 'cash_in', p_amount, COALESCE(p_description, 'Kassa daxilolma'), v_performed);

  PERFORM public.log_audit(
    'cash_in', 'cash_drawer_session', p_session_id::text,
    v_performed, v_performer_name,
    NULL,
    jsonb_build_object('amount', p_amount, 'type', 'cash_in', 'description', p_description),
    jsonb_build_object('session_id', p_session_id),
    NULL
  );

  v_result := jsonb_build_object(
    'success', true,
    'session_id', p_session_id,
    'amount', p_amount,
    'type', 'cash_in',
    'created_at', v_now
  );

  IF p_token IS NOT NULL AND p_idempotency_key IS NOT NULL THEN
    INSERT INTO public.payment_idempotency_keys (key, order_id, amount, status, result, namespace)
    VALUES (p_idempotency_key, p_session_id, p_amount, 'processed', v_result, 'drawer');
  END IF;

  PERFORM public.emit_outbox_event(
    'cash_drawer_session', p_session_id, 'cash_drawer_session.cash_in',
    jsonb_build_object('amount', p_amount, 'type', 'cash_in'),
    jsonb_build_object('location_id', v_session.location_id, 'organization_id', v_session.organization_id)
  );

  RETURN v_result;
END;
$$;

CREATE FUNCTION public.cash_in_atomic(
  p_session_id uuid, p_amount numeric, p_description text, p_performed_by uuid
) RETURNS jsonb LANGUAGE sql SECURITY DEFINER AS $$
  SELECT public.cash_in_atomic(p_session_id, p_amount, p_description, p_performed_by, NULL, NULL);
$$;

CREATE FUNCTION public.cash_out_atomic(
  p_session_id uuid, p_amount numeric, p_description text,
  p_performed_by uuid, p_token text, p_idempotency_key text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_session RECORD;
  v_actor uuid;
  v_performed uuid;
  v_performer_name TEXT;
  v_now TIMESTAMPTZ := NOW();
  v_idem_oid uuid; v_idem_amt numeric; v_idem_res jsonb;
  v_result jsonb;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Amount must be positive');
  END IF;

  SELECT * INTO v_session FROM public.cash_drawer_sessions
  WHERE id = p_session_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Session not found');
  END IF;

  IF v_session.status != 'open' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Session is not open');
  END IF;

  v_performed := p_performed_by;
  IF p_token IS NOT NULL THEN
    PERFORM public.set_session_staff(p_token);
    v_actor := current_staff_id();
    IF p_performed_by IS NOT NULL AND p_performed_by IS DISTINCT FROM v_actor THEN
      RETURN jsonb_build_object('success', false, 'error', 'PERFORMER_MISMATCH');
    END IF;
    v_performed := v_actor;
    IF v_session.organization_id IS DISTINCT FROM current_org_id() THEN
      RETURN jsonb_build_object('success', false, 'error', 'ORG_MISMATCH');
    END IF;
    IF v_session.location_id IS NOT NULL AND NOT public.has_location_access(v_session.location_id) THEN
      RETURN jsonb_build_object('success', false, 'error', 'LOCATION_FORBIDDEN');
    END IF;
    IF p_idempotency_key IS NOT NULL THEN
      SELECT order_id, amount, result INTO v_idem_oid, v_idem_amt, v_idem_res
      FROM public.payment_idempotency_keys
      WHERE namespace = 'drawer' AND key = p_idempotency_key;
      IF FOUND THEN
        IF v_idem_oid IS DISTINCT FROM p_session_id OR v_idem_amt IS DISTINCT FROM p_amount THEN
          RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT: key % is bound to session % amount %; request was session % amount %',
            p_idempotency_key, v_idem_oid, v_idem_amt, p_session_id, p_amount;
        END IF;
        RETURN COALESCE(v_idem_res, jsonb_build_object('success', false, 'error', 'IDEMPOTENCY_DATA_MISSING'))
               || jsonb_build_object('idempotent', true, 'duplicate', true);
      END IF;
    END IF;
  END IF;

  IF v_performed IS NOT NULL THEN
    SELECT name INTO v_performer_name FROM public.staff WHERE id = v_performed;
  END IF;

  INSERT INTO public.cash_drawer_log (session_id, type, amount, description, created_by)
  VALUES (p_session_id, 'cash_out', p_amount, COALESCE(p_description, 'Kassa xərc'), v_performed);

  PERFORM public.log_audit(
    'cash_out', 'cash_drawer_session', p_session_id::text,
    v_performed, v_performer_name,
    NULL,
    jsonb_build_object('amount', p_amount, 'type', 'cash_out', 'description', p_description),
    jsonb_build_object('session_id', p_session_id),
    NULL
  );

  v_result := jsonb_build_object(
    'success', true,
    'session_id', p_session_id,
    'amount', p_amount,
    'type', 'cash_out',
    'created_at', v_now
  );

  IF p_token IS NOT NULL AND p_idempotency_key IS NOT NULL THEN
    INSERT INTO public.payment_idempotency_keys (key, order_id, amount, status, result, namespace)
    VALUES (p_idempotency_key, p_session_id, p_amount, 'processed', v_result, 'drawer');
  END IF;

  PERFORM public.emit_outbox_event(
    'cash_drawer_session', p_session_id, 'cash_drawer_session.cash_out',
    jsonb_build_object('amount', p_amount, 'type', 'cash_out'),
    jsonb_build_object('location_id', v_session.location_id, 'organization_id', v_session.organization_id)
  );

  RETURN v_result;
END;
$$;

CREATE FUNCTION public.cash_out_atomic(
  p_session_id uuid, p_amount numeric, p_description text, p_performed_by uuid
) RETURNS jsonb LANGUAGE sql SECURITY DEFINER AS $$
  SELECT public.cash_out_atomic(p_session_id, p_amount, p_description, p_performed_by, NULL, NULL);
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- 8. reopen_cash_register — identity + signed reversal row (Q2=A) + state GUC
--    4-arg main + 3-arg compat overload.
-- ────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.reopen_cash_register(uuid, uuid, text);

CREATE FUNCTION public.reopen_cash_register(
  p_session_id uuid, p_performed_by uuid, p_reason text, p_token text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_session cash_drawer_sessions%ROWTYPE;
  v_actor uuid;
  v_performed uuid;
  v_last_close numeric;
BEGIN
  v_performed := p_performed_by;
  IF p_token IS NOT NULL THEN
    PERFORM public.set_session_staff(p_token);
    v_actor := current_staff_id();
    IF NOT public.has_permission(v_actor, 'cash.reopen') THEN
      RETURN jsonb_build_object('success', false, 'error', 'FORBIDDEN');
    END IF;
    v_performed := v_actor;
  ELSIF NOT public.has_permission(p_performed_by, 'cash.reopen') THEN
    RETURN jsonb_build_object('success', false, 'error', 'FORBIDDEN');
  END IF;

  SELECT * INTO v_session FROM public.cash_drawer_sessions WHERE id = p_session_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'NOT_FOUND'); END IF;
  IF v_session.status <> 'closed' THEN RETURN jsonb_build_object('success', false, 'error', 'NOT_CLOSED'); END IF;

  IF p_token IS NOT NULL THEN
    IF v_session.organization_id IS DISTINCT FROM current_org_id() THEN
      RETURN jsonb_build_object('success', false, 'error', 'ORG_MISMATCH');
    END IF;
    IF v_session.location_id IS NOT NULL AND NOT public.has_location_access(v_session.location_id) THEN
      RETURN jsonb_build_object('success', false, 'error', 'LOCATION_FORBIDDEN');
    END IF;
  END IF;

  -- Q2=A: signed reversal row = -(previous close amount). The canonical walk
  -- sums 'reopen' in the minus branch, so -( -X ) = +X: the superseded close
  -- row nets out and the opening float is NOT double-counted.
  SELECT amount INTO v_last_close
  FROM public.cash_drawer_log
  WHERE session_id = p_session_id AND type = 'close'
  ORDER BY created_at DESC LIMIT 1;

  -- trusted reopen flag for the state-guard trigger (local scope)
  PERFORM set_config('app.drawer_reopen', 'true', false);

  UPDATE public.cash_drawer_sessions SET
    status = 'open', closed_at = NULL, closed_by = NULL, approved_by = NULL, approval_note = NULL,
    closing_balance = NULL, expected_balance = NULL, difference = NULL,
    notes = COALESCE(notes, '') || ' | reopened: ' || COALESCE(p_reason, '')
  WHERE id = p_session_id;

  INSERT INTO public.cash_drawer_log (session_id, type, amount, description, created_by)
  VALUES (p_session_id, 'reopen', -COALESCE(v_last_close, v_session.closing_balance, 0),
          'Reopened: ' || COALESCE(p_reason, ''), v_performed);

  PERFORM public.log_audit('cash_register_reopen', 'cash_register', p_session_id::text, v_performed,
    NULL::text,
    jsonb_build_object('previous_close', v_session.closed_at),
    jsonb_build_object('reason', p_reason, 'reversal_amount', -COALESCE(v_last_close, 0)), NULL, NULL);

  PERFORM public.emit_outbox_event(
    'cash_drawer_session', p_session_id, 'cash_drawer_session.reopened',
    jsonb_build_object('reason', p_reason),
    jsonb_build_object('location_id', v_session.location_id, 'organization_id', v_session.organization_id)
  );

  RETURN jsonb_build_object('success', true, 'session_id', p_session_id, 'status', 'open');
END;
$$;

CREATE FUNCTION public.reopen_cash_register(
  p_session_id uuid, p_performed_by uuid, p_reason text
) RETURNS jsonb LANGUAGE sql SECURITY DEFINER AS $$
  SELECT public.reopen_cash_register(p_session_id, p_performed_by, p_reason, NULL);
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- 9. force_clock_out — Q3 fix: drawer branch uses v2 close semantics
--    (was: status='force_closed' -> violated the CHECK constraint, whole fn
--    errored whenever the staff had ANY open drawer) + FOR UPDATE on shift.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.force_clock_out(p_staff_id uuid, p_reason text DEFAULT 'Forced by admin'::text, p_performed_by uuid DEFAULT NULL::uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_shift shifts%ROWTYPE;
  v_duration interval;
  v_ds uuid;
  v_closed_drawers integer := 0;
BEGIN
  -- Find active shift (P-8: locked)
  SELECT * INTO v_shift
  FROM public.shifts
  WHERE staff_id = p_staff_id AND closed_at IS NULL
  ORDER BY opened_at DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'NO_ACTIVE_SHIFT');
  END IF;

  v_duration := now() - v_shift.opened_at;

  -- Close the shift
  UPDATE public.shifts SET
    closed_at = now(),
    status = 'CLOSED',
    notes = COALESCE(notes, '') || ' | Force closed: ' || p_reason,
    updated_at = now()
  WHERE id = v_shift.id;

  -- End any active break
  UPDATE public.shift_breaks SET
    ended_at = now()
  WHERE shift_id = v_shift.id AND ended_at IS NULL;

  -- P-8 (Q3): close the staff's open drawer sessions with canonical v2
  -- semantics: actual := canonical walk (difference 0, ledger-consistent,
  -- audit + outbox + 'close' ledger row). The bound shift is already closed,
  -- so v2's S-08 branch skips it.
  FOR v_ds IN
    SELECT id FROM public.cash_drawer_sessions
    WHERE opened_by = p_staff_id AND status = 'open'
    FOR UPDATE
  LOOP
    PERFORM public.close_cash_register_v2(
      v_ds, public.cash_session_expected(v_ds),
      'Force closed: ' || COALESCE(p_reason, ''),
      NULL, p_performed_by, NULL, NULL
    );
    v_closed_drawers := v_closed_drawers + 1;
  END LOOP;

  -- Audit
  PERFORM public.log_audit(
    'force_clock_out', 'shifts', v_shift.id::text, p_performed_by,
    NULL,
    jsonb_build_object('opened_at', v_shift.opened_at, 'duration', v_duration),
    jsonb_build_object('reason', p_reason, 'forced_at', now(), 'drawers_closed', v_closed_drawers),
    NULL, NULL
  );

  PERFORM public.emit_outbox_event(
    'shift', v_shift.id, 'shift.force_closed',
    jsonb_build_object('drawers_closed', v_closed_drawers, 'reason', p_reason),
    NULL
  );

  RETURN jsonb_build_object(
    'success', true,
    'shift_id', v_shift.id,
    'duration_minutes', EXTRACT(EPOCH FROM v_duration) / 60,
    'reason', p_reason,
    'drawers_closed', v_closed_drawers
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- 10. auto_clockout_staff — D-2a: drawer guard + FOR UPDATE + audit + outbox
--     (was: closed shifts >12h with NO guard/lock/audit → orphaned open
--     drawers that keep absorbing cash payments)
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.auto_clockout_staff()
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_shift_id uuid;
  v_count INTEGER := 0;
BEGIN
  FOR v_shift_id IN
    SELECT s.id
    FROM public.shifts s
    WHERE s.closed_at IS NULL
      AND s.auto_closed = false
      AND s.opened_at < NOW() - INTERVAL '12 hours'
      AND NOT EXISTS (
        SELECT 1 FROM public.cash_drawer_sessions d
        WHERE d.shift_id = s.id AND d.status = 'open'
      ) -- P-8 (D-2a): never auto-close a shift with an open bound drawer
    FOR UPDATE
  LOOP
    UPDATE public.shifts
    SET closed_at = NOW(), auto_closed = true, auto_closed_at = NOW(),
        status = 'CLOSED',          -- 045 (E/S, proven regression): 019 invariant
        updated_at = NOW()
    WHERE id = v_shift_id;
    PERFORM public.log_audit(
      'auto_clock_out', 'shift', v_shift_id::text,
      NULL, NULL, NULL,
      jsonb_build_object('auto_closed', true),
      NULL, NULL
    );
    PERFORM public.emit_outbox_event(
      'shift', v_shift_id, 'shift.auto_closed',
      jsonb_build_object('auto_closed', true),
      NULL
    );
    v_count := v_count + 1;
  END LOOP;
  RETURN json_build_object('success', true, 'auto_closed_count', v_count);
END;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- 11. end_break_token — Q3: drop the compliance branch (shift_breaks
--     is_compliant/violation_reason columns do not exist → the branch was a
--     runtime landmine on any >30min unpaid break)
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.end_break_token(p_token text, p_target_id uuid)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_actor uuid;
  v_override boolean;
  v_shift RECORD;
  v_break RECORD;
  v_duration INTEGER;
BEGIN
  PERFORM set_session_staff(p_token);
  v_actor := current_staff_id();
  v_override := (p_target_id IS DISTINCT FROM v_actor)
                AND coalesce(has_permission(v_actor, 'timeclock.override'), false);
  IF p_target_id IS DISTINCT FROM v_actor AND NOT v_override THEN
    INSERT INTO security_events (staff_id, event_type, success, metadata)
    VALUES (v_actor, 'permission_denied', false,
      jsonb_build_object('action', 'end_break', 'target', p_target_id));
    RETURN json_build_object('success', false, 'error', 'PERMISSION_DENIED');
  END IF;

  SELECT * INTO v_shift FROM public.shifts
  WHERE staff_id = p_target_id AND closed_at IS NULL
  ORDER BY opened_at DESC LIMIT 1;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'No active shift');
  END IF;

  SELECT * INTO v_break FROM public.shift_breaks
  WHERE shift_id = v_shift.id AND ended_at IS NULL;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'No active break');
  END IF;

  UPDATE public.shift_breaks SET ended_at = NOW() WHERE id = v_break.id;
  v_duration := EXTRACT(EPOCH FROM (NOW() - v_break.started_at)) / 60;

  INSERT INTO public.time_clock_entries (staff_id, entry_type, source, timestamp)
  VALUES (p_target_id, 'break_end', 'pos_terminal', NOW());

  INSERT INTO public.time_clock_audit (action, performed_by, details)
  VALUES ('break_end', p_target_id, jsonb_build_object('duration_minutes', v_duration, 'actor', v_actor, 'override', v_override));

  RETURN json_build_object('success', true, 'duration_minutes', v_duration, 'override', v_override, 'ended_at', NOW());
END;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- 12. clock_in_atomic_token — D-16: report_date = location business day
--     (local_day), outbox (D-12). NO 'CURRENT_DATE' literal (E/S A5).
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.clock_in_atomic_token(p_token text, p_target_id uuid DEFAULT NULL::uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
  SELECT * INTO v_staff FROM public.staff WHERE id = v_target FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'STAFF_NOT_FOUND');
  END IF;
  IF NOT v_staff.is_active THEN
    RETURN jsonb_build_object('success', false, 'error', 'STAFF_INACTIVE');
  END IF;

  SELECT * INTO v_open_shift FROM public.shifts
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

  -- P-8 (D-16): report_date = location business day (was: column default =
  -- server timezone)
  INSERT INTO public.shifts (staff_id, report_date, opened_at, organization_id, location_id)
  VALUES (v_target, public.local_day(now(), v_loc), now(), v_staff.organization_id, v_loc)
  RETURNING * INTO v_result;

  PERFORM log_audit(
    'clock_in'::text, 'staff'::text, v_target::text, v_actor, NULL::text,
    jsonb_build_object('shift_id', v_result.id, 'location_id', v_loc, 'override', v_override),
    NULL::jsonb, NULL::jsonb, NULL::text
  );

  PERFORM public.emit_outbox_event(
    'shift', v_result.id, 'shift.opened',
    jsonb_build_object('staff_id', v_target, 'override', v_override),
    jsonb_build_object('location_id', v_loc, 'organization_id', v_staff.organization_id)
  );

  RETURN jsonb_build_object(
    'success', true, 'shift_id', v_result.id::text, 'staff_id', v_target,
    'location_id', v_loc, 'override', v_override, 'opened_at', now()
  );
END;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- 13. clock_out_atomic_token — outbox (D-12); contract otherwise unchanged
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.clock_out_atomic_token(p_token text, p_target_id uuid DEFAULT NULL::uuid, p_notes text DEFAULT NULL::text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
  SELECT * INTO v_staff FROM public.staff WHERE id = v_target FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'STAFF_NOT_FOUND'); END IF;
  IF NOT v_staff.is_active THEN RETURN jsonb_build_object('success', false, 'error', 'STAFF_INACTIVE'); END IF;
  SELECT * INTO v_open_shift FROM public.shifts WHERE staff_id = v_target AND closed_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'NO_OPEN_SHIFT'); END IF;

  SELECT id INTO v_drawer FROM public.cash_drawer_sessions
  WHERE shift_id = v_open_shift.id AND status = 'open';
  IF FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'DRAWER_OPEN', 'drawer_id', v_drawer);
  END IF;

  UPDATE public.shifts SET closed_at = now(), status = 'CLOSED',
    notes = CASE WHEN notes IS NULL OR notes = '' THEN p_notes ELSE notes || ' | ' || p_notes END,
    updated_at = now()
  WHERE id = v_open_shift.id RETURNING * INTO v_result;

  BEGIN
    v_ot := public.calculate_shift_overtime(v_result.id);
  EXCEPTION WHEN OTHERS THEN
    v_ot := jsonb_build_object('success', false, 'error', SQLERRM);
  END;

  PERFORM log_audit('clock_out'::text, 'staff'::text, v_target::text, v_actor, NULL::text,
    jsonb_build_object('shift_id', v_open_shift.id, 'override', v_override),
    jsonb_build_object('shift_id', v_result.id, 'closed_at', now(), 'status', 'CLOSED', 'overtime', v_ot),
    NULL::jsonb, NULL::text);

  PERFORM public.emit_outbox_event(
    'shift', v_result.id, 'shift.closed',
    jsonb_build_object('staff_id', v_target, 'override', v_override),
    jsonb_build_object('location_id', v_result.location_id, 'organization_id', v_result.organization_id)
  );

  RETURN jsonb_build_object('success', true, 'shift_id', v_result.id::text, 'staff_id', v_target, 'override', v_override, 'closed_at', now(), 'overtime', v_ot);
END;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- 14. DRAWER STATE-MACHINE GUARD (D-13)
--     Legal: open->closed; closed->open ONLY with the trusted local GUC
--     app.drawer_reopen (set by reopen_cash_register). Everything else raises.
--     UPDATE OF status only — direct open->closed cleanups (frozen E/S) pass.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.trg_cash_drawer_state_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    IF OLD.status = 'open' AND NEW.status = 'closed' THEN
      NULL; -- legal
    ELSIF OLD.status = 'closed' AND NEW.status = 'open' THEN
      IF COALESCE(current_setting('app.drawer_reopen', true), '') <> 'true' THEN
        RAISE EXCEPTION 'ILLEGAL_DRAWER_TRANSITION: closed->open only via reopen_cash_register'
          USING ERRCODE = 'P0001';
      END IF;
    ELSE
      RAISE EXCEPTION 'ILLEGAL_DRAWER_TRANSITION: % -> %', OLD.status, NEW.status
        USING ERRCODE = 'P0001';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cash_drawer_state_guard ON public.cash_drawer_sessions;
CREATE TRIGGER trg_cash_drawer_state_guard
BEFORE UPDATE OF status ON public.cash_drawer_sessions
FOR EACH ROW EXECUTE FUNCTION public.trg_cash_drawer_state_guard();

-- ────────────────────────────────────────────────────────────────────────────
-- 15. submit_shift_review — Q3: the missing partial unique index its
--     ON CONFLICT clause requires (was: always errored at runtime)
-- ────────────────────────────────────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS uq_shift_reviews_pending
  ON public.shift_reviews (shift_id) WHERE review_status = 'pending';

-- ────────────────────────────────────────────────────────────────────────────
-- 16. EXECUTE GRANTS (D-7/D-8/D-15/D-21) — S-4a class, ratified in P-8
--     Writers: REVOKE PUBLIC + test_rls_role; GRANT service_role where the
--     app route (service client) or a frozen gate (postgres psql / service
--     key) still needs it. Retired writers: REVOKE everywhere except the
--     superuser postgres (forensics via psql).
-- ────────────────────────────────────────────────────────────────────────────
-- 16a/16b. Function EXECUTE: guarded (has_function_privilege) so the migration
-- is idempotent and never errors on absent explicit grants.
DO $$
DECLARE
  rt text;
  r  regprocedure;
BEGIN
  -- KEEP (service-role callable): revoke PUBLIC/anon/authenticated/test, grant service
  FOREACH rt IN ARRAY ARRAY[
    'public.close_cash_register_v2(uuid,numeric,text,uuid,uuid,text,text)',
    'public.close_cash_register_v2(uuid,numeric,text,uuid,uuid)',
    'public.open_cash_register(text,numeric,text)',
    'public.open_shift(text,numeric)',
    'public.close_shift(text,uuid,numeric,text)',
    'public.clock_in_token(text,uuid,text)',
    'public.clock_out_token(text,uuid,text)',
    'public.clock_in_atomic_token(text,uuid)',
    'public.clock_out_atomic_token(text,uuid,text)',
    'public.cash_in_atomic(uuid,numeric,text,uuid,text,text)',
    'public.cash_in_atomic(uuid,numeric,text,uuid)',
    'public.cash_out_atomic(uuid,numeric,text,uuid,text,text)',
    'public.cash_out_atomic(uuid,numeric,text,uuid)',
    'public.recalculate_cash_session(uuid)',
    'public.reopen_cash_register(uuid,uuid,text,text)',
    'public.reopen_cash_register(uuid,uuid,text)',
    'public.submit_shift_review(uuid,uuid,numeric,numeric,text)',
    'public.approve_shift_review(uuid,uuid,text)',
    'public.request_shift_swap(uuid,uuid,uuid,uuid,text)',
    'public.respond_shift_swap(uuid,boolean,uuid)',
    'public.force_clock_out(uuid,text,uuid)',
    'public.auto_clockout_staff()',
    'public.end_break_token(text,uuid)',
    'public.start_break_token(text,uuid,text)',
    'public.log_audit(text,text,text,uuid,text,jsonb,jsonb,jsonb,text)',
    'public.calculate_shift_overtime(uuid)',
    'public.find_open_cash_session(uuid,uuid)',
    'public.cash_session_expected(uuid)',
    'public.fn_record_cash_drawer()'
  ] LOOP
    r := rt::regprocedure;
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', r);
    IF has_function_privilege('anon', r, 'EXECUTE') THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', r);
    END IF;
    IF has_function_privilege('authenticated', r, 'EXECUTE') THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM authenticated', r);
    END IF;
    IF has_function_privilege('test_rls_role', r, 'EXECUTE') THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM test_rls_role', r);
    END IF;
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r);
  END LOOP;

  -- RETIRED (Q3/Q5/Q6): no client role, no service role — postgres (superuser)
  -- keeps forensic access via psql.
  FOREACH rt IN ARRAY ARRAY[
    'public.close_cash_register(uuid,numeric,text,uuid)',
    'public.close_shift_atomic(uuid,numeric,text,uuid)',
    'public.clock_in_atomic_fixed(uuid,text,uuid)',
    'public.create_reconciliation(uuid,uuid,jsonb)',
    'public.get_reconciliation_summary(uuid)',
    'public.approve_reconciliation(uuid,uuid)',
    'public.dispute_reconciliation(uuid,text)',
    'public.close_day_atomic(date,jsonb,jsonb,jsonb,jsonb,uuid)'
  ] LOOP
    r := rt::regprocedure;
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', r);
    IF has_function_privilege('anon', r, 'EXECUTE') THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', r);
    END IF;
    IF has_function_privilege('authenticated', r, 'EXECUTE') THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM authenticated', r);
    END IF;
    IF has_function_privilege('service_role', r, 'EXECUTE') THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM service_role', r);
    END IF;
    IF has_function_privilege('test_rls_role', r, 'EXECUTE') THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM test_rls_role', r);
    END IF;
  END LOOP;
END;
$$;

-- 16c. Reader hygiene (D-7 anon list): get_overtime_summary anon revoke only
--     (authenticated reader kept as documented residual).
REVOKE EXECUTE ON FUNCTION public.get_overtime_summary(uuid,date,date) FROM anon, PUBLIC;

-- 16d. Table grants (D-21 / S-4a class):
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.time_clock_entries FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.time_clock_audit FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.daily_reports FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.shifts FROM test_rls_role;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.cash_drawer_sessions FROM test_rls_role;

-- ────────────────────────────────────────────────────────────────────────────
-- 17. RLS (D-9) — S-4a class exposures, ratified in P-8
-- ────────────────────────────────────────────────────────────────────────────
-- 17a. shift_reviews (was: RLS OFF + authenticated full DML + anon SELECT)
ALTER TABLE public.shift_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY shift_reviews_service_full ON public.shift_reviews
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY shift_reviews_select_loc ON public.shift_reviews
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.shifts s
    WHERE s.id = shift_reviews.shift_id
      AND (is_superadmin() OR (has_org_access(s.organization_id) AND has_location_access(s.location_id)))
  ));

-- 17b. tip_shortfalls (was: RLS OFF + authenticated full DML + anon SELECT)
ALTER TABLE public.tip_shortfalls ENABLE ROW LEVEL SECURITY;
CREATE POLICY tip_shortfalls_service_full ON public.tip_shortfalls
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY tip_shortfalls_select_loc ON public.tip_shortfalls
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.shifts s
    WHERE s.staff_id = tip_shortfalls.staff_id
      AND (is_superadmin() OR (has_org_access(s.organization_id) AND has_location_access(s.location_id)))
  ));

-- 17c. time_clock_entries (was: {public} ALL — anon could tamper timeclock)
DROP POLICY IF EXISTS "Allow all for authenticated" ON public.time_clock_entries;
CREATE POLICY time_clock_entries_service_full ON public.time_clock_entries
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY time_clock_entries_select_loc ON public.time_clock_entries
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.staff_locations sl
    WHERE sl.staff_id = time_clock_entries.staff_id AND sl.active
      AND (is_superadmin() OR (has_org_access(sl.organization_id) AND has_location_access(sl.location_id)))
  ));

-- 17d. time_clock_audit (was: {public} ALL)
DROP POLICY IF EXISTS "Allow all for authenticated" ON public.time_clock_audit;
CREATE POLICY time_clock_audit_service_full ON public.time_clock_audit
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY time_clock_audit_select_loc ON public.time_clock_audit
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.staff_locations sl
    WHERE sl.staff_id = time_clock_audit.performed_by AND sl.active
      AND (is_superadmin() OR (has_org_access(sl.organization_id) AND has_location_access(sl.location_id)))
  ));
