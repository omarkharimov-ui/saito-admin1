-- 20260922000004_mark_ready_null_array_fix.sql
-- BUG (live repro 2026-09-22, BDS E2E step E): order-level "Sifarişi Tamamla"
-- always 500'd with `FOREACH expression must not be null`.
--
-- Root cause: when p_item_ids is NULL the RPC derives the set as
--   array_agg(id) WHERE kitchen_status NOT IN (ready, completed, ...)
-- but array_agg over an EMPTY set returns NULL (not '{}'). The KDS
-- complete-order button only renders when ALL items are already ready —
-- i.e. exactly the empty-set case — so the button 100% crashed:
--   FOREACH v_item_id IN ARRAY NULL → 500, no orders.kitchen_status update,
--   no audit log, no toast (the 500 was swallowed client-side).
--
-- Fix: coalesce the derived set to an empty array. The loop becomes a
-- no-op (v_already_ready counts the rest), and the existing all-ready
-- check still finalizes orders.kitchen_status='ready' + kitchen_ready_at
-- and writes the mark_ready audit row. Semantics unchanged otherwise;
-- the function body below is the live one with ONLY that guard added.

BEGIN;

CREATE OR REPLACE FUNCTION public.mark_item_ready_atomic(
  p_order_id uuid,
  p_item_ids uuid[] DEFAULT NULL::uuid[],
  p_performed_by uuid DEFAULT NULL::uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item_id uuid;
  v_oi RECORD;
  v_order RECORD;
  v_performer_name TEXT;
  v_now TIMESTAMPTZ := NOW();
  v_marked INT := 0;
  v_skipped INT := 0;
  v_stock_failed INT := 0;
  v_already_ready INT := 0;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('mark_ready:' || p_order_id::text));

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;

  IF v_order.status IN ('paid', 'closed', 'refunded', 'cancelled') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot mark items ready on ' || v_order.status || ' order');
  END IF;

  IF p_performed_by IS NOT NULL THEN
    SELECT name INTO v_performer_name FROM public.staff WHERE id = p_performed_by;
  END IF;

  IF p_item_ids IS NULL THEN
    SELECT array_agg(id) INTO p_item_ids
    FROM public.order_items
    WHERE order_id = p_order_id
      AND kitchen_status NOT IN ('ready', 'completed', 'served', 'cancelled', 'voided');
  END IF;

  -- FIX 2026-09-22: array_agg over an empty set is NULL, not '{}'.
  IF p_item_ids IS NULL THEN
    p_item_ids := ARRAY[]::uuid[];
  END IF;

  FOREACH v_item_id IN ARRAY p_item_ids
  LOOP
    SELECT * INTO v_oi FROM public.order_items WHERE id = v_item_id AND order_id = p_order_id FOR UPDATE;
    IF NOT FOUND THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    IF v_oi.kitchen_status IN ('ready', 'completed', 'served') THEN
      v_already_ready := v_already_ready + 1;
      CONTINUE;
    END IF;

    IF v_oi.kitchen_status NOT IN ('pending', 'accepted', 'sent', 'preparing') THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    BEGIN
      UPDATE public.order_items SET kitchen_status = 'ready', updated_at = v_now WHERE id = v_item_id;
      PERFORM public.consume_stock_for_item(v_item_id, p_order_id, v_oi.product_id, v_oi.quantity, p_performed_by);
      v_marked := v_marked + 1;
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.order_items SET kitchen_status = v_oi.kitchen_status WHERE id = v_item_id;
      v_stock_failed := v_stock_failed + 1;
    END;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM public.order_items
    WHERE order_id = p_order_id AND kitchen_status NOT IN ('ready', 'completed', 'served', 'cancelled', 'voided')
  ) THEN
    UPDATE public.orders SET kitchen_status = 'ready', kitchen_ready_at = v_now WHERE id = p_order_id;
  END IF;

  PERFORM public.log_audit(
    'mark_ready', 'order', p_order_id::text,
    p_performed_by, v_performer_name, NULL,
    jsonb_build_object(
      'marked_ready', v_marked, 'skipped', v_skipped,
      'stock_failed', v_stock_failed, 'already_ready', v_already_ready
    ),
    jsonb_build_object('order_id', p_order_id), NULL
  );

  RETURN jsonb_build_object(
    'success', true, 'action', 'mark_ready',
    'marked_ready', v_marked, 'skipped', v_skipped,
    'stock_failed', v_stock_failed, 'already_ready', v_already_ready,
    'order_id', p_order_id, 'timestamp', v_now
  );
END;
$$;

COMMIT;
