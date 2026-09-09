-- ═════════════════════════════════════════════════════════════════════
-- Migration 20260910000002  (task 1.4 / D-8)
-- REFUND CHAIN — 5 blockers, atomic, no frozen-contract change
-- ═════════════════════════════════════════════════════════════════════
-- REVIEWED DESIGN: see D8_REFUND_CHAIN_DESIGN.md at repo root.
--
-- Scope (5 targeted changes, each idempotent / CREATE OR REPLACE):
--   B1  recalculate_order_payment_state : count 'captured' as paid (money fix)
--   B2  _inventory_reverse_item         : only reverse NET-not-yet-reversed
--                                          consumption (kills double-return)
--   B3  state_transitions               : add partially_refunded → new
--   B4  reopen_order_atomic             : accept partially_refunded/refunded
--   B5  validate_payment_order_balance  : exclude refund rows from 'existing'
--
-- Invariants preserved (DO NOT regress):
--   • complete_payment_atomic_v2 untouched (FROZEN) — it writes paid_amount
--     directly and does NOT call recalc, so the frozen pay path is unchanged.
--   • order_payments stays the canonical ledger; DELETE-on-reopen contract kept.
--   • Idempotency key schemes unchanged (B2 only adds a HAVING net-guard).
--   • RLS / item state-machine guard / aggregate trigger untouched.
-- ═════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────
-- B1 — recalculate_order_payment_state: count 'captured' in v_paid / v_cash
-- ─────────────────────────────────────────────────────────────────────────
-- complete_payment_atomic_v2 writes canonical rows with status='captured'.
-- The old recalc only counted ('success','paid','authorized'), so after a
-- refund the recalc dropped v_paid to 0 and zeroed orders.paid_amount.
CREATE OR REPLACE FUNCTION public.recalculate_order_payment_state(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_paid     NUMERIC := 0;
  v_cash     NUMERIC := 0;
  v_refund   NUMERIC := 0;
  v_order    RECORD;
  v_payable  NUMERIC;
  v_method   TEXT;
  v_status   TEXT;
BEGIN
  -- B1: 'captured' (canonical) is now counted as paid. Legacy statuses kept.
  SELECT COALESCE(SUM(amount), 0)
    INTO v_paid
    FROM order_payments
   WHERE order_id = p_order_id
     AND COALESCE(status, 'success') IN ('success','paid','authorized','captured')
     AND COALESCE(is_refund, false) = false;

  SELECT COALESCE(SUM(amount), 0)
    INTO v_cash
    FROM order_payments
   WHERE order_id = p_order_id
     AND COALESCE(status, 'success') IN ('success','paid','authorized','captured')
     AND COALESCE(is_refund, false) = false
     AND payment_method IN ('cash','nağd');

  SELECT COALESCE(SUM(amount), 0)
    INTO v_refund
    FROM order_payments
   WHERE order_id = p_order_id
     AND COALESCE(is_refund, false) = true;

  SELECT * INTO v_order FROM orders WHERE id = p_order_id;
  IF NOT FOUND THEN RETURN; END IF;

  v_payable := COALESCE(v_order.total_amount, 0) - COALESCE(v_order.discount_amount, 0);
  v_method  := v_order.payment_method;
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
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- B2 — _inventory_reverse_item: reverse only NET-not-yet-reversed consumption
-- ─────────────────────────────────────────────────────────────────────────
-- Previously each reversal used its own idempotency key, so a refund
-- (reversal #1) followed by a reopen (reversal #2) BOTH re-added stock for
-- the same consumption → stock inflation. Now we compare cumulative
-- consumption vs cumulative reversal per (item, ingredient) and only
-- reverse the un-reversed remainder. Fully idempotent.
CREATE OR REPLACE FUNCTION public._inventory_reverse_item(
  p_order_item_id  uuid,
  p_reason         text        DEFAULT 'void',
  p_performed_by   uuid        DEFAULT NULL,
  p_correlation_id uuid        DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_order RECORD;
  v_r     RECORD;
  v_corr  uuid := COALESCE(p_correlation_id, gen_random_uuid());
  v_reversed INT := 0;
  v_id   uuid;
BEGIN
  IF p_performed_by IS NOT NULL THEN
    PERFORM public.validate_actor(p_performed_by);
  END IF;

  SELECT o.* INTO v_order
    FROM public.orders o
    JOIN public.order_items oi ON oi.order_id = o.id
   WHERE oi.id = p_order_item_id
   LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', true, 'result', 'no_order', 'reversed', 0);
  END IF;

  -- B2: for each ingredient, reverse only the consumption NOT already
  -- reversed. net_to_reverse = consumption - existing_reversals (> 0).
  FOR v_r IN
    SELECT l.ingredient_id,
           ( SUM(l.quantity)
             - COALESCE( (SELECT SUM(r.quantity)
                            FROM public.inventory_logs r
                           WHERE r.order_item_id = p_order_item_id
                             AND r.ingredient_id = l.ingredient_id
                             AND r.type = 'reversal'), 0 )
           ) AS net_to_reverse,
           COALESCE(MAX(l.unit), COALESCE((SELECT unit FROM public.ingredients WHERE id = l.ingredient_id), 'gram')) AS unit
      FROM public.inventory_logs l
     WHERE l.order_item_id = p_order_item_id
       AND l.type = 'order_consumption'
     GROUP BY l.ingredient_id
  LOOP
    IF v_r.net_to_reverse IS NULL OR v_r.net_to_reverse <= 0 THEN
      CONTINUE;  -- already fully reversed (by a prior refund or reversal)
    END IF;

    INSERT INTO public.inventory_logs
      (ingredient_id, type, quantity, unit, order_id, order_item_id,
       reference_type, reference_id, correlation_id, idempotency_key, performed_by,
       reason, location_id, organization_id, created_at)
    VALUES
      (v_r.ingredient_id, 'reversal', v_r.net_to_reverse, v_r.unit,
       v_order.id, p_order_item_id, 'order', v_order.id,
       v_corr, 'reversal:' || p_order_item_id::text || ':' || v_r.ingredient_id::text || ':' || v_corr::text,
       p_performed_by, COALESCE(p_reason, 'void'), v_order.location_id, v_order.organization_id, now())
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_id;

    IF v_id IS NOT NULL THEN
      v_reversed := v_reversed + 1;
      PERFORM public.emit_outbox_event('inventory', v_r.ingredient_id, 'inventory.transaction.created',
        jsonb_build_object('order_item_id', p_order_item_id, 'ingredient_id', v_r.ingredient_id, 'quantity', v_r.net_to_reverse, 'type', 'reversal'),
        jsonb_build_object('correlation_id', v_corr));
      PERFORM public.emit_outbox_event('inventory', v_r.ingredient_id, 'inventory.stock_changed',
        jsonb_build_object('order_item_id', p_order_item_id, 'ingredient_id', v_r.ingredient_id, 'quantity', v_r.net_to_reverse),
        jsonb_build_object('correlation_id', v_corr));
      PERFORM public.emit_outbox_event('inventory', v_r.ingredient_id, 'inventory.reversal.requested',
        jsonb_build_object('order_item_id', p_order_item_id, 'ingredient_id', v_r.ingredient_id, 'quantity', v_r.net_to_reverse, 'reason', p_reason),
        jsonb_build_object('correlation_id', v_corr));
    END IF;
  END LOOP;

  IF v_reversed = 0 THEN
    RETURN jsonb_build_object('success', true, 'result', 'no_consumption', 'reversed', 0);
  END IF;

  RETURN jsonb_build_object('success', true, 'result', 'reversed', 'reversed', v_reversed, 'correlation_id', v_corr);
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- B3 — allow reopen from partially_refunded (state transition)
-- ─────────────────────────────────────────────────────────────────────────
-- Idempotent: only inserts if the (order, partially_refunded → new) rule
-- does not already exist.
INSERT INTO public.state_transitions
  (entity, from_status, to_status, is_active, requires_role, requires_permission, description)
SELECT 'order', 'partially_refunded', 'new', true, NULL, 'orders.edit',
       'D-8: reopen a partially refunded order (returns to new; payments cleared)'
WHERE NOT EXISTS (
  SELECT 1 FROM public.state_transitions
   WHERE entity = 'order' AND from_status = 'partially_refunded' AND to_status = 'new'
);

-- ─────────────────────────────────────────────────────────────────────────
-- B4 — reopen_order_atomic: accept partially_refunded / refunded as source
-- ─────────────────────────────────────────────────────────────────────────
-- (Full body mirrored from live function; only the source-status guard
--  widens. DELETE order_payments + reverse items unchanged.)
-- IMPORTANT: arg types must EXACTLY match the live function or Postgres
-- creates a NEW overload instead of replacing. Live signature uses
-- p_performed_by_terminal_id TEXT (verified 2026-09-10, oid 29843).
CREATE OR REPLACE FUNCTION public.reopen_order_atomic(
  p_order_id               uuid,
  p_reason                 text        DEFAULT NULL,
  p_performed_by           uuid        DEFAULT NULL,
  p_performed_by_terminal_id text      DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_order RECORD;
  v_item  RECORD;
  v_rev   jsonb;
  v_reversed integer := 0;
BEGIN
  PERFORM public.validate_actor(p_performed_by);

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;

  -- B4: also allow reopening a (partially) refunded order.
  IF v_order.status NOT IN ('paid','completed','partially_refunded','refunded') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order is not paid/completed/refunded');
  END IF;

  -- Canonical reversal of every not-yet-reversed consumed item (B2 net-guard).
  FOR v_item IN
    SELECT oi.id FROM public.order_items oi
    WHERE oi.order_id = p_order_id
  LOOP
    v_rev := public._inventory_reverse_item(v_item.id, 'reopen', p_performed_by);
    IF (v_rev->>'reversed')::int > 0 THEN
      v_reversed := v_reversed + (v_rev->>'reversed')::int;
    END IF;
  END LOOP;

  DELETE FROM public.order_payments WHERE order_id = p_order_id;

  UPDATE public.orders SET
    status = 'new',
    paid_amount = 0,
    cash_amount = 0,
    card_amount = 0,
    tip_amount = 0,
    paid_at = NULL,
    version = COALESCE(v_order.version, 0) + 1,
    updated_by_terminal_id = p_performed_by_terminal_id,
    updated_at = NOW()
  WHERE id = p_order_id;

  INSERT INTO public.operation_logs (
    table_number, order_id, action, old_values, new_values, performed_by
  ) VALUES (
    v_order.table_number, p_order_id, 'reopen_order',
    jsonb_build_object('status', v_order.status),
    jsonb_build_object('status', 'new', 'reason', p_reason),
    p_performed_by
  );

  RETURN jsonb_build_object('success', true, 'reversed', v_reversed);
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- B5 — validate_payment_order_balance: exclude refund rows from 'existing'
-- ─────────────────────────────────────────────────────────────────────────
-- Refund rows (is_refund=true) must not count as "already paid", otherwise
-- a legitimate re-payment after a refund is blocked (O-2).
CREATE OR REPLACE FUNCTION public.validate_payment_order_balance()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_order_total NUMERIC;
  v_existing_payments NUMERIC;
  v_refund_amount NUMERIC;
BEGIN
  SELECT total_amount INTO v_order_total FROM orders WHERE id = NEW.order_id;

  -- B5: only NON-refund, non-failed/voided rows count as existing.
  SELECT COALESCE(SUM(amount), 0) INTO v_existing_payments
    FROM order_payments
   WHERE order_id = NEW.order_id
     AND id != NEW.id
     AND status NOT IN ('failed','voided')
     AND COALESCE(is_refund, false) = false;

  SELECT COALESCE(SUM(amount), 0) INTO v_refund_amount
    FROM order_payments
   WHERE order_id = NEW.order_id
     AND is_refund = true
     AND status = 'captured';

  IF NOT NEW.is_refund THEN
    IF (v_existing_payments + NEW.amount) > v_order_total THEN
      RAISE EXCEPTION 'Payment total cannot exceed order total (0.1.42). Order: %, Existing: %, New: %',
        v_order_total, v_existing_payments, NEW.amount;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMIT;

-- ═════════════════════════════════════════════════════════════════════
-- Post-apply verification (manual, NOT part of migration):
--   1) pay an order (complete_payment_atomic_v2) → paid_amount>0
--   2) refund_with_inventory(full) → status=refunded, paid_amount STAYS >0 (B1)
--   3) reopen_order_atomic → status=new, stock reversed ONCE (B2, no inflation)
--   4) repay → succeeds (B4/B5), paid_amount correct
--   5) partial refund then reopen → allowed (B3), no double-return (B2)
-- ═════════════════════════════════════════════════════════════════════
