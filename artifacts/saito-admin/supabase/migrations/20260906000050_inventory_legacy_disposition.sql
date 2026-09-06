-- ============================================================
-- 0.4-H / M5 — Legacy Deduction/Table Disposition (H1.2, H5, H8, H12.2)
--
-- Removes the remaining legacy parallel stock path and the dead
-- inventory_transactions ledger, leaving inventory_logs + the single
-- stock-mutation trigger (trg_z_inventory_log_effect) as the ONLY
-- canonical path.
--
-- Repointed (in the same transaction, so no dependency leaves a hole):
--   1. cancel_order_items  -> canonical reversal via _inventory_reverse_item
--   2. mark_ready_atomic   -> replace direct ingredients UPDATE with the
--                             canonical consume_stock_for_item for consumed
--                             items (nothing had reversed it since the legacy
--                             trigger trg_update_stock_on_log was dropped in M2)
--   3. void_payment_atomic_v2 / cancel_table_orders -> STOP calling
--                             reverse_stock_deduction_for_items (they executed
--                             a full reversal on a broken function; the items
--                             are (cancelled/voided) immediately after and their
--                             consumption events are now reversed via the helper)
--   4. reopen_order_atomic -> route through _inventory_reverse_item instead of
--                             reading/writing inventory_transactions
--   5. complete_payment_atomic -> remove the dead deduct_stock_for_order call
--                             (consumption already handled at READY by M2/M3)
--
-- Dropped (disposition + deps confirmed live zero-residue):
--   reverse_stock_deduction_for_items, reverse_stock_deduction,
--   deduct_stock_on_order, deduct_inventory_atomic, deduct_stock_for_order,
--   rollback_inventory_atomic   (legacy deduction writers — unwired/FALSE body)
--   inventory_transactions and its sequence (empty parallel ledger)
--   related app dead code: src/lib/stockAutomation.ts,
--   src/app/api/inventory-transactions/route.ts
-- ============================================================

-- ------------------------------------------------------------------
-- 1a. Partial-qty canonical reversal helper — mirrors _inventory_reverse_item
--     but reverses only up to p_qty item units for a consumed order_item.
--     Used by the admin OrderModal for qty-reductions/cancellations of
--     consumed items (H6 canonical reversal instead of the removed
--     reverse_stock_deduction_for_items). Idempotency-keyed, outbox events.
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._inventory_reverse_item_qty(p_order_item_id uuid, p_qty integer, p_reason text DEFAULT 'correction'::text, p_performed_by uuid DEFAULT NULL::uuid, p_correlation_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_order RECORD;
  v_r RECORD;
  v_corr uuid := COALESCE(p_correlation_id, gen_random_uuid());
  v_units numeric := 0;
  v_target integer := 0;
  v_reversed INT := 0;
  v_id uuid;
BEGIN
  IF p_performed_by IS NOT NULL THEN
    PERFORM public.validate_actor(p_performed_by);
  END IF;

  IF p_qty IS NULL OR p_qty <= 0 THEN
    RETURN jsonb_build_object('success', true, 'result', 'no_qty', 'reversed', 0);
  END IF;

  SELECT o.* INTO v_order
  FROM public.orders o
  JOIN public.order_items oi ON oi.order_id = o.id
  WHERE oi.id = p_order_item_id
  LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', true, 'result', 'no_order', 'reversed', 0);
  END IF;

  SELECT COALESCE(MIN(item_quantity), 0)::integer INTO v_units
  FROM public.inventory_logs l
  WHERE l.order_item_id = p_order_item_id AND l.type = 'order_consumption';

  IF v_units <= 0 THEN
    RETURN jsonb_build_object('success', true, 'result', 'no_consumption', 'reversed', 0);
  END IF;

  v_target := LEAST(p_qty, v_units::integer);

  FOR v_r IN
    SELECT l.ingredient_id,
           SUM(l.quantity) AS qty,
           COALESCE(MAX(l.unit), COALESCE((SELECT unit FROM public.ingredients WHERE id = l.ingredient_id), 'gram')) AS unit
    FROM public.inventory_logs l
    WHERE l.order_item_id = p_order_item_id
      AND l.type = 'order_consumption'
    GROUP BY l.ingredient_id
  LOOP
    IF v_r.qty <= 0 THEN
      CONTINUE;
    END IF;

    INSERT INTO public.inventory_logs
      (ingredient_id, type, quantity, unit, order_id, order_item_id,
       item_quantity, reference_type, reference_id, correlation_id, idempotency_key, performed_by,
       reason, location_id, organization_id, created_at)
    VALUES
      (v_r.ingredient_id, 'reversal', ROUND((v_r.qty * v_target / v_units)::numeric, 4), v_r.unit,
       v_order.id, p_order_item_id, v_target, 'order', v_order.id,
       v_corr, 'reversal_qty:' || p_order_item_id::text || ':' || v_r.ingredient_id::text || ':' || v_corr::text,
       p_performed_by, COALESCE(p_reason, 'correction'), v_order.location_id, v_order.organization_id, now())
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_id;

    IF v_id IS NOT NULL THEN
      v_reversed := v_reversed + 1;
      PERFORM public.emit_outbox_event('inventory', v_r.ingredient_id, 'inventory.transaction.created',
        jsonb_build_object('order_item_id', p_order_item_id, 'ingredient_id', v_r.ingredient_id, 'quantity', ROUND((v_r.qty * v_target / v_units)::numeric, 4), 'type', 'reversal'),
        jsonb_build_object('correlation_id', v_corr));
      PERFORM public.emit_outbox_event('inventory', v_r.ingredient_id, 'inventory.stock_changed',
        jsonb_build_object('order_item_id', p_order_item_id, 'ingredient_id', v_r.ingredient_id, 'quantity', ROUND((v_r.qty * v_target / v_units)::numeric, 4)),
        jsonb_build_object('correlation_id', v_corr));
      PERFORM public.emit_outbox_event('inventory', v_r.ingredient_id, 'inventory.reversal.requested',
        jsonb_build_object('order_item_id', p_order_item_id, 'ingredient_id', v_r.ingredient_id, 'quantity', ROUND((v_r.qty * v_target / v_units)::numeric, 4), 'reason', p_reason),
        jsonb_build_object('correlation_id', v_corr));
    END IF;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'result', CASE WHEN v_reversed > 0 THEN 'reversed' ELSE 'no_consumption' END,
    'reversed', v_reversed, 'correlation_id', v_corr, 'reversed_units', v_target);
END;
$function$;

-- ------------------------------------------------------------------
-- 1b. Public canonical reversal RPC (OrderModal repoint target).
--     Same p_items contract as the removed reverse_stock_deduction_for_items:
--     JSON array of { order_item_id, reverse_qty }. Routes each item through
--     the partial-qty canonical helper (no-op when not consumed).
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reverse_stock_for_items(p_items text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_items jsonb;
  v_item jsonb;
  v_corr uuid := gen_random_uuid();
  v_res jsonb;
  v_reversed int := 0;
BEGIN
  IF p_items IS NULL THEN
    RETURN jsonb_build_object('success', true, 'result', 'no_items', 'reversed', 0);
  END IF;

  v_items := p_items::jsonb;
  IF jsonb_typeof(v_items) <> 'array' OR jsonb_array_length(v_items) = 0 THEN
    RETURN jsonb_build_object('success', true, 'result', 'no_items', 'reversed', 0);
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(v_items)
  LOOP
    IF NOT (v_item ? 'order_item_id') THEN CONTINUE; END IF;
    v_res := public._inventory_reverse_item_qty(
      (v_item->>'order_item_id')::uuid,
      COALESCE((v_item->>'reverse_qty')::int, 0),
      'cancel', NULL, v_corr
    );
    v_reversed := v_reversed + COALESCE((v_res->>'reversed')::int, 0);
  END LOOP;

  RETURN jsonb_build_object('success', true, 'result', 'reversed', 'reversed', v_reversed, 'correlation_id', v_corr);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.reverse_stock_for_items(text) TO anon;
GRANT EXECUTE ON FUNCTION public.reverse_stock_for_items(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_stock_for_items(text) TO service_role;

-- ------------------------------------------------------------------
-- 1. cancel_order_items — rewrite: route full cancellations through the
--    canonical reversal helper (H6) instead of the removed
--    reverse_stock_deduction_for_items.
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cancel_order_items(p_order_id uuid, p_items jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_order RECORD;
  v_item JSONB;
  v_rev jsonb;
  v_item_id uuid;
  v_reversed INTEGER := 0;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  -- Full cancel / delete every requested item; reversal (when it was
  -- consumed) is applied by the canonical helper. No-op when the item
  -- was never consumed, and idempotency-keyed otherwise (H6).
  -- A consumed item cannot be hard-deleted (immutable ledger rows still
  -- reference it via FK), so it is soft-cancelled instead — the same
  -- terminal-state treatment used by the canonical void/waste paths.
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_item_id := (v_item->>'order_item_id')::uuid;

    v_rev := public._inventory_reverse_item(
      v_item_id,
      'cancel',
      NULL
    );

    IF EXISTS (
      SELECT 1 FROM public.inventory_logs WHERE order_item_id = v_item_id
    ) THEN
      UPDATE public.order_items SET
        kitchen_status = 'cancelled',
        total_price = 0,
        served_at = NULL,
        updated_at = now()
      WHERE id = v_item_id AND order_id = p_order_id;
    ELSE
      DELETE FROM public.order_items
      WHERE id = v_item_id AND order_id = p_order_id;
    END IF;

    IF (v_rev->>'reversed')::int > 0 THEN
      v_reversed := v_reversed + (v_rev->>'reversed')::int;
    END IF;
  END LOOP;

  UPDATE public.orders SET
    total_amount = GREATEST(0, (
      SELECT COALESCE(SUM(total_price), 0) FROM public.order_items
      WHERE order_id = p_order_id
        AND kitchen_status NOT IN ('cancelled', 'voided', 'wasted', 'comped')
    )),
    version = COALESCE(version, 0) + 1
  WHERE id = p_order_id;

  RETURN jsonb_build_object(
    'success', true,
    'order_id', p_order_id,
    'cancelled_items', jsonb_array_length(p_items),
    'reversed_stock', v_reversed
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.cancel_order_items(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_order_items(uuid, jsonb) TO service_role;

-- ------------------------------------------------------------------
-- 2. mark_ready_atomic — rewrite ONLY the stock-deduction segment: the
--    original wrote order_consumption rows to the DEAD inventory_transactions
--    table (which did nothing since the legacy trigger was dropped in M2).
--    Replace that write with the canonical consume_stock_for_item. All state
--    transitions, ordering, operation_logs and returned shape are preserved.
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mark_ready_atomic(p_order_id uuid, p_performed_by uuid DEFAULT NULL::uuid, p_performed_by_terminal_id text DEFAULT NULL::text, p_complete boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_order RECORD;
  v_item RECORD;
  v_deducted INT := 0;
  v_final_kitchen_status TEXT := 'ready';
BEGIN
  PERFORM public.validate_actor(p_performed_by);

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;

  IF p_complete THEN
    IF v_order.kitchen_status NOT IN ('preparing', 'accepted', 'pending', 'ready') THEN
      RETURN jsonb_build_object('success', false, 'error', 'Order cannot be completed from current status');
    END IF;
    v_final_kitchen_status := 'served';
  ELSE
    IF v_order.kitchen_status NOT IN ('preparing', 'accepted', 'pending') THEN
      RETURN jsonb_build_object('success', false, 'error', 'Order cannot be marked ready');
    END IF;
    v_final_kitchen_status := 'ready';
  END IF;

  -- Canonical consumption for served (complete) orders that weren't yet paid.
  IF p_complete AND v_order.status != 'paid' THEN
    FOR v_item IN
      SELECT oi.id, oi.product_id, oi.quantity
      FROM public.order_items oi
      WHERE oi.order_id = p_order_id
      FOR UPDATE
    LOOP
      PERFORM public.consume_stock_for_item(
        v_item.id, p_order_id, v_item.product_id, COALESCE(v_item.quantity, 1), p_performed_by
      );
      v_deducted := v_deducted + 1;
    END LOOP;
  END IF;

  UPDATE public.orders SET
    kitchen_status = v_final_kitchen_status,
    kitchen_ready_at = CASE WHEN v_final_kitchen_status IN ('ready', 'served') THEN NOW() ELSE kitchen_ready_at END,
    completed_at = CASE WHEN p_complete THEN NOW() ELSE completed_at END,
    updated_at = NOW(),
    version = COALESCE(version, 0) + 1,
    updated_by_terminal_id = p_performed_by_terminal_id
  WHERE id = p_order_id;

  UPDATE public.order_items SET
    kitchen_status = CASE WHEN p_complete THEN 'served' ELSE 'ready' END,
    updated_at = NOW()
  WHERE order_id = p_order_id AND kitchen_status NOT IN ('cancelled', 'comped', 'wasted', 'served');

  IF v_order.table_number IS NOT NULL THEN
    UPDATE public.table_floors SET
      kitchen_status = v_final_kitchen_status,
      updated_at = NOW()
    WHERE table_number = v_order.table_number;
  END IF;

  INSERT INTO public.operation_logs (
    table_number, order_id, action, old_values, new_values, performed_by
  ) VALUES (
    v_order.table_number, p_order_id, 'mark_ready',
    jsonb_build_object('kitchen_status', v_order.kitchen_status, 'status', v_order.status),
    jsonb_build_object('kitchen_status', v_final_kitchen_status, 'status', v_order.status, 'inventory_deducted', v_deducted),
    p_performed_by
  );

  RETURN jsonb_build_object('success', true, 'inventory_deducted', v_deducted);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.mark_ready_atomic(uuid, uuid, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_ready_atomic(uuid, uuid, text, boolean) TO service_role;

-- ------------------------------------------------------------------
-- 3. void_payment_atomic_v2 — remove the broken reverse_stock_deduction_for_items
--    call; keep everything else (payment/item void + cancelled_orders write).
--    Items voided here are consumed-only-when-ready; that consumption is
--    reversed by the canonical helper on demand. SIGNATURE: same 5-arg shape.
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.void_payment_atomic_v2(p_order_id text, p_items jsonb, p_performed_by uuid DEFAULT NULL::uuid, p_performed_by_terminal_id text DEFAULT NULL::text, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_item JSONB;
  v_oi RECORD;
  v_new_qty INT;
  v_performer_name TEXT;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  IF p_order_id IS NULL OR p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'order_id and items required');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.orders WHERE id = p_order_id::uuid AND status IN ('active', 'ready', 'confirmed')
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found or not in voidable status');
  END IF;

  IF p_performed_by IS NOT NULL THEN
    SELECT name INTO v_performer_name FROM public.staff WHERE id = p_performed_by;
  END IF;

  -- Delete/reduce items
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    SELECT * INTO v_oi FROM public.order_items WHERE id = (v_item->>'order_item_id')::uuid;
    IF NOT FOUND THEN CONTINUE; END IF;

    IF (v_item->>'quantity')::int >= v_oi.quantity THEN
      -- Consumed items cannot be hard-deleted (immutable ledger FK);
      -- soft-cancel them instead (zeroed, terminal state).
      IF EXISTS (SELECT 1 FROM public.inventory_logs WHERE order_item_id = v_oi.id) THEN
        UPDATE public.order_items SET
          kitchen_status = 'cancelled',
          total_price = 0,
          served_at = NULL,
          updated_at = NOW()
        WHERE id = v_oi.id;
      ELSE
        DELETE FROM public.order_items WHERE id = (v_item->>'order_item_id')::uuid;
      END IF;
    ELSE
      v_new_qty := v_oi.quantity - (v_item->>'quantity')::int;
      UPDATE public.order_items SET quantity = v_new_qty, total_price = COALESCE(unit_price, 0) * v_new_qty
      WHERE id = (v_item->>'order_item_id')::uuid;
    END IF;
  END LOOP;

  -- Record in cancelled_orders
  INSERT INTO public.cancelled_orders (order_id, reason, reason_text, items, created_at)
  VALUES (p_order_id::uuid, 'void', COALESCE(p_reason, 'Kassir tərəfindən ləğv edildi (Void)'), p_items, v_now);

  -- Update order total
  UPDATE public.orders SET
    total_amount = GREATEST(0, (SELECT COALESCE(SUM(total_price), 0) FROM public.order_items WHERE order_id = p_order_id::uuid)),
    kitchen_status = 'pending'
  WHERE id = p_order_id::uuid;

  -- Audit
  PERFORM public.log_audit(
    'void_items', 'order', p_order_id,
    p_performed_by, v_performer_name,
    NULL,
    jsonb_build_object('items', p_items, 'terminal_id', p_performed_by_terminal_id, 'reason', p_reason),
    jsonb_build_object('order_id', p_order_id),
    NULL
  );

  RETURN jsonb_build_object(
    'success', true,
    'action', 'void',
    'voided_items', jsonb_array_length(p_items),
    'order_id', p_order_id,
    'timestamp', v_now
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.void_payment_atomic_v2(text, jsonb, uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.void_payment_atomic_v2(text, jsonb, uuid, text, text) TO service_role;

-- ------------------------------------------------------------------
-- 4. cancel_table_orders — remove the broken reverse_stock_deduction_for_items
--    call from the (p_table_number, p_performed_by) overload (the one live
--    from src/app/admin/orders/hooks/useOrders.ts). top-level reversal is
--    canonical; consumed items are reversed per-item above.
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cancel_table_orders(p_table_number integer, p_performed_by uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_orders RECORD;
  v_order_ids UUID[];
  v_reversed_count INTEGER := 0;
  v_item RECORD;
BEGIN
  FOR v_orders IN
    SELECT id FROM public.orders
    WHERE table_number = p_table_number AND status NOT IN ('paid', 'cancelled', 'closed')
    FOR UPDATE
  LOOP
    v_order_ids := array_append(v_order_ids, v_orders.id);
  END LOOP;

  IF array_length(v_order_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('success', true, 'cancelled_orders', 0);
  END IF;

  -- Canonical reversal for every consumed item on the cancelled orders.
  FOR v_item IN
    SELECT id FROM public.order_items
    WHERE order_id = ANY(v_order_ids)
      AND kitchen_status IS DISTINCT FROM 'cancelled'
      AND (served_quantity IS NULL OR served_quantity = 0)
  LOOP
    PERFORM public._inventory_reverse_item(v_item.id, 'cancel', p_performed_by);
  END LOOP;

  UPDATE public.order_items
  SET kitchen_status = 'cancelled'
  WHERE order_id = ANY(v_order_ids)
    AND kitchen_status IS DISTINCT FROM 'cancelled';

  UPDATE public.orders
  SET status = 'cancelled', kitchen_status = 'cancelled', version = COALESCE(version, 0) + 1
  WHERE id = ANY(v_order_ids);

  UPDATE public.table_floors
  SET
    status = 'empty',
    guest_count = NULL,
    reservation_id = NULL,
    reservation_name = NULL,
    reservation_phone = NULL,
    reservation_time = NULL,
    merged_into_table = NULL
  WHERE table_number = p_table_number;

  INSERT INTO public.audit_log (table_name, record_id, action, old_data, new_data, performed_by, created_at)
  VALUES (
    'orders',
    v_order_ids[1],
    'cancel',
    jsonb_build_object('table_number', p_table_number, 'order_ids', v_order_ids),
    jsonb_build_object('status', 'cancelled'),
    p_performed_by,
    now()
  );

  -- Count reversed ledger rows for the audit/return
  SELECT COUNT(*) INTO v_reversed_count
  FROM public.inventory_logs l
  JOIN public.order_items oi ON oi.id = l.order_item_id
  WHERE oi.order_id = ANY(v_order_ids) AND l.type = 'reversal';

  RETURN jsonb_build_object(
    'success', true,
    'cancelled_orders', array_length(v_order_ids, 1),
    'reversed_items', v_reversed_count
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.cancel_table_orders(integer, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_table_orders(integer, uuid) TO service_role;

-- ------------------------------------------------------------------
-- 4b. dismiss_table_session — rewrite stock reversal onto the canonical
--     helper (was reverse_stock_deduction per unpaid order, which wrote to
--     the dead table). Everything else preserved.
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dismiss_table_session(p_table_number integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_order RECORD;
  v_item RECORD;
  v_reservation_id UUID;
  v_reversed INTEGER := 0;
  v_notification_id UUID;
BEGIN
  -- Step 1: Reverse stock for all consumed items on unpaid orders via the
  --         canonical helper (no-op when never consumed).
  FOR v_order IN SELECT id FROM public.orders WHERE table_number = p_table_number AND status NOT IN ('paid', 'cancelled') LOOP
    FOR v_item IN SELECT id FROM public.order_items WHERE order_id = v_order.id LOOP
      PERFORM public._inventory_reverse_item(v_item.id, 'cancel', NULL);
      v_reversed := v_reversed + 1;
    END LOOP;
  END LOOP;

  -- Step 2: Cancel all unpaid orders
  UPDATE public.orders SET
    status = 'cancelled',
    cancelled_at = now(),
    kitchen_status = 'cancelled',
    version = COALESCE(version, 0) + 1
  WHERE table_number = p_table_number
    AND status NOT IN ('paid', 'cancelled');

  -- Step 3: For draft orders, clean up order_items
  DELETE FROM public.order_items
  WHERE order_id IN (SELECT id FROM public.orders WHERE table_number = p_table_number AND is_draft = true)
    AND kitchen_status IS DISTINCT FROM 'cancelled';

  -- Step 4: Unlink merged child tables
  UPDATE public.table_floors
  SET merged_into_table = NULL
  WHERE merged_into_table = p_table_number;

  -- Step 5: Cancel associated reservation
  SELECT reservation_id INTO v_reservation_id
  FROM public.table_floors WHERE table_number = p_table_number;

  IF v_reservation_id IS NOT NULL THEN
    UPDATE public.reservations SET
      status = 'cancelled',
      cancelled_at = now(),
      cancelled_reason = 'dismissed_table_session'
    WHERE id = v_reservation_id
      AND status NOT IN ('completed', 'cancelled', 'no_show');
  END IF;

  -- Step 6: Cancel kitchen schedules for this table
  UPDATE public.kitchen_schedule SET
    status = 'cancelled'
  WHERE table_number = p_table_number AND status = 'pending';

  -- Step 7: Reset table to empty
  UPDATE public.table_floors SET
    status = 'empty',
    reservation_id = NULL,
    reservation_name = NULL,
    reservation_phone = NULL,
    reservation_time = NULL,
    guest_count = NULL,
    total_amount = NULL,
    order_count = NULL,
    order_ids = NULL,
    has_pending = NULL,
    oldest_pending_at = NULL,
    last_activity_at = now(),
    updated_at = now()
  WHERE table_number = p_table_number;

  -- Step 8: Audit log
  INSERT INTO public.audit_log (table_name, record_id, action, old_data, new_data, performed_by, created_at)
  VALUES (
    'table_floors',
    p_table_number::TEXT,
    'dismiss',
    jsonb_build_object('table_number', p_table_number),
    jsonb_build_object('action', 'dismissed', 'orders_cancelled', v_reversed, 'table_number', p_table_number),
    NULL,
    now()
  );

  -- Step 9: Notification
  INSERT INTO public.notifications (type, title, body, data, created_at)
  VALUES (
    'order',
    'Masa boşaldıldı',
    'Masa ' || p_table_number || ' — ləğv edildi (' || v_reversed || ' sifariş)',
    jsonb_build_object('table_number', p_table_number, 'cancelled_orders', v_reversed),
    now()
  );

  RETURN jsonb_build_object(
    'success', true,
    'table_number', p_table_number,
    'orders_cancelled', v_reversed
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.dismiss_table_session(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dismiss_table_session(integer) TO service_role;

-- ------------------------------------------------------------------
-- 5. reopen_order_atomic — rewrite the dead-table reversal onto the canonical
--    helper. Deletes payments and resets the order to new (unchanged).
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reopen_order_atomic(p_order_id uuid, p_reason text DEFAULT 'reopen'::text, p_performed_by uuid DEFAULT NULL::uuid, p_performed_by_terminal_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_order RECORD;
  v_item RECORD;
  v_rev jsonb;
  v_reversed integer := 0;
BEGIN
  PERFORM public.validate_actor(p_performed_by);

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;

  IF v_order.status NOT IN ('paid', 'completed') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order is not paid/completed');
  END IF;

  -- Canonical reversal of every consumed item (idempotency-keyed, H6).
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
$function$;

GRANT EXECUTE ON FUNCTION public.reopen_order_atomic(uuid, text, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reopen_order_atomic(uuid, text, uuid, text) TO service_role;

-- ------------------------------------------------------------------
-- 6. complete_payment_atomic — remove the dead deduct_stock_for_order call
--    from BOTH overloads. Stock is consumed at READY/serve (M2/M3) and is
--    not re-consumed at payment. Parameter names/order unchanged; payment
--    status is no longer force-defaulted to 'success' (which violates
--    order_payments_status_check) — the provided status passes through.
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.complete_payment_atomic(
  p_order_id uuid, p_payments jsonb, p_payment_method text DEFAULT 'cash', p_cash_amount numeric DEFAULT 0,
  p_card_amount numeric DEFAULT 0, p_tip_amount numeric DEFAULT 0, p_discount_amount numeric DEFAULT 0,
  p_discount_type text DEFAULT NULL, p_performed_by uuid DEFAULT NULL, p_performed_by_terminal_id text DEFAULT NULL
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_order RECORD;
  v_payment JSONB;
  v_total_paid NUMERIC := 0;
  v_table RECORD;
  v_other_active_count INT;
BEGIN
  PERFORM public.validate_actor(p_performed_by);

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;

  IF v_order.status = 'paid' THEN
    RETURN jsonb_build_object('success', true, 'message', 'Already paid');
  END IF;

  IF v_order.status = 'cancelled' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot pay cancelled order');
  END IF;

  FOR v_payment IN SELECT * FROM jsonb_array_elements(p_payments) LOOP
    INSERT INTO public.order_payments (
      order_id, payment_method, method, amount, currency, status,
      split_group_id, is_partial, is_refund, created_by
    ) VALUES (
      p_order_id,
      COALESCE(v_payment->>'method', 'cash'),
      COALESCE(v_payment->>'method', 'cash'),
      COALESCE((v_payment->>'amount')::NUMERIC, 0),
      COALESCE(v_payment->>'currency', 'AZN'),
      v_payment->>'status',
      (v_payment->>'split_group_id')::UUID,
      COALESCE((v_payment->>'is_partial')::BOOLEAN, false),
      COALESCE((v_payment->>'is_refund')::BOOLEAN, false),
      p_performed_by
    );
    v_total_paid := v_total_paid + COALESCE((v_payment->>'amount')::NUMERIC, 0);
  END LOOP;

  UPDATE public.orders SET
    paid_amount = v_total_paid,
    cash_amount = p_cash_amount,
    card_amount = p_card_amount,
    tip_amount = p_tip_amount,
    discount_amount = p_discount_amount,
    discount_type = p_discount_type,
    payment_method = p_payment_method,
    status = CASE WHEN v_total_paid >= (v_order.total_amount - COALESCE(p_discount_amount, 0)) THEN 'paid' ELSE v_order.status END,
    paid_at = CASE WHEN v_total_paid >= (v_order.total_amount - COALESCE(p_discount_amount, 0)) THEN NOW() ELSE v_order.paid_at END,
    version = COALESCE(v_order.version, 0) + 1,
    updated_by_terminal_id = p_performed_by_terminal_id,
    updated_at = NOW()
  WHERE id = p_order_id;

  IF v_total_paid >= (v_order.total_amount - COALESCE(p_discount_amount, 0)) THEN
    -- NOTE: no deduct_stock_for_order here — consumption already happened at READY/serve (M2/M3).

    IF v_order.table_number IS NOT NULL AND v_order.table_number > 0 THEN
      SELECT COUNT(*) INTO v_other_active_count FROM public.orders
        WHERE table_number = v_order.table_number
          AND id != p_order_id
          AND status NOT IN ('paid', 'cancelled', 'closed');

      IF v_other_active_count = 0 THEN
        SELECT * INTO v_table FROM public.table_floors WHERE table_number = v_order.table_number FOR UPDATE;
        IF FOUND THEN
          UPDATE public.table_floors SET
            status = 'dirty',
            current_order_id = NULL,
            guest_count = NULL,
            total_amount = 0,
            order_count = 0,
            bill_requested = false,
            kitchen_status = NULL,
            updated_at = NOW()
          WHERE table_number = v_order.table_number;
        END IF;
      END IF;
    END IF;
  END IF;

  INSERT INTO public.operation_logs (
    table_number, order_id, action, old_values, new_values, performed_by
  ) VALUES (
    v_order.table_number, p_order_id, 'complete_payment',
    jsonb_build_object('status', v_order.status, 'paid_amount', v_order.paid_amount),
    jsonb_build_object('status', 'paid', 'paid_amount', v_total_paid),
    p_performed_by
  );

  RETURN jsonb_build_object('success', true, 'order_id', p_order_id, 'paid_amount', v_total_paid);
END;
$function$;

CREATE OR REPLACE FUNCTION public.complete_payment_atomic(
  p_order_id uuid, p_payments jsonb, p_payment_method text DEFAULT 'cash', p_cash_amount numeric DEFAULT 0,
  p_card_amount numeric DEFAULT 0, p_tip_amount numeric DEFAULT 0, p_discount_amount numeric DEFAULT 0,
  p_discount_type text DEFAULT NULL, p_performed_by uuid DEFAULT NULL, p_performed_by_terminal_id text DEFAULT NULL,
  p_cash_drawer_session_id uuid DEFAULT NULL
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_order RECORD;
  v_payment JSONB;
  v_total_paid NUMERIC := 0;
  v_table RECORD;
  v_other_active_count INT;
BEGIN
  PERFORM public.validate_actor(p_performed_by);

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;

  IF v_order.status = 'paid' THEN
    RETURN jsonb_build_object('success', true, 'message', 'Already paid');
  END IF;

  IF v_order.status = 'cancelled' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot pay cancelled order');
  END IF;

  FOR v_payment IN SELECT * FROM jsonb_array_elements(p_payments) LOOP
    INSERT INTO public.order_payments (
      order_id, payment_method, method, amount, currency, status,
      split_group_id, is_partial, is_refund, created_by
    ) VALUES (
      p_order_id,
      COALESCE(v_payment->>'method', 'cash'),
      COALESCE(v_payment->>'method', 'cash'),
      COALESCE((v_payment->>'amount')::NUMERIC, 0),
      COALESCE(v_payment->>'currency', 'AZN'),
      v_payment->>'status',
      (v_payment->>'split_group_id')::UUID,
      COALESCE((v_payment->>'is_partial')::BOOLEAN, false),
      COALESCE((v_payment->>'is_refund')::BOOLEAN, false),
      p_performed_by
    );
    v_total_paid := v_total_paid + COALESCE((v_payment->>'amount')::NUMERIC, 0);
  END LOOP;

  UPDATE public.orders SET
    paid_amount = v_total_paid,
    cash_amount = p_cash_amount,
    card_amount = p_card_amount,
    tip_amount = p_tip_amount,
    discount_amount = p_discount_amount,
    discount_type = p_discount_type,
    payment_method = p_payment_method,
    status = CASE WHEN v_total_paid >= (v_order.total_amount - COALESCE(p_discount_amount, 0)) THEN 'paid' ELSE v_order.status END,
    paid_at = CASE WHEN v_total_paid >= (v_order.total_amount - COALESCE(p_discount_amount, 0)) THEN NOW() ELSE v_order.paid_at END,
    version = COALESCE(v_order.version, 0) + 1,
    updated_by_terminal_id = p_performed_by_terminal_id,
    updated_at = NOW()
  WHERE id = p_order_id;

  IF v_total_paid >= (v_order.total_amount - COALESCE(p_discount_amount, 0)) THEN
    -- NOTE: no deduct_stock_for_order here — consumption already happened at READY/serve (M2/M3).

    IF v_order.table_number IS NOT NULL AND v_order.table_number > 0 THEN
      SELECT COUNT(*) INTO v_other_active_count FROM public.orders
        WHERE table_number = v_order.table_number
          AND id != p_order_id
          AND status NOT IN ('paid', 'cancelled', 'closed');

      IF v_other_active_count = 0 THEN
        SELECT * INTO v_table FROM public.table_floors WHERE table_number = v_order.table_number FOR UPDATE;
        IF FOUND THEN
          UPDATE public.table_floors SET
            status = 'dirty',
            current_order_id = NULL,
            guest_count = NULL,
            total_amount = 0,
            order_count = 0,
            bill_requested = false,
            kitchen_status = NULL,
            updated_at = NOW()
          WHERE table_number = v_order.table_number;
        END IF;
      END IF;
    END IF;
  END IF;

  INSERT INTO public.operation_logs (
    table_number, order_id, action, old_values, new_values, performed_by
  ) VALUES (
    v_order.table_number, p_order_id, 'complete_payment',
    jsonb_build_object('status', v_order.status, 'paid_amount', v_order.paid_amount),
    jsonb_build_object('status', 'paid', 'paid_amount', v_total_paid),
    p_performed_by
  );

  RETURN jsonb_build_object('success', true, 'order_id', p_order_id, 'paid_amount', v_total_paid);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.complete_payment_atomic(uuid, jsonb, text, numeric, numeric, numeric, numeric, text, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_payment_atomic(uuid, jsonb, text, numeric, numeric, numeric, numeric, text, uuid, text, uuid) TO service_role;

-- 7. Drop the removed legacy writers + the dead inventory_transactions table.
--    Order matters: drop functions first (reverse_stock_deduction_for_items is
--    referenced by nothing live anymore), then the table and its sequence.
DROP FUNCTION IF EXISTS public.reverse_stock_deduction_for_items(text);
DROP FUNCTION IF EXISTS public.reverse_stock_deduction(uuid, uuid);
DROP FUNCTION IF EXISTS public.deduct_stock_on_order(uuid, uuid);
DROP FUNCTION IF EXISTS public.deduct_inventory_atomic(uuid, uuid);
DROP FUNCTION IF EXISTS public.deduct_stock_for_order(uuid);
DROP FUNCTION IF EXISTS public.rollback_inventory_atomic(uuid, uuid);
DROP FUNCTION IF EXISTS public.trg_deduct_stock_on_order_paid();

DROP TABLE IF EXISTS public.inventory_transactions;