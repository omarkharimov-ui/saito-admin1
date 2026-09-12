-- ============================================================================
-- 20260911000044 — K / K3-6 (ratified 2026-09-12): finalized-order guard on the
--                  4 legacy order-level KDS fns + remove table-lifecycle writes
--
-- DECISION (user, ratified): add a finalized-order guard to all 4 legacy
--   order-level KDS fns (the stock-safe targets G7 preserved):
--     mark_order_ready, prepare_order_items, mark_order_completed,
--     update_order_item_status
--   A paid / cancelled / closed order must NOT be mutated by a KDS action —
--   canonical parity with item_kitchen_step / item_kitchen_terminal, which
--   refuse with ORDER_FINALIZED. K3-3 proved the canonical path refuses; K3-6
--   found these legacy fns still mutated (the double-stock-consumption gap).
--
-- STOCK SEMANTICS PRESERVED: the guard is an EARLY refuse BEFORE any stock
--   logic. For non-finalized orders, mark_order_ready's consume_stock_for_item
--   loop runs EXACTLY as before (not replaced by item_kitchen_step, which does
--   not consume stock). A refused (finalized) order performs NO mutation and NO
--   stock change — consistent with "already consumed, do not touch".
--
-- (b) TABLE-LIFECYCLE SEPARATION (decision A completion, K-boundary):
--   mark_order_ready wrote table_floors.status='ready' and prepare_order_items
--   wrote table_floors.status='in_kitchen' (raw, off-registry, and WITHOUT a
--   location_id filter = F-03 violation). These made the KITCHEN progression
--   redefine the TABLE lifecycle — the exact confusion the ratified principle
--   forbids ("Kitchen READY does not mean the table is SERVED"; table stays
--   occupied through the meal). After L5 (042) the table stays 'occupied' and
--   the floor's kitchen chip is driven by table.kitchen_status (synced by its
--   own trigger). So these stray table.status writes are REMOVED. The ORDER
--   status/kitchen_status flips (valid order-lifecycle states) are KEPT.
--
-- UNCHANGED (frozen K/F guarantees): signature (incl. defaults), SECURITY
--   DEFINER, search_path, ACL, FOR UPDATE locking, permission model (caller
--   enforces kitchen.manage via the G7 route), stock consumption idempotency.
-- ============================================================================

-- ---- 1. mark_order_ready (stock consumption PRESERVED; table write REMOVED) ----
CREATE OR REPLACE FUNCTION public.mark_order_ready(p_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_order RECORD;
  v_oi RECORD;
  v_consumed INTEGER := 0;
  v_failed INTEGER := 0;
BEGIN
  SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'ORDER_NOT_FOUND');
  END IF;

  -- K3-6 (044, 2026-09-12, ratified): finalized-order guard (ORDER_FINALIZED).
  -- A paid/cancelled/closed order is never mutated by a KDS action; no stock
  -- change (it was already consumed at the original ready).
  IF v_order.status IN ('paid','cancelled','closed') THEN
    RETURN jsonb_build_object('success', false, 'error', 'ORDER_FINALIZED',
      'order_id', p_order_id, 'order_status', v_order.status);
  END IF;

  -- Delegate consumption to the canonical writer BEFORE the status flip,
  -- over exactly the READY-boundary transition set (idempotent per item).
  FOR v_oi IN
    SELECT oi.id, oi.product_id, oi.quantity
    FROM order_items oi
    WHERE oi.order_id = p_order_id
      AND oi.kitchen_status IN ('pending', 'preparing', 'cooking', 'accepted')
  LOOP
    BEGIN
      PERFORM public.consume_stock_for_item(v_oi.id, p_order_id, v_oi.product_id, v_oi.quantity);
      v_consumed := v_consumed + 1;
    EXCEPTION WHEN OTHERS THEN
      v_failed := v_failed + 1;
    END;
  END LOOP;

  UPDATE order_items
  SET kitchen_status = 'ready'
  WHERE order_id = p_order_id
    AND kitchen_status IN ('pending', 'preparing', 'cooking', 'accepted');

  UPDATE orders SET
    kitchen_status = 'ready',
    kitchen_ready_at = now(),
    version = COALESCE(version, 0) + 1
  WHERE id = p_order_id;

  IF v_order.order_source = 'delivery' AND COALESCE(v_order.delivery_status, 'pending') IN ('pending', 'confirmed', 'preparing') THEN
    UPDATE orders SET delivery_status = 'ready', updated_at = now() WHERE id = p_order_id;
  END IF;

  IF v_order.order_source = 'takeaway' AND v_order.status IN ('confirmed', 'in_kitchen') THEN
    UPDATE orders SET status = 'ready', updated_at = now() WHERE id = p_order_id;
  END IF;

  IF v_order.order_source = 'dine_in' AND v_order.status IN ('confirmed', 'in_kitchen', 'partially_ready') THEN
    UPDATE orders SET status = 'ready', updated_at = now() WHERE id = p_order_id;
  END IF;

  -- (b) REMOVED: the table status SET 'ready'. The table stays 'occupied'
  --     (decision A); the floor's kitchen chip is driven by table.kitchen_status
  --     (synced by trg_sync_table_kitchen_status), never by table.status.

  RETURN jsonb_build_object(
    'success', true,
    'order_id', p_order_id,
    'status', 'ready',
    'deducted_ingredients', v_consumed,
    'consumed_items', v_consumed,
    'consumption_failed', v_failed
  );
END;
$function$;

-- ---- 2. prepare_order_items (table write REMOVED) ----
CREATE OR REPLACE FUNCTION public.prepare_order_items(p_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_updated INTEGER;
  v_order RECORD;
BEGIN
  SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  -- K3-6 (044): finalized-order guard (ORDER_FINALIZED).
  IF v_order.status IN ('paid','cancelled','closed') THEN
    RETURN jsonb_build_object('success', false, 'error', 'ORDER_FINALIZED',
      'order_id', p_order_id, 'order_status', v_order.status);
  END IF;

  UPDATE order_items
  SET kitchen_status = 'preparing'
  WHERE order_id = p_order_id
    AND kitchen_status IN ('pending', 'accepted', 'reserved');

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated > 0 THEN
    UPDATE orders SET
      kitchen_status = 'preparing',
      kitchen_accepted_at = now()
    WHERE id = p_order_id
      AND kitchen_status IS DISTINCT FROM 'preparing';
  END IF;

  -- (b) REMOVED: the table status SET 'in_kitchen'. The table stays
  --     'occupied' (decision A); kitchen progression is table.kitchen_status.

  RETURN jsonb_build_object('success', true, 'updated_items', v_updated);
END;
$function$;

-- ---- 3. mark_order_completed (finalized guard added) ----
CREATE OR REPLACE FUNCTION public.mark_order_completed(p_order_id uuid, p_performed_by uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_order   record;
  v_updated int := 0;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;

  -- K3-6 (044): finalized-order guard (ORDER_FINALIZED).
  IF v_order.status IN ('paid','cancelled','closed') THEN
    RETURN jsonb_build_object('success', false, 'error', 'ORDER_FINALIZED',
      'order_id', p_order_id, 'order_status', v_order.status);
  END IF;

  UPDATE public.order_items
  SET    kitchen_status = 'completed',
         updated_at = now()
  WHERE  order_id = p_order_id
  AND    kitchen_status IS DISTINCT FROM 'completed'
  AND    kitchen_status NOT IN ('voided','cancelled','wasted');

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  UPDATE public.orders
  SET    kitchen_status = 'completed',
         updated_at = now()
  WHERE  id = p_order_id;

  PERFORM public.log_audit(
    'order_completed', 'order', p_order_id::text, p_performed_by,
    NULL, NULL, NULL,
    jsonb_build_object('items_completed', v_updated),
    NULL
  );

  RETURN jsonb_build_object('success', true, 'items_completed', v_updated);
END;
$function$;

-- ---- 4. update_order_item_status (finalized guard via parent order) ----
CREATE OR REPLACE FUNCTION public.update_order_item_status(p_order_item_id uuid, p_status text, p_prepared_quantity integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_item RECORD;
  v_order_status text;
BEGIN
  SELECT * INTO v_item FROM order_items WHERE id = p_order_item_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_ITEM_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  -- K3-6 (044): finalized-order guard (parent order). An undo/status change on
  --   an item of a paid/cancelled/closed order is refused (ORDER_FINALIZED).
  SELECT status INTO v_order_status FROM orders WHERE id = v_item.order_id;
  IF v_order_status IN ('paid','cancelled','closed') THEN
    RETURN jsonb_build_object('success', false, 'error', 'ORDER_FINALIZED',
      'order_item_id', p_order_item_id, 'order_status', v_order_status);
  END IF;

  UPDATE order_items
  SET
    kitchen_status = p_status,
    prepared_quantity = COALESCE(p_prepared_quantity, prepared_quantity)
  WHERE id = p_order_item_id;

  RETURN jsonb_build_object('success', true, 'order_item_id', p_order_item_id, 'status', p_status);
END;
$function$;

-- ---- ACL: unchanged (preserve existing grants) ----
GRANT EXECUTE ON FUNCTION public.mark_order_ready(uuid) TO service_role, test_rls_role;
GRANT EXECUTE ON FUNCTION public.prepare_order_items(uuid) TO service_role, test_rls_role;
GRANT EXECUTE ON FUNCTION public.mark_order_completed(uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.update_order_item_status(uuid,text,integer) TO service_role, test_rls_role;
REVOKE EXECUTE ON FUNCTION public.mark_order_ready(uuid) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.prepare_order_items(uuid) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.mark_order_completed(uuid,uuid) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.update_order_item_status(uuid,text,integer) FROM anon, authenticated, public;

-- ---- fail-safe: all 4 fns have the guard; ready/prepare no longer write table.status ----
DO $$
BEGIN
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname IN ('mark_order_ready','prepare_order_items','mark_order_completed','update_order_item_status')
        AND p.prosrc ILIKE '%ORDER_FINALIZED%' AND p.prosrc ILIKE '%IN (''paid'',''cancelled'',''closed'')%') <> 4 THEN
    RAISE EXCEPTION 'K3-6 FAIL-SAFE: all 4 legacy KDS fns must carry the ORDER_FINALIZED guard';
  END IF;
  -- (b) the two fns must no longer write the table status at all (decision A:
  --     kitchen progression must not redefine the table lifecycle)
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname IN ('mark_order_ready','prepare_order_items')
        AND p.prosrc ILIKE '%table_floors%') > 0 THEN
    RAISE EXCEPTION 'K3-6 FAIL-SAFE: mark_order_ready/prepare_order_items must not reference table_floors (decision A)';
  END IF;
  -- stock consumption preserved in mark_order_ready
  IF NOT (SELECT bool_and(p.prosrc ILIKE '%consume_stock_for_item%') FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname='mark_order_ready') THEN
    RAISE EXCEPTION 'K3-6 FAIL-SAFE: mark_order_ready must KEEP consume_stock_for_item (stock semantics preserved)';
  END IF;
END $$;
