-- ============================================================
-- 0.4-H / M3 — Canonical READY Consumption (H2–H4)
--
-- consume_stock_for_item becomes the EXCLUSIVE consumption writer.
-- Idempotency moves from "check then insert" to deterministic
-- idempotency_keys + advisory-lock + ON CONFLICT DO NOTHING.
-- mark_order_ready (KDS) delegates per-item to the canonical writer
-- in the same transaction (order/status/table side-effects verbatim).
-- mark_item_ready_atomic (admin) gains an order-level advisory lock
-- so concurrent KDS+admin mark-ready serialize to ONE effect.
--
-- Legacy-order-level consumptions (order_item_id NULL, 376 rows) are
-- never converted; their NULL idempotency_key rows simply co-exist.
-- The legacy guard (EXISTS on order_item_id) is kept UNDER the advisory
-- lock so the 21 pre-0.4-H item-level rows cannot double-consume.
-- ============================================================

DROP FUNCTION IF EXISTS public.consume_stock_for_item(uuid, uuid, uuid, integer);

CREATE OR REPLACE FUNCTION public.consume_stock_for_item(p_order_item_id uuid, p_order_id uuid, p_product_id uuid, p_quantity integer, p_performed_by uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_prod RECORD;
  v_rec RECORD;
  v_key text;
  v_corr uuid := gen_random_uuid();
  v_qty numeric;
  v_unit text;
  v_ingredient_id uuid;
  v_id uuid;
  v_order_loc uuid;
  v_order_org uuid;
BEGIN
  IF p_performed_by IS NOT NULL THEN
    PERFORM public.validate_actor(p_performed_by);
  END IF;

  -- H4.2: serialize concurrent same-item consumptions (KDS + admin path).
  PERFORM pg_advisory_xact_lock(hashtext('consume:' || p_order_item_id::text));

  -- Location/org must mirror the order (enforce_inventory_log_order_location).
  SELECT location_id, organization_id INTO v_order_loc, v_order_org
  FROM public.orders WHERE id = p_order_id;

  -- Legacy guard under the lock: item already consumed (any shape — pre-H
  -- rows have NULL idempotency_key, so the unique index cannot dedupe them).
  IF EXISTS (
    SELECT 1 FROM public.inventory_logs
    WHERE order_item_id = p_order_item_id AND type = 'order_consumption'
  ) THEN
    RETURN;
  END IF;

  SELECT * INTO v_prod FROM public.products WHERE id = p_product_id;
  IF NOT FOUND THEN RETURN; END IF;

  -- Ready product: one row, qty = item qty, key per ingredient.
  IF v_prod.is_ready_product AND v_prod.direct_ingredient_id IS NOT NULL THEN
    v_ingredient_id := v_prod.direct_ingredient_id;
    SELECT COALESCE(unit, 'gram') INTO v_unit FROM public.ingredients WHERE id = v_ingredient_id;
    v_key := 'consume:' || p_order_item_id::text || ':' || v_ingredient_id::text;

    INSERT INTO public.inventory_logs
      (ingredient_id, type, quantity, unit, order_id, order_item_id, item_quantity,
       reference_type, reference_id, correlation_id, idempotency_key, performed_by, reason,
       location_id, organization_id)
    VALUES
      (v_ingredient_id, 'order_consumption', p_quantity, v_unit,
       p_order_id, p_order_item_id, p_quantity, 'order', p_order_id, v_corr, v_key, p_performed_by,
       'Hazır məhsul satışı', v_order_loc, v_order_org)
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_id;

    IF v_id IS NOT NULL THEN
      PERFORM public.emit_outbox_event('inventory', v_ingredient_id, 'inventory.transaction.created',
        jsonb_build_object('order_item_id', p_order_item_id, 'ingredient_id', v_ingredient_id, 'quantity', p_quantity, 'type', 'order_consumption'),
        jsonb_build_object('correlation_id', v_corr));
      PERFORM public.emit_outbox_event('inventory', v_ingredient_id, 'inventory.stock_changed',
        jsonb_build_object('order_item_id', p_order_item_id, 'ingredient_id', v_ingredient_id, 'quantity', p_quantity),
        jsonb_build_object('correlation_id', v_corr));
    END IF;
    RETURN;
  END IF;

  -- Recipe product: one row per (item, ingredient); H3 math:
  --   ingredient consumption = COALESCE(quantity_brutto, quantity_required) x item qty
  FOR v_rec IN
    SELECT r.ingredient_id,
           COALESCE(r.quantity_brutto, r.quantity_required) AS qty,
           COALESCE(i.unit, 'gram') AS unit
    FROM public.recipes r
    JOIN public.ingredients i ON i.id = r.ingredient_id
    WHERE r.menu_item_id = p_product_id AND r.is_ai_suggested = false
  LOOP
    v_qty := v_rec.qty * p_quantity;
    v_key := 'consume:' || p_order_item_id::text || ':' || v_rec.ingredient_id::text;

    INSERT INTO public.inventory_logs
      (ingredient_id, type, quantity, unit, order_id, order_item_id, item_quantity,
       reference_type, reference_id, correlation_id, idempotency_key, performed_by, reason,
       location_id, organization_id)
    VALUES
      (v_rec.ingredient_id, 'order_consumption', v_qty, v_rec.unit,
       p_order_id, p_order_item_id, p_quantity, 'order', p_order_id, v_corr, v_key, p_performed_by,
       'Reseptli satış', v_order_loc, v_order_org)
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_id;

    IF v_id IS NOT NULL THEN
      PERFORM public.emit_outbox_event('inventory', v_rec.ingredient_id, 'inventory.transaction.created',
        jsonb_build_object('order_item_id', p_order_item_id, 'ingredient_id', v_rec.ingredient_id, 'quantity', v_qty, 'type', 'order_consumption'),
        jsonb_build_object('correlation_id', v_corr));
      PERFORM public.emit_outbox_event('inventory', v_rec.ingredient_id, 'inventory.stock_changed',
        jsonb_build_object('order_item_id', p_order_item_id, 'ingredient_id', v_rec.ingredient_id, 'quantity', v_qty),
        jsonb_build_object('correlation_id', v_corr));
    END IF;
  END LOOP;
END;
$function$;

-- ============================================================
-- mark_order_ready — REWRITE internals, same signature/return.
-- Order/table/order_source side-effects are kept verbatim; the two
-- manual inventory_logs INSERT blocks are replaced by delegation to
-- the canonical per-item writer (same transaction => atomic).
-- ============================================================
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

  IF v_order.order_source = 'dine_in' AND v_order.table_number IS NOT NULL AND v_order.table_number > 0 THEN
    UPDATE public.table_floors
    SET status = 'ready', updated_at = now()
    WHERE table_number = v_order.table_number;
  END IF;

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

-- ============================================================
-- mark_item_ready_atomic — KEEP + harden (H2.3).
-- Adds an order-level advisory lock so concurrent KDS mark_order_ready
-- and admin mark_item_ready_atomic serialize; actor now flows through
-- to the canonical writer. READY transition + per-item rollback kept.
-- ============================================================
CREATE OR REPLACE FUNCTION public.mark_item_ready_atomic(p_order_id uuid, p_item_ids uuid[] DEFAULT NULL::uuid[], p_performed_by uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;