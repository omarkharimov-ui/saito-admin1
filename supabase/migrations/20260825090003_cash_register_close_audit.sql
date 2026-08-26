-- =====================================================================
-- SAITO — PHASE 4/5: CASH REGISTER CLOSE + AUDIT CANONICALIZATION
-- =====================================================================

-- 1) Permissions for manager approval + reopen (correction)
INSERT INTO public.permissions (key, description) VALUES
  ('cash.close.approve', 'Approve a cash register close that has variance'),
  ('cash.reopen', 'Reopen a closed cash register for correction')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_key)
SELECT r.id, 'cash.close.approve' FROM public.roles r WHERE r.name IN ('manager','admin','owner')
ON CONFLICT (role_id, permission_key) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_key)
SELECT r.id, 'cash.reopen' FROM public.roles r WHERE r.name IN ('manager','admin','owner')
ON CONFLICT (role_id, permission_key) DO NOTHING;

-- 2) Cash register close approval metadata (additive)
ALTER TABLE public.cash_drawer_sessions ADD COLUMN IF NOT EXISTS approved_by uuid;
ALTER TABLE public.cash_drawer_sessions ADD COLUMN IF NOT EXISTS approval_note text;

-- 3) open_cash_register — adds canonical audit
CREATE OR REPLACE FUNCTION public.open_cash_register(
  p_register_id uuid DEFAULT NULL,
  p_opening_balance numeric DEFAULT 0,
  p_opened_by uuid DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO cash_drawer_sessions (register_id, opening_balance, status, opened_by, notes)
  VALUES (p_register_id, COALESCE(p_opening_balance, 0), 'open', p_opened_by, p_notes)
  RETURNING id INTO v_id;

  INSERT INTO cash_drawer_log (session_id, type, amount, description, created_by)
  VALUES (v_id, 'open', COALESCE(p_opening_balance, 0), COALESCE(p_notes, 'Kassa açıldı'), p_opened_by);

  PERFORM log_audit('cash_register_open', 'cash_register', v_id::text, p_opened_by,
    NULL, jsonb_build_object('opening_balance', p_opening_balance, 'register_id', p_register_id),
    NULL, NULL, NULL);

  RETURN v_id;
END;
$$;

-- 4) close_cash_register_v2 — variance server-side, idempotent, manager approval on variance
CREATE OR REPLACE FUNCTION public.close_cash_register_v2(
  p_session_id uuid,
  p_actual_cash numeric,
  p_closed_by uuid DEFAULT NULL,
  p_approved_by uuid DEFAULT NULL,
  p_approval_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_expected NUMERIC; v_diff NUMERIC;
  v_session cash_drawer_sessions%ROWTYPE;
  v_key TEXT; v_existing JSONB;
BEGIN
  -- Idempotency: same close request collapses to one result
  v_key := md5('close:' || p_session_id::text || ':' || COALESCE(p_actual_cash, 0)::text);
  SELECT result INTO v_existing FROM payment_idempotency_keys WHERE key = v_key AND status = 'completed';

  SELECT * INTO v_session FROM cash_drawer_sessions WHERE id = p_session_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'SESSION_NOT_FOUND'); END IF;

  -- Already closed -> return canonical state, never re-close
  IF v_session.status = 'closed' THEN
    RETURN jsonb_build_object(
      'session_id', p_session_id, 'status', 'closed',
      'expected_balance', v_session.expected_balance, 'actual_cash', v_session.closing_balance,
      'difference', v_session.difference, 'approved_by', v_session.approved_by, 'already_closed', true
    );
  END IF;

  v_expected := recalculate_cash_session(p_session_id);
  v_diff := COALESCE(p_actual_cash, 0) - COALESCE(v_expected, 0);

  -- Variance requires manager approval (permission-based, never client-authoritative)
  IF abs(v_diff) > 0.01 THEN
    IF p_approved_by IS NULL OR NOT has_permission(p_approved_by, 'cash.close.approve') THEN
      RETURN jsonb_build_object(
        'success', false, 'error', 'MANAGER_APPROVAL_REQUIRED',
        'expected', v_expected, 'actual', p_actual_cash, 'difference', v_diff
      );
    END IF;
  END IF;

  UPDATE cash_drawer_sessions SET
    status = 'closed',
    closed_at = now(),
    closing_balance = COALESCE(p_actual_cash, 0),
    expected_balance = v_expected,
    difference = v_diff,
    closed_by = p_closed_by,
    approved_by = CASE WHEN abs(v_diff) > 0.01 THEN p_approved_by ELSE NULL END,
    approval_note = CASE WHEN abs(v_diff) > 0.01 THEN p_approval_note ELSE NULL END,
    notes = CASE WHEN abs(v_diff) > 0.01 THEN COALESCE(notes, '') || ' | approved by ' || p_approved_by::text ELSE notes END
  WHERE id = p_session_id;

  INSERT INTO cash_drawer_log (session_id, type, amount, description, created_by, order_id)
  VALUES (p_session_id, 'close', COALESCE(p_actual_cash, 0), 'Kassa bağlandı. Fərq: ' || v_diff, p_closed_by, NULL);

  PERFORM log_audit('cash_register_close', 'cash_register', p_session_id::text, p_closed_by,
    jsonb_build_object('expected', v_expected, 'opened_by', v_session.opened_by),
    jsonb_build_object('actual', p_actual_cash, 'difference', v_diff, 'approved_by', p_approved_by),
    jsonb_build_object('approval_note', p_approval_note), NULL, NULL);

  IF abs(v_diff) > 0.01 THEN
    PERFORM log_audit('manager_approval', 'cash_register', p_session_id::text, p_approved_by,
      jsonb_build_object('difference', v_diff),
      jsonb_build_object('approved', true, 'note', p_approval_note), NULL, NULL);
  END IF;

  IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;
  RETURN jsonb_build_object(
    'session_id', p_session_id, 'expected_balance', v_expected, 'actual_cash', p_actual_cash,
    'difference', v_diff, 'approved_by', p_approved_by, 'status', 'closed'
  );
END;
$$;

-- 5) reopen_cash_register — safe, permission-controlled correction
CREATE OR REPLACE FUNCTION public.reopen_cash_register(
  p_session_id uuid,
  p_performed_by uuid DEFAULT NULL,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_session cash_drawer_sessions%ROWTYPE;
BEGIN
  IF NOT has_permission(p_performed_by, 'cash.reopen') THEN
    RETURN jsonb_build_object('success', false, 'error', 'FORBIDDEN');
  END IF;
  SELECT * INTO v_session FROM cash_drawer_sessions WHERE id = p_session_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'NOT_FOUND'); END IF;
  IF v_session.status <> 'closed' THEN RETURN jsonb_build_object('success', false, 'error', 'NOT_CLOSED'); END IF;

  UPDATE cash_drawer_sessions SET
    status = 'open', closed_at = NULL, closed_by = NULL, approved_by = NULL, approval_note = NULL,
    notes = COALESCE(notes, '') || ' | reopened: ' || COALESCE(p_reason, '')
  WHERE id = p_session_id;

  INSERT INTO cash_drawer_log (session_id, type, amount, description, created_by)
  VALUES (p_session_id, 'open', COALESCE(v_session.opening_balance, 0), 'Reopened: ' || COALESCE(p_reason, ''), p_performed_by);

  PERFORM log_audit('cash_register_reopen', 'cash_register', p_session_id::text, p_performed_by,
    jsonb_build_object('previous_close', v_session.closed_at),
    jsonb_build_object('reason', p_reason), NULL, NULL, NULL);

  RETURN jsonb_build_object('success', true, 'session_id', p_session_id, 'status', 'open');
END;
$$;

-- 6) complete_payment_atomic — add canonical payment audit (SSOT = audit_logs)
CREATE OR REPLACE FUNCTION public.complete_payment_atomic(
  p_order_id uuid,
  p_payments jsonb,
  p_payment_method text,
  p_cash_amount numeric,
  p_card_amount numeric,
  p_tip_amount numeric,
  p_discount_amount numeric,
  p_discount_type text,
  p_performed_by uuid,
  p_performed_by_terminal_id text,
  p_cash_drawer_session_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_order RECORD;
  v_payment JSONB;
  v_table RECORD;
  v_other_active_count INT;
  v_key TEXT;
  v_existing JSONB;
  v_payable NUMERIC;
  v_result JSONB;
BEGIN
  v_key := md5(
    p_order_id::text || COALESCE(p_payments::text, '') ||
    COALESCE(p_discount_amount, 0)::text || COALESCE(p_cash_amount, 0)::text ||
    COALESCE(p_card_amount, 0)::text || COALESCE(p_tip_amount, 0)::text
  );

  SELECT result INTO v_existing
    FROM payment_idempotency_keys
   WHERE key = v_key AND status = 'completed';
  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  INSERT INTO payment_idempotency_keys (key, order_id, amount, status, result)
  VALUES (v_key, p_order_id, COALESCE(p_cash_amount, 0) + COALESCE(p_card_amount, 0), 'processing', NULL)
  ON CONFLICT (key) DO NOTHING;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'ORDER_NOT_FOUND');
  END IF;

  IF v_order.status = 'paid' THEN
    PERFORM recalculate_order_payment_state(p_order_id);
    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
    v_result := jsonb_build_object(
      'success', true, 'message', 'ALREADY_PAID', 'order_id', p_order_id,
      'paid_amount', v_order.paid_amount, 'table_number', v_order.table_number,
      'tip_amount', v_order.tip_amount, 'cogs', v_order.cogs, 'profit', v_order.profit
    );
    UPDATE payment_idempotency_keys SET status = 'completed', result = v_result WHERE key = v_key;
    RETURN v_result;
  END IF;

  IF v_order.status = 'cancelled' THEN
    RETURN jsonb_build_object('success', false, 'error', 'ORDER_ALREADY_CANCELLED');
  END IF;

  FOR v_payment IN SELECT * FROM jsonb_array_elements(p_payments) LOOP
    INSERT INTO public.order_payments (
      order_id, payment_method, method, amount, currency, status,
      split_group_id, is_partial, is_refund, created_by, reference
    ) VALUES (
      p_order_id,
      COALESCE(v_payment->>'method', 'cash'),
      COALESCE(v_payment->>'method', 'cash'),
      COALESCE((v_payment->>'amount')::NUMERIC, 0),
      COALESCE(v_payment->>'currency', 'AZN'),
      COALESCE(v_payment->>'status', 'success'),
      (v_payment->>'split_group_id')::UUID,
      COALESCE((v_payment->>'is_partial')::BOOLEAN, false),
      COALESCE((v_payment->>'is_refund')::BOOLEAN, false),
      p_performed_by,
      COALESCE(v_payment->>'transaction_id', NULL)
    );
  END LOOP;

  PERFORM recalculate_order_payment_state(p_order_id);
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;

  v_payable := v_order.total_amount - COALESCE(v_order.discount_amount, 0);

  IF v_payable > 0 AND v_order.paid_amount >= v_payable THEN
    PERFORM public.deduct_stock_for_order(p_order_id);

    IF v_order.table_number IS NOT NULL AND v_order.table_number > 0 THEN
      SELECT COUNT(*) INTO v_other_active_count
        FROM public.orders
       WHERE table_number = v_order.table_number
         AND id != p_order_id
         AND status NOT IN ('paid', 'cancelled', 'closed');
      IF v_other_active_count = 0 THEN
        SELECT * INTO v_table
          FROM public.table_floors
         WHERE table_number = v_order.table_number FOR UPDATE;
        IF FOUND THEN
          UPDATE public.table_floors SET
            status = 'cleaning', current_order_id = NULL, guest_count = NULL,
            total_amount = 0, order_count = 0, bill_requested = false,
            kitchen_status = NULL, updated_at = NOW()
          WHERE table_number = v_order.table_number;
        END IF;
      END IF;
    END IF;
  END IF;

  INSERT INTO public.operation_logs (
    table_number, order_id, action, old_values, new_values, performed_by
  ) VALUES (
    v_order.table_number, p_order_id, 'complete_payment',
    jsonb_build_object('status', v_order.status),
    jsonb_build_object('status', v_order.status, 'paid_amount', v_order.paid_amount),
    p_performed_by
  );

  -- Canonical audit trail (audit_logs SSOT)
  PERFORM log_audit('payment', 'order', p_order_id::text, p_performed_by,
    jsonb_build_object('status', v_order.status),
    jsonb_build_object('status', v_order.status, 'paid_amount', v_order.paid_amount, 'method', v_order.payment_method),
    jsonb_build_object('cash', v_order.cash_amount, 'card', v_order.card_amount, 'tip', v_order.tip_amount),
    NULL, NULL);

  v_result := jsonb_build_object(
    'success', true, 'order_id', p_order_id, 'paid_amount', v_order.paid_amount,
    'table_number', v_order.table_number, 'tip_amount', v_order.tip_amount,
    'cogs', v_order.cogs, 'profit', v_order.profit
  );

  UPDATE payment_idempotency_keys SET status = 'completed', result = v_result WHERE key = v_key;
  RETURN v_result;
END;
$function$;

-- 7) Audit canonicalization: mirror legacy audit_log (singular) -> audit_logs (SSOT)
CREATE OR REPLACE FUNCTION public.mirror_audit_log_to_audit_logs()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.audit_logs (
    action, table_name, record_id, old_data, new_data, performed_by, created_at,
    target_type, target_id, staff_id
  ) VALUES (
    NEW.action, NEW.table_name, NEW.record_id::text, NEW.old_data, NEW.new_data,
    NEW.performed_by, COALESCE(NEW.created_at, now()),
    NEW.table_name, NEW.record_id::text, NEW.performed_by
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_log_mirror ON public.audit_log;
CREATE TRIGGER trg_audit_log_mirror
  AFTER INSERT ON public.audit_log
  FOR EACH ROW EXECUTE FUNCTION public.mirror_audit_log_to_audit_logs();

COMMENT ON TABLE public.audit_log IS
  'DEPRECATED: canonical audit trail is audit_logs; this table is mirrored into audit_logs via trg_audit_log_mirror. Do not add new direct writes.';

-- 8) Grants
GRANT EXECUTE ON FUNCTION public.open_cash_register(uuid, numeric, uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.close_cash_register_v2(uuid, numeric, uuid, uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reopen_cash_register(uuid, uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.complete_payment_atomic(uuid, jsonb, text, numeric, numeric, numeric, numeric, text, uuid, text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mirror_audit_log_to_audit_logs() TO authenticated, service_role;
