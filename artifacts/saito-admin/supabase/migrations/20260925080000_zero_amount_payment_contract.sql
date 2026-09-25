-- ══════════════════════════════════════════════════════════════════════════
-- 2026-09-25 (owner, Task 47): PAID_WITHOUT_RECORD on ₼0 orders — CONTRACT FIX
--
-- Live bug: waitlist "Oturdur" (full seat) opens a ₼0 order. Staff paying that
-- empty table hit PAID_WITHOUT_RECORD — /api/orders/pay sends an EMPTY
-- payments array for ₼0 (filter p.amount > 0) and complete_payment_atomic_v2
-- flipped the order to 'paid' with zero order_payments rows → P-5 RAISE.
--
-- Fix (DB-side, single point of truth):
--   1) order_payments.amount CHECK relaxed from > 0 to >= 0. The ONLY legal
--      zero row is the "zero-capture marker" created by 7b2 below (₼0 order,
--      captured, not refund). SUM(amount) bookkeeping is unaffected; RLS +
--      RPC-only insert surface unchanged.
--   2) complete_payment_atomic_v2 gains a 7b2 block: if the status flips to
--      'paid' but no ledger row was inserted at all, write one ₼0 captured
--      marker row so P-5 passes and the ledger records the explicit ₼0 capture.
--      For total>0 orders the block is unreachable (see comment in function).
--
-- No data repair needed for the reported order (f83951a3/ORD-2811): it was
-- already cancelled by dismiss_table_atomic (contract-clean path).
-- ══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.order_payments
  DROP CONSTRAINT IF EXISTS order_payments_amount_positive;

ALTER TABLE public.order_payments
  ADD CONSTRAINT order_payments_amount_nonnegative
  CHECK (amount >= 0);

CREATE OR REPLACE FUNCTION public.complete_payment_atomic_v2(p_order_id uuid, p_payments jsonb DEFAULT '[]'::jsonb, p_payment_method text DEFAULT 'cash'::text, p_cash_amount numeric DEFAULT 0, p_card_amount numeric DEFAULT 0, p_tip_amount numeric DEFAULT 0, p_discount_amount numeric DEFAULT 0, p_discount_type text DEFAULT NULL::text, p_performed_by uuid DEFAULT NULL::uuid, p_performed_by_terminal_id text DEFAULT NULL::text, p_cash_drawer_session_id uuid DEFAULT NULL::uuid, p_cash_received numeric DEFAULT NULL::numeric, p_idempotency_key text DEFAULT NULL::text, p_location_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_order RECORD;
  v_payment JSONB;
  v_amount NUMERIC;
  v_is_refund BOOLEAN;
  v_method TEXT;
  v_non_refund_total NUMERIC := 0;
  v_refund_total NUMERIC := 0;
  v_cash_total NUMERIC := 0;
  v_card_total NUMERIC := 0;
  v_now TIMESTAMPTZ := NOW();
  v_payment_ids UUID[] := '{}';
  v_new_paid NUMERIC;
  v_new_refund NUMERIC;
  v_new_status TEXT;
  v_remaining NUMERIC;
  v_change NUMERIC := 0;
  v_performer_name TEXT;
  v_idem_result JSONB;
  v_idem_namespace TEXT;
  v_idem_effect NUMERIC;
  v_idem_order UUID;
  v_idem_amount NUMERIC;
  v_result JSONB;
  v_ledger_id UUID;
  v_order_loc uuid;
BEGIN
  PERFORM public.validate_actor(p_performed_by);
  -- ═══ P-1 M2: LOCATION ASSERTION (fail-closed, D-5; ratified 2026-09-12) ═══
  -- p_location_id = the operator's SESSION-RESOLVED location (server-derived in the
  -- route via resolveWriteLocationContext — never client-supplied). The order must
  -- sit at exactly that location, and the actor must be allowed there
  -- (active staff_locations binding ∪ superadmin/owner ∪ documented
  -- single-location-with-data fallback). No location context => fail closed.
  IF p_location_id IS NULL THEN
    RAISE EXCEPTION 'LOCATION_CONTEXT_MISSING' USING ERRCODE = 'P0001';
  END IF;
  SELECT location_id INTO v_order_loc FROM orders WHERE id = p_order_id;
  IF v_order_loc IS NULL THEN
    RAISE EXCEPTION 'ORDER_LOCATION_NULL' USING ERRCODE = 'P0001';
  END IF;
  IF v_order_loc IS DISTINCT FROM p_location_id THEN
    RAISE EXCEPTION 'LOCATION_MISMATCH: order location % != operator session location %',
      v_order_loc, p_location_id USING ERRCODE = '42501';
  END IF;
  IF p_performed_by IS NOT NULL
     AND NOT public.p1_actor_allowed_at_location(p_performed_by, p_location_id) THEN
    RAISE EXCEPTION 'LOCATION_ACCESS_DENIED: actor not allowed at location %',
      p_location_id USING ERRCODE = '42501';
  END IF;
  SELECT name INTO v_performer_name FROM staff WHERE id = p_performed_by;

  -- ═══ 1. LOCK ORDER (serialization point for concurrency) ═══
  SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'ORDER_NOT_FOUND');
  END IF;

  -- ═══ 2. (P-4) idempotency dedupe lives at 3b — after the payments parse — so
  -- the replay binding check (order_id + signed amount, ratified D-3) can use
  -- the parsed financial effect. It still runs BEFORE all domain guards, so a
  -- retry replays instead of tripping ORDER_ALREADY_PAID / overpay / refund-cap.
  -- Concurrency: the order FOR UPDATE lock in section 1 serializes same-key pairs. ═══

  -- ═══ 3. PARSE PAYMENTS (split non-refund vs refund) ═══
  FOR v_payment IN SELECT * FROM jsonb_array_elements(p_payments) LOOP
    v_amount := COALESCE((v_payment->>'amount')::NUMERIC, 0);
    v_is_refund := COALESCE((v_payment->>'is_refund')::BOOLEAN, false);
    v_method := COALESCE((v_payment->>'method')::TEXT, 'cash');

    IF v_is_refund THEN
      v_refund_total := v_refund_total + v_amount;
    ELSE
      v_non_refund_total := v_non_refund_total + v_amount;
      IF v_method = 'cash' THEN
        v_cash_total := v_cash_total + v_amount;
      ELSE
        v_card_total := v_card_total + v_amount;
      END IF;
    END IF;
  END LOOP;

  -- ═══ 3b. P-4 C-1/C-2/C-3: IDENTITY BOUNDARY (ratified D-1/D-2/D-3/D-5) ═══
  -- namespace is derived from the OPERATION, never from the key text: refunds
  -- live in 'refund', everything else in 'payment'. Binding = (namespace,key)
  -- unique + row bound to (order_id, signed amount). Reuse with a different
  -- order OR amount = IDEMPOTENCY_CONFLICT (409), full rollback, zero mutation.
  v_idem_namespace := CASE WHEN v_refund_total > 0 THEN 'refund' ELSE 'payment' END;
  v_idem_effect := v_non_refund_total - v_refund_total;
  IF p_idempotency_key IS NOT NULL THEN
    SELECT order_id, amount, result INTO v_idem_order, v_idem_amount, v_idem_result
    FROM payment_idempotency_keys
    WHERE namespace = v_idem_namespace AND key = p_idempotency_key;
    IF FOUND THEN
      IF v_idem_order IS DISTINCT FROM p_order_id
         OR v_idem_amount IS DISTINCT FROM v_idem_effect THEN
        RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT: key % is bound to a different operation (order %, amount %); request was (order %, amount %)',
          p_idempotency_key, v_idem_order, v_idem_amount, p_order_id, v_idem_effect ;
      END IF;
      RETURN (COALESCE(v_idem_result, jsonb_build_object('success', false, 'error', 'IDEMPOTENCY_DATA_MISSING')))
        || jsonb_build_object('idempotent', true, 'duplicate', true,
             'original', COALESCE(v_idem_result, '{}'::jsonb),
             'current', jsonb_build_object(
               'status', v_order.status,
               'paid_amount', v_order.paid_amount,
               'refund_amount', COALESCE(v_order.refund_amount, 0),
               'remaining', GREATEST(0, COALESCE(v_order.total_amount, 0) - COALESCE(v_order.paid_amount, 0)),
               'replayed_at', v_now));
    END IF;
  END IF;

  -- ═══ 4. REFUND GUARD (refund ≤ net paid) ═══
  IF v_refund_total > 0 THEN
    IF v_refund_total > COALESCE(v_order.paid_amount, 0) - COALESCE(v_order.refund_amount, 0) + 0.01 THEN
      RAISE EXCEPTION 'REFUND_EXCEEDS_PAID: refund % > net_paid % (paid % - refunded %)',
        v_refund_total,
        COALESCE(v_order.paid_amount, 0) - COALESCE(v_order.refund_amount, 0),
        v_order.paid_amount, COALESCE(v_order.refund_amount, 0);
    END IF;
  END IF;

  -- ═══ 5. ALREADY-PAID GUARD (non-refund on a fully-paid order → reject) ═══
  -- Placed BEFORE the overpay guard so a full re-pay of a paid order surfaces
  -- ORDER_ALREADY_PAID (route maps it to HTTP 409) rather than a generic
  -- overpay error. Refunds are exempt (v_non_refund_total = 0) and still flow
  -- into the already-paid order below.
  IF v_non_refund_total > 0
     AND v_order.status = 'paid'
     AND COALESCE(v_order.paid_amount, 0) >= COALESCE(v_order.total_amount, 0) - 0.01 THEN
    RAISE EXCEPTION 'ORDER_ALREADY_PAID';
  END IF;

  -- ═══ 6. OVERPAY GUARD (DB-enforced; holds under race via FOR UPDATE) ═══
  -- Catches partial overpay (paid < total but payment > remaining).
  v_remaining := COALESCE(v_order.total_amount, 0) - COALESCE(v_order.paid_amount, 0);
  IF v_non_refund_total > v_remaining + 0.01 THEN
    RAISE EXCEPTION 'PAYMENT_EXCEEDS_REMAINING: payment % > remaining % (total %)',
      v_non_refund_total, v_remaining, v_order.total_amount;
  END IF;

  -- ═══ 7a. COMPUTE NEW VALUES ═══
  v_new_paid := COALESCE(v_order.paid_amount, 0) + v_non_refund_total - v_refund_total;
  v_new_refund := COALESCE(v_order.refund_amount, 0) + v_refund_total;

  IF v_refund_total > 0 THEN
    v_new_status := CASE
      WHEN v_new_paid <= 0.01 THEN 'refunded'
      ELSE 'partially_refunded'
    END;
  ELSE
    v_new_status := CASE
      WHEN v_new_paid >= COALESCE(v_order.total_amount, 0) - 0.01 THEN 'paid'
      ELSE v_order.status
    END;
  END IF;

  -- ═══ 7b. D-7: WRITE ORDER_PAYMENTS LEDGER ROWS (atomic, same txn) ═══
  -- validate_payment_order_balance trigger adds a second overpay layer.
  FOR v_payment IN SELECT * FROM jsonb_array_elements(p_payments) LOOP
    v_amount := COALESCE((v_payment->>'amount')::NUMERIC, 0);
    IF v_amount <= 0 THEN CONTINUE; END IF;
    v_is_refund := COALESCE((v_payment->>'is_refund')::BOOLEAN, false);
    v_method := COALESCE((v_payment->>'method')::TEXT, 'cash');

    INSERT INTO order_payments (
      order_id, payment_method, method, amount, status,
      is_refund, is_partial, created_by, reference, split_group_id, currency
    ) VALUES (
      p_order_id, v_method, v_method, v_amount, 'captured',
      v_is_refund,
      COALESCE((v_payment->>'is_partial')::BOOLEAN, false),
      p_performed_by, p_idempotency_key,
      (v_payment->>'split_group_id')::UUID,
      COALESCE((v_payment->>'currency')::TEXT, 'AZN')
    ) RETURNING id INTO v_ledger_id;

    v_payment_ids := array_append(v_payment_ids, v_ledger_id);
  END LOOP;

  -- ═══ 7b2. ₼0-ORDER CONTRACT GAP (2026-09-25, live bug: PAID_WITHOUT_RECORD) ═══
  -- Full-seat flow opens a ₼0 order; paying it with ₼0 (route sends an empty
  -- payments array) made v_new_status flip to 'paid' with NO ledger row, and
  -- the P-5 trigger (enforce_payment_record_on_paid) RAISEd. For total>0
  -- orders this can never fire ('paid' requires v_new_paid>0 ⇒ ≥1 positive row
  -- already inserted), so the marker row is exclusively a ₼0 capture record.
  IF v_new_status = 'paid' AND cardinality(v_payment_ids) = 0 THEN
    INSERT INTO order_payments (
      order_id, payment_method, method, amount, status,
      is_refund, is_partial, created_by, reference, split_group_id, currency
    ) VALUES (
      p_order_id, COALESCE(p_payment_method, 'cash'), COALESCE(p_payment_method, 'cash'), 0, 'captured',
      false, false, p_performed_by, p_idempotency_key, NULL, 'AZN'
    ) RETURNING id INTO v_ledger_id;
    v_payment_ids := array_append(v_payment_ids, v_ledger_id);
  END IF;

  -- ═══ 7c. UPDATE ORDER ═══
  UPDATE orders SET
    paid_amount = v_new_paid,
    refund_amount = v_new_refund,
    cash_amount = COALESCE(cash_amount, 0) + v_cash_total,
    card_amount = COALESCE(card_amount, 0) + v_card_total,
    tip_amount = COALESCE(tip_amount, 0) + p_tip_amount,
    discount_amount = p_discount_amount,
    discount_type = p_discount_type,
    payment_method = p_payment_method,
    status = v_new_status,
    cash_received = COALESCE(cash_received, 0) + COALESCE(p_cash_received, v_cash_total),
    change_amount = COALESCE(change_amount, 0) + v_change,
    paid_at = CASE WHEN v_new_status = 'paid' AND v_order.status != 'paid' THEN v_now ELSE paid_at END,
    updated_at = v_now,
    version = COALESCE(version, 0) + 1
  WHERE id = p_order_id;

  -- ═══ 7d. BUILD RESULT ═══
  v_result := jsonb_build_object(
    'success', true,
    'action', CASE WHEN v_refund_total > 0 THEN 'refund' ELSE 'payment' END,
    'paid_amount', v_new_paid,
    'refund_amount', v_new_refund,
    'total_amount', v_order.total_amount,
    'remaining', GREATEST(0, COALESCE(v_order.total_amount, 0) - v_new_paid),
    'is_fully_paid', v_new_paid >= COALESCE(v_order.total_amount, 0) - 0.01,
    'status', v_new_status,
    'cash_received', p_cash_received,
    'change', v_change,
    'tip_amount', p_tip_amount,
    'payment_ids', to_jsonb(v_payment_ids),
    'idempotent', false,
    'table_number', v_order.table_number,
    'timestamp', v_now
  );

  -- ═══ 7e. P-4 C-2/C-6: STORE IDEMPOTENCY KEY + RESULT (atomic, scoped, TTL'd) ═══
  -- The row commits only with the successful financial write (ratified D-7:
  -- no financial mutation = no successful idempotency claim). Retention:
  -- P4_KEY_RETENTION_DAYS = 30 (key metadata only; the ledger is permanent).
  IF p_idempotency_key IS NOT NULL THEN
    INSERT INTO payment_idempotency_keys (namespace, key, order_id, amount, status, result, expires_at)
    VALUES (v_idem_namespace, p_idempotency_key, p_order_id, v_idem_effect, 'completed', v_result,
            now() + interval '30 days');
  END IF;

  -- ═══ 7f. AUDIT ═══
  PERFORM public.log_audit(
    CASE WHEN v_refund_total > 0 THEN 'refund' ELSE 'payment' END,
    'order', p_order_id::text,
    p_performed_by, v_performer_name,
    jsonb_build_object(
      'status', v_order.status,
      'paid_amount', v_order.paid_amount,
      'refund_amount', COALESCE(v_order.refund_amount, 0)
    ),
    jsonb_build_object(
      'status', v_new_status,
      'paid_amount', v_new_paid,
      'refund_amount', v_new_refund,
      'payment_method', p_payment_method,
      'amount', v_non_refund_total - v_refund_total
    ),
    jsonb_build_object(
      'payments', p_payments,
      'cash_received', p_cash_received,
      'change', v_change,
      'idempotency_key', p_idempotency_key
    ),
    NULL
  );

  RETURN v_result;
END;
$function$


