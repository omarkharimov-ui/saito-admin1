-- ═════════════════════════════════════════════════════════════════════
-- Migration 20260910000008 — U-2: release a fully-PAID table (Core Freeze)
-- ═════════════════════════════════════════════════════════════════════
-- UI E2E finding (2026-09-10): after payment the table stayed OCCUPIED
-- with no way out — dismiss_table_atomic excludes paid orders
-- (G_NO_ACTIVE_ORDER) by design (it cancels active orders; paid ones must
-- CLOSE, not cancel).
--
-- Fix: a NEW additive RPC. Paid orders transition paid -> closed (registered
-- edge, orders.edit), the table releases to empty/cleaning, the stale order
-- pointer clears, aggregates + audit fire. dismiss_table_atomic and
-- table_release_guard are UNTOUCHED (frozen).
--
-- Preconditions:
--   * table exists, not reserved, not merged
--   * every order on the table is in a terminal state
--     (paid/closed/refunded/partially_refunded/cancelled/voided)
--   * at least one order exists (nothing to release otherwise)
--   * paid orders that are not fully refunded are closed by this RPC
BEGIN;

-- partially_refunded -> closed: release path for a table whose remaining
-- balance was paid out after an item refund (refund -> reopen -> re-pay ->
-- paid, then a further refund leaves partially_refunded; the table must
-- still be releasable). Additive registry row only.
INSERT INTO public.state_transitions
  (entity, from_status, to_status, requires_permission, description)
SELECT 'order', 'partially_refunded', 'closed', 'orders.edit',
       'release after settlement (U-2)'
WHERE NOT EXISTS (
  SELECT 1 FROM public.state_transitions
  WHERE entity = 'order' AND from_status = 'partially_refunded'
    AND to_status = 'closed'
);

CREATE OR REPLACE FUNCTION public.release_paid_table_atomic(
  p_table_number   integer,
  p_final_status   text DEFAULT 'empty',
  p_performed_by   uuid DEFAULT NULL,
  p_terminal_id    text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $fn$
DECLARE
  v_table RECORD;
  v_open  int;
  v_paid  int;
  v_old_state jsonb;
BEGIN
  IF p_performed_by IS NOT NULL THEN
    PERFORM public.validate_actor(p_performed_by);
  END IF;
  IF p_final_status NOT IN ('empty','cleaning') THEN
    RETURN jsonb_build_object('success', false, 'error', 'G_DISMISS_INVALID_FINAL');
  END IF;

  SELECT * INTO v_table FROM public.table_floors
   WHERE table_number = p_table_number FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'TABLE_NOT_FOUND');
  END IF;
  IF v_table.reservation_id IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'G_TABLE_RESERVED');
  END IF;
  IF v_table.merged_into_table IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'G_TABLE_MERGED');
  END IF;

  -- Any non-terminal order? Refuse — those must be voided/wasted via dismiss.
  SELECT count(*) INTO v_open FROM public.orders
   WHERE table_number = p_table_number
     AND status NOT IN ('paid','cancelled','closed','refunded','partially_refunded','voided');
  IF v_open > 0 THEN
    RETURN jsonb_build_object('success', false,
      'error', 'G_TABLE_HAS_ACTIVE_ORDERS', 'open_orders', v_open);
  END IF;

  -- Paid orders still to close (paid, or partially_refunded with a paid part
  -- already settled — both transition to closed legally).
  SELECT count(*) INTO v_paid FROM public.orders
   WHERE table_number = p_table_number
     AND status IN ('paid','partially_refunded');
  IF v_paid = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'G_NO_PAID_ORDER');
  END IF;

  v_old_state := jsonb_build_object(
    'status', v_table.status,
    'order_id', v_table.current_order_id,
    'paid_orders', v_paid);

  -- paid/partially_refunded -> closed (registered edge; guard stamps closed_at)
  UPDATE public.orders SET
    status = 'closed',
    version = COALESCE(version, 0) + 1,
    updated_by_terminal_id = p_terminal_id
  WHERE table_number = p_table_number
    AND status IN ('paid','partially_refunded');

  -- release the table (mirrors dismiss_table_atomic's release block)
  UPDATE public.table_floors SET
    status = p_final_status,
    guest_count = NULL,
    total_amount = 0,
    order_count = 0,
    current_order_id = NULL,
    merged_into_table = NULL,
    reservation_id = NULL,
    reservation_name = NULL,
    reservation_phone = NULL,
    reservation_time = NULL,
    has_pending = false,
    oldest_pending_at = NULL,
    bill_requested = false,
    updated_at = now(),
    updated_by_terminal_id = p_terminal_id
  WHERE table_number = p_table_number;

  PERFORM public.sync_table_order_aggregates(p_table_number);

  PERFORM public.g_table_audit(
    'release_paid_table', 'table.released_after_payment',
    p_table_number, v_table.id, v_table.current_order_id,
    v_old_state,
    jsonb_build_object('status', p_final_status, 'orders_closed', v_paid),
    p_performed_by, p_terminal_id, NULL,
    p_table_number, NULL, v_table.location_id, v_table.organization_id);

  RETURN jsonb_build_object('success', true,
    'table_status', p_final_status, 'orders_closed', v_paid);
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.release_paid_table_atomic(integer, text, uuid, text) TO anon, authenticated, service_role;

COMMIT;
