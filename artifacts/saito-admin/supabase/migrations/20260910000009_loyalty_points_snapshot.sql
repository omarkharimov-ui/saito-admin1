-- ═════════════════════════════════════════════════════════════════════
-- Migration 20260910000009 — LOYALTY POINTS SNAPSHOT (torture finding)
-- ═════════════════════════════════════════════════════════════════════
-- Bug (found in Wave-0 torture re-run, live DB): refund_with_inventory
-- DELETES an order_items row when the full quantity is refunded.
-- loyalty_reverse recomputed the item's points via loyalty_item_points()
-- → row gone → 0 pts → 'zero_points' SILENT SKIP.
-- Consequence: a customer who refunds an item KEEPS its loyalty points
-- (points leak — real money if points redeem for cash value).
--
-- Fix (deterministic, no recompute):
--   1. loyalty_order_points  — per-item snapshot, written AT EARN TIME by
--      loyalty_earn (which is what actually granted the points).
--   2. loyalty_reverse       — item reversal reads the snapshot (survives
--      row deletion); full reversal reads snapshot rows; only falls back
--      to loyalty_item_points() when no snapshot row exists (pre-migration
--      orders).
--
-- FROZEN contracts untouched: refund_with_inventory, complete_payment_atomic_v2,
-- _loyalty_post (idempotency), calculate_order_total_v3. Only the two loyalty
-- functions + one new table change.
BEGIN;

-- 1) Snapshot table
CREATE TABLE IF NOT EXISTS public.loyalty_order_points (
  order_item_id      uuid PRIMARY KEY,   -- one row per item ever earned
  order_id           uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  customer_id        uuid NOT NULL,
  points_earned      integer NOT NULL,
  quantity_at_earn   integer NOT NULL DEFAULT 1,
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_loyalty_order_points_order ON public.loyalty_order_points(order_id);

-- 2) loyalty_earn: same math, plus snapshot upsert per item (before the
--    total ledger post, so reversal data exists the instant points do).
CREATE OR REPLACE FUNCTION public.loyalty_earn(
  p_order_id     uuid,
  p_performed_by uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $fn$
DECLARE
  v_order    RECORD;
  v_item     RECORD;
  v_acct     uuid;
  v_total    integer := 0;
  v_key      text;
  v_post     jsonb;
  v_pts_item integer;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'ORDER_NOT_FOUND');
  END IF;
  IF v_order.customer_id IS NULL THEN
    RETURN jsonb_build_object('success', true, 'result', 'skipped', 'reason', 'no_customer');
  END IF;
  -- Idempotent: already earned on this order (status flip retry).
  IF COALESCE(v_order.loyalty_points_earned, 0) > 0 THEN
    RETURN jsonb_build_object('success', true, 'result', 'skipped', 'reason', 'already_earned', 'points', v_order.loyalty_points_earned);
  END IF;

  FOR v_item IN
    SELECT id, quantity, total_price, unit_price FROM public.order_items
     WHERE order_id = p_order_id
       AND COALESCE(kitchen_status, 'pending') NOT IN ('cancelled','voided','wasted')
  LOOP
    v_pts_item := public.loyalty_item_points(v_item.id);
    v_total    := v_total + v_pts_item;
    -- 000009: persist the per-item grant now — the item row may be DELETED
    -- later by a full refund, and the reversal must not depend on it.
    INSERT INTO public.loyalty_order_points (order_item_id, order_id, customer_id, points_earned, quantity_at_earn)
    VALUES (v_item.id, p_order_id, v_order.customer_id, v_pts_item, GREATEST(COALESCE(v_item.quantity, 1), 0))
    ON CONFLICT (order_item_id) DO UPDATE
      SET points_earned = EXCLUDED.points_earned,
          quantity_at_earn = EXCLUDED.quantity_at_earn;
  END LOOP;

  IF v_total <= 0 THEN
    UPDATE public.orders SET loyalty_points_earned = 0 WHERE id = p_order_id;
    RETURN jsonb_build_object('success', true, 'result', 'skipped', 'reason', 'zero_points');
  END IF;

  v_acct := public.loyalty_ensure_account(v_order.customer_id);
  v_key  := 'earn:' || p_order_id::text;
  v_post := public._loyalty_post(v_acct, 'earn', v_total, 'order', p_order_id,
    'Spend earn (per-product rules)', p_performed_by, NULL, v_key);

  UPDATE public.orders SET loyalty_points_earned = v_total WHERE id = p_order_id;

  RETURN jsonb_build_object('success', true, 'result', 'posted',
    'points', v_total, 'balance_after', v_post->>'balance_after',
    'customer_id', v_order.customer_id, 'post', v_post);
END;
$fn$;

-- 3) loyalty_reverse: snapshot-first, recompute-only-as-fallback.
CREATE OR REPLACE FUNCTION public.loyalty_reverse(
  p_order_id       uuid,
  p_order_item_id  uuid DEFAULT NULL,
  p_reason         text DEFAULT 'refund',
  p_performed_by   uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $fn$
DECLARE
  v_order      RECORD;
  v_item_live  RECORD;
  v_acct       uuid;
  v_pts        integer := 0;
  v_snap       public.loyalty_order_points%ROWTYPE;
  v_key        text;
  v_post       jsonb;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'ORDER_NOT_FOUND');
  END IF;
  IF v_order.customer_id IS NULL THEN
    RETURN jsonb_build_object('success', true, 'result', 'skipped', 'reason', 'no_customer');
  END IF;
  IF COALESCE(v_order.loyalty_points_earned, 0) <= 0 THEN
    RETURN jsonb_build_object('success', true, 'result', 'skipped', 'reason', 'nothing_earned');
  END IF;

  IF p_order_item_id IS NULL THEN
    -- Full reversal: everything still counted in the snapshot (or recomputed
    -- for pre-migration orders without snapshot rows).
    FOR v_snap IN
      SELECT * FROM public.loyalty_order_points
       WHERE order_id = p_order_id
    LOOP
      v_pts := v_pts + v_snap.points_earned;
    END LOOP;
    IF v_pts = 0 THEN
      -- Pre-migration fallback: recompute from live item rows.
      FOR v_item_live IN
        SELECT id FROM public.order_items
         WHERE order_id = p_order_id
           AND COALESCE(kitchen_status, 'pending') NOT IN ('cancelled','voided','wasted')
      LOOP
        v_pts := v_pts + public.loyalty_item_points(v_item_live.id);
      END LOOP;
    END IF;
    v_key := 'reversal:' || p_order_id::text || ':all';
    UPDATE public.orders SET loyalty_points_earned = 0 WHERE id = p_order_id;
  ELSE
    -- 000009: snapshot FIRST — survives refund_with_inventory deleting the
    -- item row on a full-quantity refund (the old recompute returned 0 and
    -- silently kept the customer's points).
    SELECT * INTO v_snap FROM public.loyalty_order_points
     WHERE order_item_id = p_order_item_id AND order_id = p_order_id;
    IF FOUND THEN
      v_pts := v_snap.points_earned;
    ELSE
      v_pts := public.loyalty_item_points(p_order_item_id);
    END IF;
    v_key := 'reversal:' || p_order_id::text || ':' || p_order_item_id::text;
    UPDATE public.orders SET
      loyalty_points_earned = GREATEST(COALESCE(loyalty_points_earned, 0) - v_pts, 0)
    WHERE id = p_order_id;
  END IF;

  IF v_pts <= 0 THEN
    RETURN jsonb_build_object('success', true, 'result', 'skipped', 'reason', 'zero_points');
  END IF;

  v_acct := public.loyalty_ensure_account(v_order.customer_id);
  v_post := public._loyalty_post(v_acct, 'reversal', -v_pts, 'order', p_order_id,
    COALESCE(p_reason, 'refund'), p_performed_by, NULL, v_key);

  RETURN jsonb_build_object('success', true, 'result', 'posted',
    'points', -v_pts, 'balance_after', v_post->>'balance_after', 'post', v_post);
END;
$fn$;

COMMIT;
