-- 2026-10-02 (12i, owner): "metbex qəbul etməlidir → status hazırlanır; metbex
-- hazırdır basanda status uje hazırdır, 2-3 saniyə sonra çevrilir serve; servis
-- edənən servis edilmiş olacaq" — the canonical kitchen workflow.
--
-- The state machine machinery ALREADY exists (frozen registry + rollup):
--   items : pending → (✓) ready → (served) served        [state_transitions:
--            ready → pending = recall (un-tick) — verified in DB]
--   order : sync_order_kitchen_status rollup produces
--            accepted / preparing / partially_ready / ready / served
--   orders.kitchen_ready_at is stamped by mark_item_ready_atomic when the
--            WHOLE order becomes ready → the UI derives the "serve" display
--            state 3 s later (no cron, no worker — 100% keyless).
--
-- What was missing = the order-level SERVE primitive (all ready items →
-- served in one atomic action, with the all-ready invariant).

CREATE OR REPLACE FUNCTION public.mark_order_served_atomic(
  p_order_id uuid,
  p_performed_by uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_order RECORD;
  v_performer_name TEXT;
  v_served INT := 0;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('serve_order:' || p_order_id::text));

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;

  IF v_order.status IN ('paid','closed','refunded','cancelled') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot serve a ' || v_order.status || ' order');
  END IF;

  -- Idempotent: nothing left to serve → success noop.
  IF NOT EXISTS (
    SELECT 1 FROM public.order_items
    WHERE order_id = p_order_id
      AND kitchen_status NOT IN ('served','cancelled','voided','comped','wasted')
  ) THEN
    RETURN jsonb_build_object('success', true, 'action', 'serve_order',
      'served', 0, 'idempotent', true, 'order_id', p_order_id);
  END IF;

  -- Whole-order invariant (same rule as mark_item_ready_atomic): the order
  -- moves to SERVİS EDİLDİ only when EVERY active item is ready. Partial
  -- serves would poison the rollup (served>0 → order 'served' even while
  -- other items are still cooking).
  IF EXISTS (
    SELECT 1 FROM public.order_items
    WHERE order_id = p_order_id
      AND kitchen_status NOT IN ('ready','served','cancelled','voided','comped','wasted')
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'ORDER_NOT_FULLY_READY');
  END IF;

  IF p_performed_by IS NOT NULL THEN
    SELECT name INTO v_performer_name FROM public.staff WHERE id = p_performed_by;
  END IF;

  UPDATE public.order_items
     SET kitchen_status = 'served', served_at = v_now, updated_at = v_now
   WHERE order_id = p_order_id AND kitchen_status = 'ready';
  GET DIAGNOSTICS v_served = ROW_COUNT;

  PERFORM public.log_audit(
    'serve_order', 'order', p_order_id::text,
    p_performed_by, v_performer_name, NULL,
    jsonb_build_object('served', v_served),
    jsonb_build_object('order_id', p_order_id), NULL
  );

  RETURN jsonb_build_object('success', true, 'action', 'serve_order',
    'served', v_served, 'order_id', p_order_id, 'timestamp', v_now);
END;
$$;

COMMENT ON FUNCTION public.mark_order_served_atomic(uuid, uuid) IS
  '12i: serve ALL ready items of an order in one atomic action (kitchen → service). '
  'The sync_order_kitchen_status rollup moves the order to served. All-ready invariant enforced.';
