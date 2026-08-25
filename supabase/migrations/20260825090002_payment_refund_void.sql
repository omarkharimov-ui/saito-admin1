-- =====================================================================
-- SAITO — PAYMENT ENGINE: refund / partial-refund / void (Phase 3)
-- Builds on complete_payment_atomic + ledger (order_payments SSOT).
-- Refund creates an is_refund ledger row, recomputes order state, records
-- cash outflow on the register when cash, and writes canonical audit.
-- Void cancels a not-yet-finalized payment (status -> voided) and recomputes.
-- =====================================================================

-- Allow refund-driven order statuses
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'orders'::regclass AND conname = 'orders_status_check'
  ) THEN
    ALTER TABLE orders DROP CONSTRAINT orders_status_check;
  END IF;
  ALTER TABLE orders ADD CONSTRAINT orders_status_check CHECK (
    status = ANY (ARRAY[
      'draft','new','open','confirmed','in_kitchen','preparing','partially_ready',
      'ready','served','payment_pending','paid','closed','cancelled','refunded','partially_refunded'
    ]::text[])
  );
END $$;

-- Enhanced ledger -> order state (adds refund/void driven status)
CREATE OR REPLACE FUNCTION public.recalculate_order_payment_state(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $f$
DECLARE
  v_paid     NUMERIC := 0;
  v_cash     NUMERIC := 0;
  v_refund   NUMERIC := 0;
  v_order    RECORD;
  v_payable  NUMERIC;
  v_method   TEXT;
  v_status   TEXT;
BEGIN
  SELECT COALESCE(SUM(amount), 0)
    INTO v_paid
    FROM order_payments
   WHERE order_id = p_order_id
     AND COALESCE(status, 'success') IN ('success', 'paid', 'authorized')
     AND COALESCE(is_refund, false) = false;

  SELECT COALESCE(SUM(amount), 0)
    INTO v_cash
    FROM order_payments
   WHERE order_id = p_order_id
     AND COALESCE(status, 'success') IN ('success', 'paid', 'authorized')
     AND COALESCE(is_refund, false) = false
     AND payment_method IN ('cash', 'nağd');

  SELECT COALESCE(SUM(amount), 0)
    INTO v_refund
    FROM order_payments
   WHERE order_id = p_order_id
     AND COALESCE(is_refund, false) = true;

  SELECT * INTO v_order FROM orders WHERE id = p_order_id;
  IF NOT FOUND THEN RETURN; END IF;

  v_payable := COALESCE(v_order.total_amount, 0) - COALESCE(v_order.discount_amount, 0);

  v_method := v_order.payment_method;
  IF v_paid > 0 THEN
    IF v_cash > 0 AND (v_paid - v_cash) > 0 THEN v_method := 'split';
    ELSIF (v_paid - v_cash) > 0 THEN v_method := 'card';
    ELSE v_method := 'cash';
    END IF;
  END IF;

  IF v_paid > 0 AND v_refund >= v_paid THEN
    v_status := 'refunded';
  ELSIF v_refund > 0 THEN
    v_status := 'partially_refunded';
  ELSIF v_payable > 0 AND v_paid >= v_payable THEN
    v_status := 'paid';
  ELSE
    v_status := v_order.status;
  END IF;

  UPDATE orders SET
    paid_amount   = v_paid,
    cash_amount   = v_cash,
    card_amount   = (v_paid - v_cash),
    refund_amount = v_refund,
    payment_method = CASE WHEN v_paid > 0 THEN v_method ELSE v_order.payment_method END,
    status = v_status,
    paid_at = CASE
                WHEN v_payable > 0 AND v_paid >= v_payable AND v_order.paid_at IS NULL THEN NOW()
                ELSE v_order.paid_at
              END,
    version   = COALESCE(v_order.version, 0) + 1,
    updated_at = NOW()
  WHERE id = p_order_id;
END;
$f$;

-- Refund (full or partial). Idempotent via derived key. Cash refund moves the register.
CREATE OR REPLACE FUNCTION public.refund_payment_atomic(
  p_order_id uuid,
  p_amount numeric,
  p_method text DEFAULT 'cash',
  p_reason text DEFAULT NULL,
  p_performed_by uuid DEFAULT NULL,
  p_cash_drawer_session_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_order orders%ROWTYPE;
  v_paid NUMERIC; v_refund NUMERIC; v_remaining NUMERIC;
  v_idemp_key TEXT; v_existing JSONB;
  v_session_id uuid := p_cash_drawer_session_id;
BEGIN
  v_idemp_key := md5('refund:' || p_order_id::text || ':' || p_amount::text || ':' || COALESCE(p_method, '') || ':' || COALESCE(p_reason, ''));
  SELECT result INTO v_existing FROM payment_idempotency_keys WHERE key = v_idemp_key AND status = 'completed';
  IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;
  INSERT INTO payment_idempotency_keys (key, order_id, amount, status, result)
  VALUES (v_idemp_key, p_order_id, p_amount, 'processing', NULL) ON CONFLICT (key) DO NOTHING;

  SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'ORDER_NOT_FOUND'); END IF;
  IF v_order.status NOT IN ('paid', 'refunded', 'partially_refunded') THEN
    RETURN jsonb_build_object('success', false, 'error', 'ORDER_NOT_REFUNDABLE');
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_paid
    FROM order_payments WHERE order_id = p_order_id AND COALESCE(is_refund, false) = false AND COALESCE(status, 'success') IN ('success', 'paid', 'authorized');
  SELECT COALESCE(SUM(amount), 0) INTO v_refund
    FROM order_payments WHERE order_id = p_order_id AND COALESCE(is_refund, false) = true;
  v_remaining := v_paid - v_refund;

  IF p_amount > v_remaining THEN
    RETURN jsonb_build_object('success', false, 'error', 'REFUND_EXCEEDS_PAID', 'remaining', v_remaining);
  END IF;

  INSERT INTO order_payments (order_id, payment_method, method, amount, currency, status, is_refund, reference, created_by)
  VALUES (p_order_id, p_method, p_method, p_amount, 'AZN', 'refunded', true, p_reason, p_performed_by);

  IF p_method IN ('cash', 'nağd') AND v_session_id IS NOT NULL THEN
    INSERT INTO cash_drawer_log (session_id, type, amount, description, created_by, order_id)
    VALUES (v_session_id, 'cash_out', p_amount, 'Refund: ' || COALESCE(p_reason, ''), p_performed_by, p_order_id);
  END IF;

  PERFORM recalculate_order_payment_state(p_order_id);
  SELECT * INTO v_order FROM orders WHERE id = p_order_id;

  PERFORM log_audit('refund', 'order', p_order_id::text, p_performed_by,
    jsonb_build_object('paid', v_paid, 'refunded_before', v_refund),
    jsonb_build_object('refund_amount', p_amount, 'refunded_total', v_refund + p_amount, 'reason', p_reason),
    jsonb_build_object('method', p_method), NULL, NULL);

  INSERT INTO operation_logs (order_id, action, old_values, new_values, performed_by)
  VALUES (p_order_id, 'refund_payment',
    jsonb_build_object('refund_before', v_refund),
    jsonb_build_object('refund', p_amount, 'method', p_method),
    p_performed_by);

  RETURN jsonb_build_object('success', true, 'order_id', p_order_id, 'refund_amount', p_amount,
    'refunded_total', v_refund + p_amount, 'order_status', v_order.status);
END;
$$;

-- Cashiers may also reverse a mistaken (pre-completion) payment
INSERT INTO public.role_permissions (role_id, permission_key)
SELECT r.id, 'payments.void'
  FROM public.roles r
 WHERE r.name = 'cashier'
ON CONFLICT (role_id, permission_key) DO NOTHING;

-- Void a not-yet-finalized payment (reversal before completion)
CREATE OR REPLACE FUNCTION public.void_payment_atomic(
  p_payment_id uuid,
  p_reason text DEFAULT NULL,
  p_performed_by uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_p order_payments%ROWTYPE; v_order orders%ROWTYPE;
BEGIN
  SELECT * INTO v_p FROM order_payments WHERE id = p_payment_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'PAYMENT_NOT_FOUND'); END IF;
  IF v_p.status = 'voided' THEN RETURN jsonb_build_object('success', true, 'message', 'ALREADY_VOIDED'); END IF;
  IF v_p.is_refund THEN RETURN jsonb_build_object('success', false, 'error', 'CANNOT_VOID_REFUND'); END IF;

  UPDATE order_payments SET status = 'voided', reference = COALESCE(reference, p_reason) WHERE id = p_payment_id;
  PERFORM recalculate_order_payment_state(v_p.order_id);
  SELECT * INTO v_order FROM orders WHERE id = v_p.order_id;

  PERFORM log_audit('void', 'payment', p_payment_id::text, p_performed_by,
    jsonb_build_object('status', v_p.status, 'amount', v_p.amount),
    jsonb_build_object('status', 'voided', 'reason', p_reason), NULL, NULL);

  INSERT INTO operation_logs (order_id, action, old_values, new_values, performed_by)
  VALUES (v_p.order_id, 'void_payment',
    jsonb_build_object('payment_id', p_payment_id, 'amount', v_p.amount),
    jsonb_build_object('reason', p_reason), p_performed_by);

  RETURN jsonb_build_object('success', true, 'payment_id', p_payment_id, 'order_status', v_order.status);
END;
$$;
