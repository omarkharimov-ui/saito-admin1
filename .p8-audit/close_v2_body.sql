
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

