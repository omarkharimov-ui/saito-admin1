-- ============================================================================
-- 20260913000001 — P-4: IDEMPOTENCY CONTRACT (ratified D-1..D-8, 2026-09-13)
--
-- P4_IDEMPOTENCY_CONTRACT_2026-09-13.md is the frozen contract. Acceptance:
--   "For every retried client payment/refund request, the database produces at
--   most one financial effect, and a reused idempotency key can never silently
--   represent a different operation."
--
-- Changes:
--   A. payment_idempotency_keys: +namespace ('payment'|'refund', NOT NULL,
--      legacy backfilled 'payment'), +expires_at (P4_KEY_RETENTION_DAYS=30),
--      PK (key) -> (namespace,key); redundant duplicate unique index dropped.
--      The financial ledger (order_payments/payments/inventory/audit) is
--      UNTOUCHED — TTL applies to key metadata only (ratified D-6).
--   B. complete_payment_atomic_v2: idempotency dedupe moved to 3b (after the
--      payments parse, before all domain guards); namespace derived from the
--      operation (refund_total>0 -> 'refund'); replay binding check
--      (order_id + signed amount) -> IDEMPOTENCY_CONFLICT (409, zero
--      mutation); replay response carries original+current layers (D-5);
--      stored row gains namespace + 30-day TTL.
--   C. refund_with_inventory: +p_idempotency_key (trailing, DEFAULT NULL;
--      named-arg and positional-10 callers unaffected); same dedupe/409/
--      replay pattern in namespace='refund'; store before final RETURN.
--   D. prune_expired_idempotency_keys(): advisory-locked, self-throttled,
--      service-role-only; deletes ONLY expired key metadata.
--
-- NOT changed: P-1 location assertions, P-2 state machine, P-3 immutability +
-- underpayment guards, all guard order/semantics, order_payments ledger
-- writes, audit shape. Rollback: supabase/migrations/_p4_rollback_20260913/.
-- ============================================================================
BEGIN;

-- ----------------------------------------------------------------------------
-- A. SCHEMA: scoped identity + retention
-- ----------------------------------------------------------------------------
ALTER TABLE public.payment_idempotency_keys
  ADD COLUMN IF NOT EXISTS namespace text NOT NULL DEFAULT 'payment';
ALTER TABLE public.payment_idempotency_keys
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;

UPDATE public.payment_idempotency_keys SET expires_at = created_at + interval '30 days'
WHERE expires_at IS NULL;
ALTER TABLE public.payment_idempotency_keys
  ALTER COLUMN expires_at SET DEFAULT (now() + interval '30 days');

-- drop legacy PK (key) + the redundant duplicate UNIQUE CONSTRAINT (it is a
-- constraint-backed index, not a bare index — DROP CONSTRAINT, not DROP INDEX);
-- then enforce the scoped PK (namespace,key).
ALTER TABLE public.payment_idempotency_keys DROP CONSTRAINT IF EXISTS payment_idempotency_keys_pkey;
ALTER TABLE public.payment_idempotency_keys DROP CONSTRAINT IF EXISTS payment_idempotency_keys_key_unique;
ALTER TABLE public.payment_idempotency_keys
  ADD CONSTRAINT payment_idempotency_keys_ns_key_pkey PRIMARY KEY (namespace, key);



-- ----------------------------------------------------------------------------
-- B. complete_payment_atomic_v2 — P-4 idempotency boundary (body = live
--    pg_get_functiondef with the 3b dedupe / scoped store / fresh replay)
-- ----------------------------------------------------------------------------
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
          p_idempotency_key, v_idem_order, v_idem_amount, p_order_id, v_idem_effect;
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
$function$;

-- ----------------------------------------------------------------------------
-- C. refund_with_inventory — +p_idempotency_key (namespace 'refund')
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.refund_with_inventory(p_order_id uuid, p_order_item_id uuid, p_quantity integer, p_amount numeric, p_method text DEFAULT 'cash'::text, p_item_fate text DEFAULT 'waste'::text, p_reason text DEFAULT NULL::text, p_reason_text text DEFAULT NULL::text, p_performed_by uuid DEFAULT NULL::uuid, p_location_id uuid DEFAULT NULL::uuid, p_idempotency_key text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_order RECORD;
  v_oi RECORD;
  v_performer_name TEXT;
  v_now TIMESTAMPTZ := NOW();
  v_refund_qty INT;
  v_refund_amount NUMERIC;
  v_new_refund NUMERIC;
  v_product RECORD;
  v_rec RECORD;
  v_stock_returned INT := 0;
  v_waste_recorded INT := 0;
  v_corr uuid := gen_random_uuid();
  v_key text;
  v_id uuid;
  v_paid_after NUMERIC;
  v_refund_after NUMERIC;
  v_status_after TEXT;
  v_prod_found boolean := false;
  v_idem_result JSONB;
  v_idem_order UUID;
  v_idem_amount NUMERIC;
  v_refund_effect NUMERIC;
  v_result JSONB;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;
  -- ═══ P-1 M2: LOCATION ASSERTION (fail-closed, D-5; ratified 2026-09-12) ═══
  IF p_location_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'LOCATION_CONTEXT_MISSING');
  END IF;
  IF v_order.location_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'ORDER_LOCATION_NULL');
  END IF;
  IF v_order.location_id IS DISTINCT FROM p_location_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'LOCATION_MISMATCH');
  END IF;
  IF p_performed_by IS NOT NULL
     AND NOT public.p1_actor_allowed_at_location(p_performed_by, p_location_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'LOCATION_ACCESS_DENIED');
  END IF;
  IF v_order.status NOT IN ('paid', 'partially_refunded') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Can only refund paid or partially_refunded orders. Current: ' || v_order.status);
  END IF;

  SELECT * INTO v_oi FROM public.order_items WHERE id = p_order_item_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order item not found');
  END IF;
  IF v_oi.order_id != p_order_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Item does not belong to this order');
  END IF;
  IF v_oi.kitchen_status NOT IN ('ready', 'completed', 'served') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot refund item in state: ' || COALESCE(v_oi.kitchen_status, 'pending'));
  END IF;

  v_refund_qty := COALESCE(p_quantity, 1);
  IF v_refund_qty <= 0 OR v_refund_qty > v_oi.quantity THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid refund quantity. Max: ' || v_oi.quantity);
  END IF;

  v_refund_amount := COALESCE(p_amount, v_oi.unit_price * v_refund_qty);
  IF v_refund_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid refund amount');
  END IF;

  -- ═══ P-4 C-3/C-5: IDEMPOTENCY DEDUPE (namespace='refund'; ratified D-4) ═══
  -- AFTER the order FOR UPDATE (section 1) + amount resolution, BEFORE the
  -- refund-cap / item-fate guards, so a retry replays the stored success
  -- instead of tripping "exceeds remaining refundable" / fate double-guard.
  v_refund_effect := v_refund_amount;
  IF p_idempotency_key IS NOT NULL THEN
    SELECT order_id, amount, result INTO v_idem_order, v_idem_amount, v_idem_result
    FROM payment_idempotency_keys
    WHERE namespace = 'refund' AND key = p_idempotency_key;
    IF FOUND THEN
      IF v_idem_order IS DISTINCT FROM p_order_id
         OR v_idem_amount IS DISTINCT FROM v_refund_effect THEN
        RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT: key % is bound to a different operation (order %, amount %); request was (order %, amount %)',
          p_idempotency_key, v_idem_order, v_idem_amount, p_order_id, v_refund_effect;
      END IF;
      RETURN (COALESCE(v_idem_result, jsonb_build_object('success', false, 'error', 'IDEMPOTENCY_DATA_MISSING')))
        || jsonb_build_object('idempotent', true, 'duplicate', true,
             'original', COALESCE(v_idem_result, '{}'::jsonb),
             'current', jsonb_build_object(
               'status', v_order.status,
               'paid_amount', v_order.paid_amount,
               'refund_amount', COALESCE(v_order.refund_amount, 0),
               'remaining', GREATEST(0, COALESCE(v_order.paid_amount, 0) - COALESCE(v_order.refund_amount, 0)),
               'replayed_at', v_now));
    END IF;
  END IF;

  -- H10.1: refundable = paid_amount - refund_amount. paid_amount is NEVER
  -- decremented; cumulative refunds are compared against the original paid.
  v_new_refund := COALESCE(v_order.refund_amount, 0) + v_refund_amount;
  IF v_new_refund > COALESCE(v_order.paid_amount, 0) THEN
    RETURN jsonb_build_object('success', false, 'error',
      'Refund (' || v_refund_amount || ') exceeds remaining refundable (' ||
      ROUND(COALESCE(v_order.paid_amount, 0) - COALESCE(v_order.refund_amount, 0), 2) || ')');
  END IF;

  IF p_item_fate NOT IN ('return_to_stock', 'waste') THEN
    RETURN jsonb_build_object('success', false, 'error', 'item_fate must be return_to_stock or waste');
  END IF;

  IF p_performed_by IS NOT NULL THEN
    SELECT name INTO v_performer_name FROM public.staff WHERE id = p_performed_by;
  END IF;

  SELECT * INTO v_product FROM public.products WHERE id = v_oi.product_id;
  IF FOUND THEN
    v_prod_found := true;
  END IF;

  -- H10.1: fate idempotency guards run BEFORE any money write so a duplicate
  -- refund can never record money and then fail.
  IF p_item_fate = 'return_to_stock' THEN
    IF EXISTS (
      SELECT 1 FROM public.inventory_logs
      WHERE order_item_id = p_order_item_id AND type IN ('reversal', 'stock_return')
    ) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Stock already returned for this item');
    END IF;
  ELSIF p_item_fate = 'waste' THEN
    IF EXISTS (
      SELECT 1 FROM public.cancelled_orders
      WHERE order_id = p_order_id
        AND reason IN ('waste', 'refund_waste')
        AND items @> jsonb_build_array(jsonb_build_object('order_item_id', p_order_item_id))
    ) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Waste already recorded for this item');
    END IF;
  END IF;

  -- ===== Financial record =====
  -- Legacy compatibility/reporting mirror (negative refund convention).
  INSERT INTO public.payments (
    order_id, payment_method, amount, status, is_refund,
    performed_by, performed_by_name, notes, metadata, idempotency_key
  ) VALUES (
    p_order_id, p_method, -ABS(v_refund_amount), 'refunded', true,
    p_performed_by, v_performer_name, p_reason_text,
    jsonb_build_object(
      'reason', p_reason,
      'reason_text', p_reason_text,
      'item_fate', p_item_fate,
      'order_item_id', p_order_item_id,
      'quantity', v_refund_qty
    ),
    'refund:' || p_order_item_id::text || ':' || v_corr::text
  );

  -- Canonical financial SSOT refund row (amount > 0, is_refund = true,
  -- status = 'captured').
  INSERT INTO public.order_payments (
    order_id, amount, payment_method, method, currency, status,
    is_refund, reference, performed_by, created_by,
    idempotency_key, correlation_id
  ) VALUES (
    p_order_id, v_refund_amount, p_method, p_method, 'AZN',
    'captured', true, p_reason_text,
    p_performed_by, p_performed_by,
    'refund:' || p_order_item_id::text || ':' || v_corr::text,
    v_corr
  );

  -- orders financial state derived through the canonical recalculator.
  UPDATE public.orders SET
    refund_reason = p_reason_text,
    refunded_at   = v_now
  WHERE id = p_order_id;

  PERFORM public.recalculate_order_payment_state(p_order_id);

  SELECT COALESCE(paid_amount, 0), COALESCE(refund_amount, 0), status
    INTO v_paid_after, v_refund_after, v_status_after
  FROM public.orders WHERE id = p_order_id;

  -- ===== Inventory fate =====
  IF p_item_fate = 'return_to_stock' THEN
    IF v_prod_found AND v_product.is_ready_product AND v_product.direct_ingredient_id IS NOT NULL THEN
      v_key := 'refund:' || p_order_item_id::text || ':' || v_product.direct_ingredient_id::text;
      INSERT INTO public.inventory_logs (
        ingredient_id, type, quantity, unit, order_id, order_item_id,
        item_quantity, reference_type, reference_id, correlation_id, idempotency_key,
        performed_by, reason, created_at, location_id, organization_id
      ) VALUES (
        v_product.direct_ingredient_id, 'reversal', v_refund_qty,
        (SELECT COALESCE(unit, 'gram') FROM public.ingredients WHERE id = v_product.direct_ingredient_id),
        p_order_id, p_order_item_id, v_refund_qty, 'order', p_order_id,
        v_corr, v_key, p_performed_by,
        'Refund — return to stock: ' || COALESCE(v_oi.product_name, 'Məhsul'),
        v_now, v_order.location_id, v_order.organization_id
      )
      ON CONFLICT DO NOTHING RETURNING id INTO v_id;
      IF v_id IS NOT NULL THEN
        v_stock_returned := 1;
        PERFORM public.emit_outbox_event('inventory', v_product.direct_ingredient_id, 'inventory.transaction.created',
          jsonb_build_object('order_item_id', p_order_item_id, 'ingredient_id', v_product.direct_ingredient_id, 'quantity', v_refund_qty, 'type', 'reversal'),
          jsonb_build_object('correlation_id', v_corr));
        PERFORM public.emit_outbox_event('inventory', v_product.direct_ingredient_id, 'inventory.stock_changed',
          jsonb_build_object('order_item_id', p_order_item_id, 'ingredient_id', v_product.direct_ingredient_id, 'quantity', v_refund_qty),
          jsonb_build_object('correlation_id', v_corr));
      END IF;

    ELSIF v_prod_found THEN
      FOR v_rec IN
        SELECT r.ingredient_id, r.quantity_required, r.quantity_brutto,
               COALESCE(i.unit, 'gram') AS unit
        FROM public.recipes r
        JOIN public.ingredients i ON i.id = r.ingredient_id
        WHERE r.menu_item_id = v_oi.product_id AND r.is_ai_suggested = false
      LOOP
        v_key := 'refund:' || p_order_item_id::text || ':' || v_rec.ingredient_id::text;
        INSERT INTO public.inventory_logs (
          ingredient_id, type, quantity, unit, order_id, order_item_id,
          item_quantity, reference_type, reference_id, correlation_id, idempotency_key,
          performed_by, reason, created_at, location_id, organization_id
        ) VALUES (
          v_rec.ingredient_id, 'reversal',
          COALESCE(v_rec.quantity_brutto, v_rec.quantity_required) * v_refund_qty,
          v_rec.unit, p_order_id, p_order_item_id, v_refund_qty, 'order', p_order_id,
          v_corr, v_key, p_performed_by,
          'Refund — return to stock: ' || COALESCE(v_oi.product_name, 'Məhsul'),
          v_now, v_order.location_id, v_order.organization_id
        )
        ON CONFLICT DO NOTHING RETURNING id INTO v_id;
        IF v_id IS NOT NULL THEN
          v_stock_returned := 1;
          PERFORM public.emit_outbox_event('inventory', v_rec.ingredient_id, 'inventory.transaction.created',
            jsonb_build_object('order_item_id', p_order_item_id, 'ingredient_id', v_rec.ingredient_id, 'quantity', COALESCE(v_rec.quantity_brutto, v_rec.quantity_required) * v_refund_qty, 'type', 'reversal'),
            jsonb_build_object('correlation_id', v_corr));
          PERFORM public.emit_outbox_event('inventory', v_rec.ingredient_id, 'inventory.stock_changed',
            jsonb_build_object('order_item_id', p_order_item_id, 'ingredient_id', v_rec.ingredient_id, 'quantity', COALESCE(v_rec.quantity_brutto, v_rec.quantity_required) * v_refund_qty),
            jsonb_build_object('correlation_id', v_corr));
        END IF;
      END LOOP;
    END IF;

  ELSIF p_item_fate = 'waste' THEN
    INSERT INTO public.cancelled_orders (
      order_id, reason, reason_text, items, total_amount, created_at
    ) VALUES (
      p_order_id, 'waste',
      COALESCE(p_reason_text, 'Refund + waste: ' || COALESCE(v_oi.product_name, 'Məhsul')),
      jsonb_build_array(jsonb_build_object(
        'order_item_id', p_order_item_id,
        'product_name', v_oi.product_name,
        'quantity', v_refund_qty,
        'unit_price', v_oi.unit_price,
        'kitchen_status', v_oi.kitchen_status,
        'reason', p_reason
      )),
      v_refund_amount,
      v_now
    );

    -- H8: waste fate writes canonical waste ledger rows for the refunded
    -- quantity. Per H10.1/M1 these rows are order-context waste => zero stock
    -- effect (stock was already deducted by the READY consumption), so only
    -- inventory.transaction.created is emitted (no stock_changed).
    IF v_prod_found AND v_product.is_ready_product AND v_product.direct_ingredient_id IS NOT NULL THEN
      v_key := 'refund_waste:' || p_order_item_id::text || ':' || v_product.direct_ingredient_id::text;
      INSERT INTO public.inventory_logs (
        ingredient_id, type, quantity, unit, order_id, order_item_id,
        item_quantity, reference_type, reference_id, correlation_id, idempotency_key,
        performed_by, reason, created_at, location_id, organization_id
      ) VALUES (
        v_product.direct_ingredient_id, 'waste', v_refund_qty,
        (SELECT COALESCE(unit, 'gram') FROM public.ingredients WHERE id = v_product.direct_ingredient_id),
        p_order_id, p_order_item_id, v_refund_qty, 'order', p_order_id,
        v_corr, v_key, p_performed_by,
        'Refund — waste: ' || COALESCE(v_oi.product_name, 'Məhsul'),
        v_now, v_order.location_id, v_order.organization_id
      )
      ON CONFLICT DO NOTHING RETURNING id INTO v_id;
      IF v_id IS NOT NULL THEN
        v_waste_recorded := 1;
        PERFORM public.emit_outbox_event('inventory', v_product.direct_ingredient_id, 'inventory.transaction.created',
          jsonb_build_object('order_item_id', p_order_item_id, 'ingredient_id', v_product.direct_ingredient_id, 'quantity', v_refund_qty, 'type', 'waste'),
          jsonb_build_object('correlation_id', v_corr));
      END IF;

    ELSIF v_prod_found THEN
      FOR v_rec IN
        SELECT r.ingredient_id, r.quantity_required, r.quantity_brutto,
               COALESCE(i.unit, 'gram') AS unit
        FROM public.recipes r
        JOIN public.ingredients i ON i.id = r.ingredient_id
        WHERE r.menu_item_id = v_oi.product_id AND r.is_ai_suggested = false
      LOOP
        v_key := 'refund_waste:' || p_order_item_id::text || ':' || v_rec.ingredient_id::text;
        INSERT INTO public.inventory_logs (
          ingredient_id, type, quantity, unit, order_id, order_item_id,
          item_quantity, reference_type, reference_id, correlation_id, idempotency_key,
          performed_by, reason, created_at, location_id, organization_id
        ) VALUES (
          v_rec.ingredient_id, 'waste',
          COALESCE(v_rec.quantity_brutto, v_rec.quantity_required) * v_refund_qty,
          v_rec.unit, p_order_id, p_order_item_id, v_refund_qty, 'order', p_order_id,
          v_corr, v_key, p_performed_by,
          'Refund — waste: ' || COALESCE(v_oi.product_name, 'Məhsul'),
          v_now, v_order.location_id, v_order.organization_id
        )
        ON CONFLICT DO NOTHING RETURNING id INTO v_id;
        IF v_id IS NOT NULL THEN
          v_waste_recorded := 1;
          PERFORM public.emit_outbox_event('inventory', v_rec.ingredient_id, 'inventory.transaction.created',
            jsonb_build_object('order_item_id', p_order_item_id, 'ingredient_id', v_rec.ingredient_id, 'quantity', COALESCE(v_rec.quantity_brutto, v_rec.quantity_required) * v_refund_qty, 'type', 'waste'),
            jsonb_build_object('correlation_id', v_corr));
        END IF;
      END LOOP;
    END IF;
  END IF;

  -- ===== Item state transition (unchanged; total_amount NOT recomputed) =====
  IF v_refund_qty >= v_oi.quantity THEN
    UPDATE public.order_items SET kitchen_status = 'voided', total_price = 0 WHERE id = p_order_item_id;
  ELSE
    UPDATE public.order_items SET
      quantity = v_oi.quantity - v_refund_qty,
      total_price = COALESCE(unit_price, 0) * (v_oi.quantity - v_refund_qty)
    WHERE id = p_order_item_id;
  END IF;

  -- ===== Audit (before/after from derived state) =====
  PERFORM public.log_audit(
    'refund_with_inventory', 'order', p_order_id::text,
    p_performed_by, v_performer_name,
    jsonb_build_object('paid_amount', v_order.paid_amount, 'status', v_order.status),
    jsonb_build_object(
      'refund_amount', v_refund_after,
      'refund_qty', v_refund_qty,
      'item_fate', p_item_fate,
      'product_name', v_oi.product_name,
      'stock_returned', v_stock_returned,
      'waste_recorded', v_waste_recorded,
      'new_paid_amount', v_paid_after
    ),
    jsonb_build_object('order_id', p_order_id, 'order_item_id', p_order_item_id),
    NULL
  );

  v_result := jsonb_build_object(
    'success', true,
    'action', 'refund_with_inventory',
    'refund_amount', v_refund_after,
    'quantity_refunded', v_refund_qty,
    'item_fate', p_item_fate,
    'stock_returned', v_stock_returned > 0,
    'waste_recorded', v_waste_recorded > 0,
    'new_paid_amount', v_paid_after,
    'new_status', v_status_after,
    'order_id', p_order_id,
    'timestamp', v_now
  );

  -- ═══ P-4 C-2/C-4/C-6: STORE IDEMPOTENCY KEY + RESULT (atomic, namespace='refund', TTL 30d) ═══
  IF p_idempotency_key IS NOT NULL THEN
    INSERT INTO payment_idempotency_keys (namespace, key, order_id, amount, status, result, expires_at)
    VALUES ('refund', p_idempotency_key, p_order_id, v_refund_effect, 'completed', v_result,
            now() + interval '30 days');
  END IF;

  RETURN v_result;
END;
$function$;

-- ----------------------------------------------------------------------------
-- D. Pruner — self-throttled, service-role-only, key metadata ONLY
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prune_expired_idempotency_keys()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_pruned integer := 0;
BEGIN
  -- advisory lock: concurrent callers (pay/refund routes, best-effort) serialize
  IF NOT pg_try_advisory_lock(41000001) THEN
    RETURN 0;
  END IF;
  BEGIN
    DELETE FROM payment_idempotency_keys WHERE expires_at IS NOT NULL AND expires_at < now();
    GET DIAGNOSTICS v_pruned = ROW_COUNT;
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_advisory_unlock(41000001);
    RETURN 0;
  END;
  PERFORM pg_advisory_unlock(41000001);
  RETURN v_pruned;
END;
$function$;
GRANT EXECUTE ON FUNCTION public.prune_expired_idempotency_keys() TO service_role;
REVOKE EXECUTE ON FUNCTION public.prune_expired_idempotency_keys() FROM anon, authenticated, public;

-- ----------------------------------------------------------------------------
-- Sanity: P-4 contract invariants (fail the migration if violated)
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  n int;
BEGIN
  -- schema
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='payment_idempotency_keys' AND column_name='namespace')
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='payment_idempotency_keys' AND column_name='expires_at') THEN
    RAISE EXCEPTION 'P-4 sanity: payment_idempotency_keys missing namespace/expires_at';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    WHERE c.conrelid='public.payment_idempotency_keys'::regclass AND c.contype='p' AND
      pg_get_indexdef(c.conindid) LIKE '%USING btree (namespace, key)%'
  ) THEN
    RAISE EXCEPTION 'P-4 sanity: PK is not exactly (namespace,key)';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE tablename='payment_idempotency_keys'
             AND indexname='payment_idempotency_keys_key_unique') THEN
    RAISE EXCEPTION 'P-4 sanity: redundant key_unique index still present';
  END IF;
  -- functions
  SELECT count(*) INTO n FROM pg_proc WHERE proname='complete_payment_atomic_v2' AND
    pronargs=14 AND pg_get_functiondef(oid) LIKE '%IDEMPOTENCY_CONFLICT%' AND
    pg_get_functiondef(oid) LIKE '%v_idem_namespace := CASE WHEN v_refund_total > 0%';
  IF n <> 1 THEN RAISE EXCEPTION 'P-4 sanity: complete_payment_atomic_v2 rewrite missing (n=%)', n; END IF;
  SELECT count(*) INTO n FROM pg_proc WHERE proname='refund_with_inventory' AND
    pronargs=11 AND pg_get_functiondef(oid) LIKE '%IDEMPOTENCY_CONFLICT%' AND
    pg_get_functiondef(oid) LIKE '%WHERE namespace = ''refund'' AND key = p_idempotency_key%';
  IF n <> 1 THEN RAISE EXCEPTION 'P-4 sanity: refund_with_inventory rewrite missing (n=%)', n; END IF;
  SELECT count(*) INTO n FROM pg_proc WHERE proname='prune_expired_idempotency_keys' AND prokind='f';
  IF n <> 1 THEN RAISE EXCEPTION 'P-4 sanity: pruner missing'; END IF;
  -- ACL: service_role EXECUTE granted; anon/authenticated/public revoked.
  -- Assert via proacl (the GRANT/REVOKE above produce exactly this shape).
  -- A public grant is an ACL element that STARTS with '=' (i.e. "=X" right
  -- after '{' or ','); "postgres=X"/"service_role=X" are named entries (fine).
  IF (SELECT coalesce(proacl::text,'') FROM pg_proc WHERE proname='prune_expired_idempotency_keys' AND prokind='f') NOT LIKE '%service_role=X%' OR
     (SELECT coalesce(proacl::text,'') FROM pg_proc WHERE proname='prune_expired_idempotency_keys' AND prokind='f') ~ '(^|{|,)=X' THEN
    RAISE EXCEPTION 'P-4 sanity: pruner ACL wrong (expected service_role=X, no public/role-less =X entry)';
  END IF;
  -- legacy rows backfilled
  SELECT count(*) INTO n FROM payment_idempotency_keys
    WHERE namespace IS DISTINCT FROM 'payment' OR expires_at IS NULL;
  IF n <> 0 THEN RAISE EXCEPTION 'P-4 sanity: % legacy key rows not backfilled', n; END IF;
END;
$$;

COMMIT;
