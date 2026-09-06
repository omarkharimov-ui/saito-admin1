-- ============================================================
-- 0.4-H / M4 — Void / Waste / Refund / Return / Correction (H6–H8, H11)
--
-- Inserts the canonical reversal path:
--   _inventory_reverse_item(...) reads the immutable ledger, writes
--   'reversal' rows (idempotency-keyed, correlation-linked), emits
--   inventory.* outbox events in the same transaction. Nothing is ever
--   edited/deleted; nothing writes to the dead inventory_transactions.
--
-- Void/waste/refund/return/correct ALL route through reversal +G
-- ledger rows. correct_item_atomic keeps its frozen 0.4-D body and
-- gains the H7 consumer (actual reversal applied in the SAME txn as the
-- inventory.reversal_requested event).
-- ============================================================

-- 1. Internal reversal helper (H6.1)
CREATE OR REPLACE FUNCTION public._inventory_reverse_item(p_order_item_id uuid, p_reason text DEFAULT 'void'::text, p_performed_by uuid DEFAULT NULL::uuid, p_correlation_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_order RECORD;
  v_r RECORD;
  v_corr uuid := COALESCE(p_correlation_id, gen_random_uuid());
  v_reversed INT := 0;
  v_id uuid;
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

  -- Reverse every consumed (item, ingredient) once, by consumed quantity.
  -- Legacy item-level rows (NULL idempotency_key) are covered here too.
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
       reference_type, reference_id, correlation_id, idempotency_key, performed_by,
       reason, location_id, organization_id, created_at)
    VALUES
      (v_r.ingredient_id, 'reversal', v_r.qty, v_r.unit,
       v_order.id, p_order_item_id, 'order', v_order.id,
       v_corr, 'reversal:' || p_order_item_id::text || ':' || v_r.ingredient_id::text || ':' || v_corr::text,
       p_performed_by, COALESCE(p_reason, 'void'), v_order.location_id, v_order.organization_id, now())
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_id;

    IF v_id IS NOT NULL THEN
      v_reversed := v_reversed + 1;
      PERFORM public.emit_outbox_event('inventory', v_r.ingredient_id, 'inventory.transaction.created',
        jsonb_build_object('order_item_id', p_order_item_id, 'ingredient_id', v_r.ingredient_id, 'quantity', v_r.qty, 'type', 'reversal'),
        jsonb_build_object('correlation_id', v_corr));
      PERFORM public.emit_outbox_event('inventory', v_r.ingredient_id, 'inventory.stock_changed',
        jsonb_build_object('order_item_id', p_order_item_id, 'ingredient_id', v_r.ingredient_id, 'quantity', v_r.qty),
        jsonb_build_object('correlation_id', v_corr));
      PERFORM public.emit_outbox_event('inventory', v_r.ingredient_id, 'inventory.reversal.requested',
        jsonb_build_object('order_item_id', p_order_item_id, 'ingredient_id', v_r.ingredient_id, 'quantity', v_r.qty, 'reason', p_reason),
        jsonb_build_object('correlation_id', v_corr));
    END IF;
  END LOOP;

  IF v_reversed = 0 THEN
    RETURN jsonb_build_object('success', true, 'result', 'no_consumption', 'reversed', 0);
  END IF;

  RETURN jsonb_build_object('success', true, 'result', 'reversed', 'reversed', v_reversed, 'correlation_id', v_corr);
END;
$function$;

-- 2. void_order_item_atomic — REWRITE (H6.2): canonical reversal instead of
--    dead inventory_transactions; terminal state 'voided' (registry-aligned).
CREATE OR REPLACE FUNCTION public.void_order_item_atomic(p_order_item_id uuid, p_reason text DEFAULT 'void'::text, p_performed_by uuid DEFAULT NULL::uuid, p_performed_by_terminal_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_item RECORD;
  v_order RECORD;
  v_new_total NUMERIC := 0;
  v_inv jsonb;
BEGIN
  PERFORM public.validate_actor(p_performed_by);
  SELECT * INTO v_item FROM public.order_items WHERE id = p_order_item_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order item not found');
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = v_item.order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;

  IF v_item.kitchen_status IN ('cancelled', 'voided') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Item already voided');
  END IF;

  -- Canonical reversal (no-op when the item was never consumed).
  v_inv := public._inventory_reverse_item(p_order_item_id, COALESCE(p_reason, 'void'), p_performed_by);

  UPDATE public.order_items SET
    kitchen_status = 'voided',
    updated_at = NOW()
  WHERE id = p_order_item_id;

  SELECT COALESCE(SUM(total_price), 0) INTO v_new_total FROM public.order_items
  WHERE order_id = v_order.id AND kitchen_status NOT IN ('cancelled', 'voided');

  UPDATE public.orders SET
    total_amount = v_new_total,
    version = COALESCE(version, 0) + 1,
    updated_by_terminal_id = p_performed_by_terminal_id,
    updated_at = NOW()
  WHERE id = v_order.id;

  INSERT INTO public.operation_logs (
    table_number, order_id, action, old_values, new_values, performed_by
  ) VALUES (
    v_order.table_number, v_order.id, 'void_order_item',
    jsonb_build_object('item_id', p_order_item_id, 'kitchen_status', v_item.kitchen_status, 'order_total', v_order.total_amount),
    jsonb_build_object('item_id', p_order_item_id, 'kitchen_status', 'voided', 'reason', p_reason, 'order_total', v_new_total),
    p_performed_by
  );

  RETURN jsonb_build_object('success', true, 'new_order_total', v_new_total,
    'inventory', (v_inv->>'result'), 'inventory_reversed', (v_inv->>'reversed')::int);
END;
$function$;

-- 3. waste_order_item_atomic — REWRITE (H6.2): canonical reversal, same shape.
CREATE OR REPLACE FUNCTION public.waste_order_item_atomic(p_order_item_id uuid, p_reason text DEFAULT 'waste'::text, p_performed_by uuid DEFAULT NULL::uuid, p_performed_by_terminal_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_item RECORD;
  v_order RECORD;
  v_new_total NUMERIC := 0;
  v_inv jsonb;
BEGIN
  PERFORM public.validate_actor(p_performed_by);
  SELECT * INTO v_item FROM public.order_items WHERE id = p_order_item_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order item not found');
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = v_item.order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;

  IF v_item.kitchen_status = 'wasted' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Item already wasted');
  END IF;

  v_inv := public._inventory_reverse_item(p_order_item_id, COALESCE(p_reason, 'waste'), p_performed_by);

  UPDATE public.order_items SET
    kitchen_status = 'wasted',
    updated_at = NOW()
  WHERE id = p_order_item_id;

  SELECT COALESCE(SUM(total_price), 0) INTO v_new_total FROM public.order_items
  WHERE order_id = v_order.id AND kitchen_status NOT IN ('cancelled', 'voided', 'wasted');

  UPDATE public.orders SET
    total_amount = v_new_total,
    version = COALESCE(version, 0) + 1,
    updated_by_terminal_id = p_performed_by_terminal_id,
    updated_at = NOW()
  WHERE id = v_order.id;

  INSERT INTO public.operation_logs (
    table_number, order_id, action, old_values, new_values, performed_by
  ) VALUES (
    v_order.table_number, v_order.id, 'waste_order_item',
    jsonb_build_object('item_id', p_order_item_id, 'kitchen_status', v_item.kitchen_status, 'order_total', v_order.total_amount),
    jsonb_build_object('item_id', p_order_item_id, 'kitchen_status', 'wasted', 'reason', p_reason, 'order_total', v_new_total),
    p_performed_by
  );

  RETURN jsonb_build_object('success', true, 'new_order_total', v_new_total,
    'inventory', (v_inv->>'result'), 'inventory_reversed', (v_inv->>'reversed')::int);
END;
$function$;

-- 4. void_item_atomic — REWRITE (small): reversal for consumed items
--    (ready/served/completed). Everything else retained verbatim.
CREATE OR REPLACE FUNCTION public.void_item_atomic(p_token text, p_item_id uuid, p_reason text DEFAULT NULL::text, p_metadata jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_staff_id uuid;
  v_item RECORD;
  v_order RECORD;
  v_rule jsonb;
  v_allowed jsonb;
  v_void_total numeric;
  v_inv jsonb;
BEGIN
  PERFORM set_session_staff(p_token);
  v_staff_id := current_staff_id();

  SELECT * INTO v_item FROM order_items WHERE id = p_item_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_ITEM_NOT_FOUND' USING ERRCODE = 'P0001'; END IF;

  SELECT * INTO v_order FROM orders WHERE id = v_item.order_id FOR UPDATE;
  IF v_order.status IN ('paid','closed','refunded','partially_refunded') THEN
    RAISE EXCEPTION 'ORDER_FINALIZED: use refund/reversal workflow for paid orders' USING ERRCODE='P0001';
  END IF;

  v_rule := validate_transition('item', v_item.kitchen_status, 'voided');
  IF NOT (v_rule->>'valid')::boolean THEN
    RAISE EXCEPTION 'INVALID_ITEM_TRANSITION: %', v_rule->>'error' USING ERRCODE='P0001';
  END IF;

  v_allowed := authorize(p_token, COALESCE(v_rule->>'requires_permission', 'order.void'), v_order.location_id);
  IF NOT (v_allowed->>'allowed')::boolean THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: % at % (reason: %)',
      COALESCE(v_rule->>'requires_permission','order.void'), v_order.location_id,
      v_allowed->>'reason' USING ERRCODE='P0001';
  END IF;

  IF COALESCE(v_rule->>'requires_manager_override','false')::boolean THEN
    PERFORM ensure_manager_override(v_staff_id,
      COALESCE(v_rule->>'requires_permission','order.void'),
      v_order.location_id, v_item.kitchen_status, 'voided');
  END IF;

  v_void_total := COALESCE(v_item.total_price, v_item.unit_price * v_item.quantity);

  -- H6: consumed items produce exactly one inventory reversal.
  IF v_item.kitchen_status IN ('ready','served','completed') THEN
    v_inv := public._inventory_reverse_item(p_item_id, COALESCE(p_reason, 'void'), v_staff_id);
  END IF;

  UPDATE order_items SET
    kitchen_status = 'voided',
    total_price = 0,
    served_at = NULL,
    updated_at = now()
  WHERE id = p_item_id;

  UPDATE orders SET
    total_amount = GREATEST(0, COALESCE(total_amount, 0) - v_void_total),
    version = COALESCE(version, 0) + 1,
    updated_at = now()
  WHERE id = v_order.id;

  PERFORM log_order_event(v_order.id, 'item_voided',
    jsonb_build_object('item', p_item_id, 'total', v_void_total),
    jsonb_build_object('total', 0, 'reason', p_reason),
    COALESCE(p_metadata, '{}'::jsonb), v_staff_id, NULL, NULL, NULL);

  INSERT INTO operation_logs (operation, order_id, performed_by, reason, old_state, new_state,
                              location_id, organization_id, metadata)
  VALUES ('order_item.void', v_order.id, v_staff_id, p_reason,
    jsonb_build_object('item', p_item_id, 'status', v_item.kitchen_status, 'total', v_void_total),
    jsonb_build_object('status', 'voided', 'total', 0),
    v_order.location_id, v_order.organization_id, COALESCE(p_metadata, '{}'::jsonb));

  INSERT INTO outbox_events (aggregate_type, aggregate_id, event_type, payload, status)
  VALUES ('order_item', p_item_id, 'order_item.voided',
    jsonb_build_object('order_id', v_order.id, 'old_total', v_void_total,
      'new_total', 0, 'reason', p_reason, 'performed_by', v_staff_id), 'pending');

  RETURN jsonb_build_object('success', true, 'order_item_id', p_item_id,
    'voided_total', v_void_total, 'item_status', 'voided',
    'inventory', COALESCE(v_inv->>'result', 'n/a'));
END;
$function$;

-- 5. return_to_stock — REWRITE (H8): canonical 'reversal' rows (idempotency
--    keyed, correlation-linked) instead of stock_return; M2 already fixed the
--    direction, this makes the path canonical. Partial-return math retained.
CREATE OR REPLACE FUNCTION public.return_to_stock(p_order_item_id uuid, p_quantity integer DEFAULT NULL::integer, p_reason text DEFAULT 'return_to_stock'::text, p_reason_text text DEFAULT NULL::text, p_performed_by uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_oi RECORD;
  v_order RECORD;
  v_performer_name TEXT;
  v_now TIMESTAMPTZ := NOW();
  v_return_qty INT;
  v_product RECORD;
  v_rec RECORD;
  v_returned INT := 0;
  v_corr uuid := gen_random_uuid();
  v_key text;
  v_id uuid;
  v_prod_found boolean := false;
BEGIN
  SELECT * INTO v_oi FROM public.order_items WHERE id = p_order_item_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order item not found');
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = v_oi.order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;

  IF v_oi.kitchen_status NOT IN ('ready', 'completed', 'served') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot return item in state: ' || COALESCE(v_oi.kitchen_status, 'pending'));
  END IF;

  -- Idempotent (covers reversal + legacy stock_return rows)
  IF EXISTS (
    SELECT 1 FROM public.inventory_logs
    WHERE order_item_id = p_order_item_id AND type IN ('reversal', 'stock_return')
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Stock already returned for this item');
  END IF;

  IF p_performed_by IS NOT NULL THEN
    SELECT name INTO v_performer_name FROM public.staff WHERE id = p_performed_by;
  END IF;

  v_return_qty := COALESCE(p_quantity, v_oi.quantity);
  IF v_return_qty <= 0 OR v_return_qty > v_oi.quantity THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid return quantity');
  END IF;

  SELECT * INTO v_product FROM public.products WHERE id = v_oi.product_id;
  IF FOUND THEN
    v_prod_found := true;
  END IF;

  IF v_prod_found AND v_product.is_ready_product AND v_product.direct_ingredient_id IS NOT NULL THEN
    v_key := 'return:' || p_order_item_id::text || ':' || v_product.direct_ingredient_id::text;
    INSERT INTO public.inventory_logs (
      ingredient_id, type, quantity, unit, order_id, order_item_id,
      item_quantity, reference_type, reference_id, correlation_id, idempotency_key,
      performed_by, reason, created_at, location_id, organization_id
    ) VALUES (
      v_product.direct_ingredient_id, 'reversal', v_return_qty,
      (SELECT COALESCE(unit, 'gram') FROM public.ingredients WHERE id = v_product.direct_ingredient_id),
      v_oi.order_id, p_order_item_id, v_return_qty,
      'order', v_oi.order_id, v_corr, v_key, p_performed_by,
      COALESCE(p_reason_text, 'Return to stock: ' || COALESCE(v_oi.product_name, 'Məhsul')),
      v_now, v_order.location_id, v_order.organization_id
    )
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_id;
    IF v_id IS NOT NULL THEN
      v_returned := 1;
      PERFORM public.emit_outbox_event('inventory', v_product.direct_ingredient_id, 'inventory.transaction.created',
        jsonb_build_object('order_item_id', p_order_item_id, 'ingredient_id', v_product.direct_ingredient_id, 'quantity', v_return_qty, 'type', 'reversal'),
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
      v_key := 'return:' || p_order_item_id::text || ':' || v_rec.ingredient_id::text;
      INSERT INTO public.inventory_logs (
        ingredient_id, type, quantity, unit, order_id, order_item_id,
        item_quantity, reference_type, reference_id, correlation_id, idempotency_key,
        performed_by, reason, created_at, location_id, organization_id
      ) VALUES (
        v_rec.ingredient_id, 'reversal',
        COALESCE(v_rec.quantity_brutto, v_rec.quantity_required) * v_return_qty,
        v_rec.unit, v_oi.order_id, p_order_item_id, v_return_qty,
        'order', v_oi.order_id, v_corr, v_key, p_performed_by,
        COALESCE(p_reason_text, 'Return to stock: ' || COALESCE(v_oi.product_name, 'Məhsul')),
        v_now, v_order.location_id, v_order.organization_id
      )
      ON CONFLICT DO NOTHING
      RETURNING id INTO v_id;
      IF v_id IS NOT NULL THEN
        v_returned := 1;
        PERFORM public.emit_outbox_event('inventory', v_rec.ingredient_id, 'inventory.transaction.created',
          jsonb_build_object('order_item_id', p_order_item_id, 'ingredient_id', v_rec.ingredient_id, 'quantity', COALESCE(v_rec.quantity_brutto, v_rec.quantity_required) * v_return_qty, 'type', 'reversal'),
          jsonb_build_object('correlation_id', v_corr));
      END IF;
    END LOOP;
  END IF;

  PERFORM public.log_audit(
    'return_to_stock', 'order_item', p_order_item_id::text,
    p_performed_by, v_performer_name, NULL,
    jsonb_build_object(
      'product_name', v_oi.product_name,
      'quantity', v_return_qty,
      'reason', p_reason,
      'returned_entries', v_returned
    ),
    jsonb_build_object('order_id', v_oi.order_id, 'order_item_id', p_order_item_id),
    NULL
  );

  RETURN jsonb_build_object(
    'success', true,
    'action', 'return_to_stock',
    'product_name', v_oi.product_name,
    'quantity_returned', v_return_qty,
    'entries_created', v_returned,
    'order_id', v_oi.order_id,
    'timestamp', v_now
  );
END;
$function$;

-- 6. record_item_waste — REWRITE (additive, H8): when the wasted item was
--    consumed, write canonical 'waste' ledger rows (previously none).
CREATE OR REPLACE FUNCTION public.record_item_waste(p_order_item_id uuid, p_quantity integer DEFAULT NULL::integer, p_reason text DEFAULT 'waste'::text, p_reason_text text DEFAULT NULL::text, p_performed_by uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_oi RECORD;
  v_order RECORD;
  v_performer_name TEXT;
  v_now TIMESTAMPTZ := NOW();
  v_waste_qty INT;
  v_new_qty INT;
  v_valid_reasons text[] := ARRAY['customer_return','kitchen_error','burned','spilled','wrong_item','expired','spoilage','other'];
  v_product RECORD;
  v_rec RECORD;
  v_corr uuid := gen_random_uuid();
  v_key text;
  v_id uuid;
  v_wasted INT := 0;
  v_prod_found boolean := false;
BEGIN
  SELECT * INTO v_oi FROM public.order_items WHERE id = p_order_item_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order item not found');
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = v_oi.order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;

  IF v_oi.kitchen_status NOT IN ('ready', 'completed', 'served') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Cannot waste item in state: ' || COALESCE(v_oi.kitchen_status, 'pending') || '. Use void for DRAFT/SENT/PREPARING.',
      'current_state', COALESCE(v_oi.kitchen_status, 'pending')
    );
  END IF;

  IF p_reason IS NULL OR NOT (p_reason = ANY(v_valid_reasons)) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Invalid reason. Valid reasons: ' || array_to_string(v_valid_reasons, ', '),
      'valid_reasons', to_jsonb(v_valid_reasons)
    );
  END IF;

  IF p_performed_by IS NOT NULL THEN
    SELECT name INTO v_performer_name FROM public.staff WHERE id = p_performed_by;
  END IF;

  v_waste_qty := COALESCE(p_quantity, v_oi.quantity);
  IF v_waste_qty <= 0 OR v_waste_qty > v_oi.quantity THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid waste quantity');
  END IF;

  INSERT INTO public.cancelled_orders (order_id, reason, reason_text, items, total_amount, created_at)
  VALUES (
    v_oi.order_id,
    CASE
      WHEN p_reason = 'customer_return' THEN 'customer_refused'
      WHEN p_reason = 'wrong_item' THEN 'wrong_order'
      WHEN p_reason = 'other' THEN 'other'
      ELSE 'waste'
    END,
    COALESCE(p_reason_text, 'İtki: ' || COALESCE(v_oi.product_name, 'Məhsul')),
    jsonb_build_array(jsonb_build_object(
      'order_item_id', v_oi.id,
      'product_id', v_oi.product_id,
      'product_name', v_oi.product_name,
      'quantity', v_waste_qty,
      'unit_price', v_oi.unit_price,
      'kitchen_status', v_oi.kitchen_status,
      'reason', p_reason
    )),
    v_oi.unit_price * v_waste_qty,
    v_now
  );

  -- H8: consumed (ready/served/completed) => write canonical waste ledger rows.
  IF NOT EXISTS (
    SELECT 1 FROM public.inventory_logs l WHERE l.order_item_id = p_order_item_id AND l.type = 'waste'
  ) THEN
    SELECT * INTO v_product FROM public.products WHERE id = v_oi.product_id;
    IF FOUND THEN
      v_prod_found := true;
    END IF;

    IF v_prod_found AND v_product.is_ready_product AND v_product.direct_ingredient_id IS NOT NULL THEN
      v_key := 'waste:' || p_order_item_id::text || ':' || v_product.direct_ingredient_id::text;
      INSERT INTO public.inventory_logs (
        ingredient_id, type, quantity, unit, order_id, order_item_id, item_quantity,
        reference_type, reference_id, correlation_id, idempotency_key, performed_by,
        reason, created_at, location_id, organization_id
      ) VALUES (
        v_product.direct_ingredient_id, 'waste', v_waste_qty,
        (SELECT COALESCE(unit, 'gram') FROM public.ingredients WHERE id = v_product.direct_ingredient_id),
        v_oi.order_id, p_order_item_id, v_waste_qty, 'order', v_oi.order_id, v_corr, v_key,
        p_performed_by, COALESCE(p_reason_text, 'İtki: ' || COALESCE(v_oi.product_name, 'Məhsul')),
        v_now, v_order.location_id, v_order.organization_id
      )
      ON CONFLICT DO NOTHING RETURNING id INTO v_id;
      IF v_id IS NOT NULL THEN v_wasted := 1; END IF;

    ELSIF v_prod_found THEN
      FOR v_rec IN
        SELECT r.ingredient_id, r.quantity_required, r.quantity_brutto,
               COALESCE(i.unit, 'gram') AS unit
        FROM public.recipes r
        JOIN public.ingredients i ON i.id = r.ingredient_id
        WHERE r.menu_item_id = v_oi.product_id AND r.is_ai_suggested = false
      LOOP
        v_key := 'waste:' || p_order_item_id::text || ':' || v_rec.ingredient_id::text;
        INSERT INTO public.inventory_logs (
          ingredient_id, type, quantity, unit, order_id, order_item_id, item_quantity,
          reference_type, reference_id, correlation_id, idempotency_key, performed_by,
          reason, created_at, location_id, organization_id
        ) VALUES (
          v_rec.ingredient_id, 'waste',
          COALESCE(v_rec.quantity_brutto, v_rec.quantity_required) * v_waste_qty,
          v_rec.unit, v_oi.order_id, p_order_item_id, v_waste_qty, 'order', v_oi.order_id,
          v_corr, v_key, p_performed_by,
          COALESCE(p_reason_text, 'İtki: ' || COALESCE(v_oi.product_name, 'Məhsul')),
          v_now, v_order.location_id, v_order.organization_id
        )
        ON CONFLICT DO NOTHING RETURNING id INTO v_id;
        IF v_id IS NOT NULL THEN v_wasted := 1; END IF;
      END LOOP;
    END IF;

    IF v_wasted > 0 THEN
      PERFORM public.emit_outbox_event('inventory', v_oi.product_id, 'inventory.transaction.created',
        jsonb_build_object('order_item_id', p_order_item_id, 'product_id', v_oi.product_id, 'quantity', v_waste_qty, 'type', 'waste'),
        jsonb_build_object('correlation_id', v_corr));
    END IF;
  END IF;

  IF v_waste_qty >= v_oi.quantity THEN
    UPDATE public.order_items SET kitchen_status = 'voided', total_price = 0 WHERE id = v_oi.id;
  ELSE
    v_new_qty := v_oi.quantity - v_waste_qty;
    UPDATE public.order_items SET quantity = v_new_qty, total_price = COALESCE(unit_price, 0) * v_new_qty WHERE id = v_oi.id;
  END IF;

  UPDATE public.orders SET
    total_amount = GREATEST(0, (SELECT COALESCE(SUM(total_price), 0) FROM public.order_items WHERE order_id = v_oi.order_id AND kitchen_status != 'voided'))
  WHERE id = v_oi.order_id;

  IF NOT EXISTS (SELECT 1 FROM public.order_items WHERE order_id = v_oi.order_id AND kitchen_status != 'voided') THEN
    UPDATE public.orders SET status = 'cancelled', kitchen_status = 'cancelled', cancelled_at = v_now WHERE id = v_oi.order_id;
  END IF;

  PERFORM public.log_audit(
    'item_waste', 'order_item', p_order_item_id::text,
    p_performed_by, v_performer_name, NULL,
    jsonb_build_object(
      'product_name', v_oi.product_name,
      'quantity', v_waste_qty,
      'reason', p_reason,
      'reason_text', p_reason_text,
      'kitchen_status', v_oi.kitchen_status
    ),
    jsonb_build_object('order_id', v_oi.order_id, 'order_item_id', p_order_item_id),
    NULL
  );

  RETURN jsonb_build_object(
    'success', true, 'action', 'waste',
    'product_name', v_oi.product_name,
    'quantity_wasted', v_waste_qty,
    'reason', p_reason,
    'order_id', v_oi.order_id, 'timestamp', v_now
  );
END;
$function$;

-- 7. correct_item_atomic — KEEP body (frozen 0.4-D) + H7 CONSUMER: when the
--    original was consumed, apply the actual reversal in the SAME transaction
--    that emits inventory.reversal_requested. Reversal is bounded and
--    idempotency-keyed by correction correlation; replacement consumption
--    happens later at its own READY via the canonical writer.
CREATE OR REPLACE FUNCTION public.correct_item_atomic(p_token text, p_item_id uuid, p_correction jsonb, p_reason text DEFAULT NULL::text, p_idempotency_key text DEFAULT NULL::text, p_metadata jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_staff_id uuid;
  v_item RECORD;
  v_order RECORD;
  v_rule jsonb;
  v_allowed jsonb;
  v_type text;
  v_qty int;
  v_mods jsonb;
  v_tax numeric;
  v_course text;
  v_seat int;
  v_notes text;
  v_old_total numeric;
  v_void_total numeric;
  v_pricing jsonb;
  v_new_total numeric;
  v_delta numeric;
  v_new_item uuid;
  v_corr uuid;
  v_corr_key text;
  v_prev RECORD;
  v_production boolean;
  v_stock_consumed boolean;
BEGIN
  PERFORM set_session_staff(p_token);
  v_staff_id := current_staff_id();

  v_type := COALESCE(p_correction->>'type','void_readd');

  IF v_type NOT IN ('quantity','modifiers','price_tax','void_readd') THEN
    RAISE EXCEPTION 'UNKNOWN_CORRECTION_TYPE: % (quantity|modifiers|price_tax|void_readd)', v_type USING ERRCODE='P0001';
  END IF;
  v_qty  := COALESCE((p_correction->>'quantity')::int, NULL);
  v_mods := COALESCE(p_correction->'modifiers', NULL);
  v_tax  := COALESCE((p_correction->>'tax_rate')::numeric, NULL);
  v_course := p_correction->>'course';
  v_seat := NULLIF((p_correction->>'seat_number')::int, NULL);
  v_notes := p_correction->>'special_notes';

  IF v_type = 'quantity' AND v_qty IS NULL THEN
    RAISE EXCEPTION 'CORRECTION_REQUIRES_QTY: quantity correction needs quantity' USING ERRCODE='P0001';
  END IF;
  IF v_type = 'modifiers' AND v_mods IS NULL THEN
    RAISE EXCEPTION 'CORRECTION_REQUIRES_MODIFIERS' USING ERRCODE='P0001';
  END IF;
  IF v_type = 'price_tax' AND v_tax IS NULL THEN
    RAISE EXCEPTION 'CORRECTION_REQUIRES_TAX_RATE' USING ERRCODE='P0001';
  END IF;
  IF v_qty IS NOT NULL AND v_qty <= 0 THEN
    RAISE EXCEPTION 'INVALID_QTY: quantity must be > 0' USING ERRCODE='P0001';
  END IF;
  IF v_tax IS NOT NULL AND (v_tax < 0 OR v_tax > 100) THEN
    RAISE EXCEPTION 'INVALID_TAX_RATE: % (0..100)', v_tax USING ERRCODE='P0001';
  END IF;

  v_corr_key := COALESCE(p_idempotency_key, 'corr-' || v_staff_id || '-' || p_item_id || '-' || to_jsonb(p_correction)::text);
  SELECT * INTO v_prev FROM item_corrections WHERE idempotency_key = v_corr_key;
  IF FOUND THEN
    RETURN jsonb_build_object('success', true, 'duplicate', true,
      'correction_id', v_prev.id, 'original_item_id', v_prev.original_item_id,
      'replacement_item_id', v_prev.replacement_item_id);
  END IF;

  SELECT * INTO v_order FROM orders WHERE id = (SELECT order_id FROM order_items WHERE id = p_item_id) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_ITEM_NOT_FOUND' USING ERRCODE='P0001'; END IF;

  SELECT * INTO v_item FROM order_items WHERE id = p_item_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_ITEM_NOT_FOUND' USING ERRCODE='P0001'; END IF;

  IF v_order.status IN ('paid','closed','cancelled','refunded','partially_refunded') THEN
    RAISE EXCEPTION 'ORDER_FINALIZED: corrections not allowed on % orders — use refund/reversal workflow', v_order.status USING ERRCODE='P0001';
  END IF;

  IF v_item.kitchen_status IN ('voided','cancelled','comped','wasted','recalled') THEN
    RAISE EXCEPTION 'ITEM_CORRECTION_FROZEN: item is terminal (%) — correct the replacement item instead', v_item.kitchen_status USING ERRCODE='P0001';
  END IF;

  v_rule := validate_transition('item', v_item.kitchen_status, 'voided');
  IF NOT (v_rule->>'valid')::boolean THEN
    RAISE EXCEPTION 'INVALID_ITEM_TRANSITION: %', v_rule->>'error' USING ERRCODE='P0001';
  END IF;

  v_allowed := authorize(p_token, COALESCE(v_rule->>'requires_permission','order.void'), v_order.location_id);
  IF NOT (v_allowed->>'allowed')::boolean THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: % at % (reason: %)',
      COALESCE(v_rule->>'requires_permission','order.void'), v_order.location_id,
      v_allowed->>'reason' USING ERRCODE='P0001';
  END IF;

  IF COALESCE(v_rule->>'requires_manager_override','false')::boolean THEN
    PERFORM ensure_manager_override(v_staff_id,
      COALESCE(v_rule->>'requires_permission','order.void'),
      v_order.location_id, v_item.kitchen_status, 'voided');
  END IF;

  v_production := v_item.kitchen_status IN ('sent','accepted','preparing','ready','served','completed');
  v_stock_consumed := v_item.kitchen_status IN ('ready','served','completed');

  v_pricing := _price_replacement_snapshot(v_item.product_id,
    COALESCE(v_qty, v_item.quantity),
    COALESCE(v_mods, COALESCE(v_item.modifiers, '[]'::jsonb)),
    COALESCE(v_tax, COALESCE(v_item.tax_rate, 0)));

  v_old_total  := COALESCE(v_item.total_price, v_item.unit_price * v_item.quantity);
  v_void_total := v_old_total;
  v_new_total  := (v_pricing->>'total_price')::numeric;
  v_delta      := round(v_new_total - v_void_total, 2);

  v_corr := gen_random_uuid();

  UPDATE order_items SET
    kitchen_status = 'voided',
    total_price = 0,
    served_at = NULL,
    updated_at = now()
  WHERE id = p_item_id;

  UPDATE orders SET
    total_amount = GREATEST(0, COALESCE(total_amount, 0) - v_void_total),
    version = COALESCE(version, 0) + 1
  WHERE id = v_order.id;

  INSERT INTO order_items (
    order_id, product_id, product_name, quantity, unit_price, total_price,
    modifiers, course, seat_number, special_notes,
    kitchen_status, tax_rate, tax_amount, price_snapshot,
    station_id, idempotency_key, correlation_id
  ) VALUES (
    v_order.id, v_item.product_id, v_pricing->>'product_name', COALESCE(v_qty, v_item.quantity),
    (v_pricing->>'unit_price')::numeric, v_new_total,
    v_pricing->'modifiers',
    COALESCE(v_course, v_item.course),
    COALESCE(v_seat, v_item.seat_number),
    COALESCE(v_notes, v_item.special_notes),
    'pending', COALESCE(v_tax, COALESCE(v_item.tax_rate, 0)),
    (v_pricing->>'tax_amount')::numeric, v_pricing->'snapshot',
    (v_pricing->>'station_id')::uuid,
    NULL, v_corr
  ) RETURNING id INTO v_new_item;

  UPDATE orders SET
    total_amount = COALESCE(total_amount, 0) + v_new_total,
    version = COALESCE(version, 0) + 1,
    updated_at = now()
  WHERE id = v_order.id;

  INSERT INTO item_corrections (
    id, order_id, original_item_id, replacement_item_id, correction_type,
    reason, performed_by, idempotency_key, old_total, new_total, delta, closed_at
  ) VALUES (
    v_corr, v_order.id, p_item_id, v_new_item, v_type,
    p_reason, v_staff_id, v_corr_key, v_void_total, v_new_total, v_delta, now()
  );

  PERFORM log_order_event(v_order.id, 'item_voided',
    jsonb_build_object('item', p_item_id, 'total', v_void_total, 'status_before', v_item.kitchen_status, 'correction_type', v_type),
    jsonb_build_object('total', 0, 'reason', p_reason, 'replacement_item_id', v_new_item),
    COALESCE(p_metadata, jsonb_build_object('correction_id', v_corr)),
    v_staff_id, NULL, NULL, NULL);

  PERFORM log_order_event(v_order.id, 'item_added',
    NULL,
    jsonb_build_object('order_item_id', v_new_item, 'product_name', v_pricing->>'product_name',
      'quantity', COALESCE(v_qty, v_item.quantity), 'unit_price', (v_pricing->>'unit_price')::numeric,
      'total_price', v_new_total, 'tax_amount', (v_pricing->>'tax_amount')::numeric, 'replacement_of', p_item_id),
    jsonb_build_object('correction_id', v_corr, 'correction_type', v_type),
    v_staff_id, NULL, NULL, NULL);

  PERFORM log_order_event(v_order.id, 'item_corrected',
    jsonb_build_object('original_item_id', p_item_id, 'old_total', v_void_total),
    jsonb_build_object('replacement_item_id', v_new_item, 'new_total', v_new_total, 'delta', v_delta),
    jsonb_build_object('correction_type', v_type, 'reason', p_reason, 'correction_id', v_corr),
    v_staff_id, NULL, NULL, NULL);

  INSERT INTO operation_logs (operation, order_id, performed_by, reason, old_state, new_state,
                              location_id, organization_id, metadata)
  VALUES ('order_item.correct', v_order.id, v_staff_id, p_reason,
    jsonb_build_object('item', p_item_id, 'status', v_item.kitchen_status, 'total', v_void_total, 'correction_type', v_type),
    jsonb_build_object('replacement', v_new_item, 'status', 'pending', 'total', v_new_total, 'delta', v_delta),
    v_order.location_id, v_order.organization_id,
    COALESCE(p_metadata, '{}'::jsonb) || jsonb_build_object('correction_id', v_corr));

  INSERT INTO outbox_events (aggregate_type, aggregate_id, event_type, payload, status)
  VALUES ('order_item', p_item_id, 'order_item.voided',
    jsonb_build_object('order_id', v_order.id, 'old_total', v_void_total, 'new_total', 0,
      'reason', p_reason, 'performed_by', v_staff_id, 'correction', true,
      'correction_type', v_type, 'replacement_item_id', v_new_item,
      'kitchen_aware', v_production, 'status_before', v_item.kitchen_status),
    'pending');

  INSERT INTO outbox_events (aggregate_type, aggregate_id, event_type, payload, status)
  VALUES ('order_item', v_new_item, 'order_item.added',
    jsonb_build_object('order_id', v_order.id, 'product_id', v_item.product_id,
      'quantity', COALESCE(v_qty, v_item.quantity), 'unit_price', (v_pricing->>'unit_price')::numeric,
      'total_price', v_new_total, 'tax_amount', (v_pricing->>'tax_amount')::numeric,
      'performed_by', v_staff_id, 'replacement_of', p_item_id, 'correction_id', v_corr),
    'pending');

  INSERT INTO outbox_events (aggregate_type, aggregate_id, event_type, payload, status)
  VALUES ('order_item', v_new_item, 'order_item.corrected',
    jsonb_build_object('order_id', v_order.id, 'original_item_id', p_item_id,
      'old_total', v_void_total, 'new_total', v_new_total, 'delta', v_delta,
      'correction_type', v_type, 'reason', p_reason, 'performed_by', v_staff_id),
    'pending');

  IF v_production THEN
    INSERT INTO outbox_events (aggregate_type, aggregate_id, event_type, payload, status)
    VALUES ('order_item', p_item_id, 'order_item.kitchen_compensation',
      jsonb_build_object('order_id', v_order.id, 'item_id', p_item_id,
        'replacement_item_id', v_new_item, 'status_before', v_item.kitchen_status,
        'reason', p_reason),
      'pending');
  END IF;

  IF v_stock_consumed THEN
    INSERT INTO outbox_events (aggregate_type, aggregate_id, event_type, payload, status)
    VALUES ('order_item', p_item_id, 'inventory.reversal_requested',
      jsonb_build_object('order_id', v_order.id, 'item_id', p_item_id,
        'product_id', v_item.product_id, 'quantity', v_item.quantity,
        'kitchen_status_before', v_item.kitchen_status, 'correction_id', v_corr),
      'pending');

    -- H7 consumer: apply the reversal in the same transaction (exactly once,
    -- idempotency-keyed by correction correlation).
    PERFORM public._inventory_reverse_item(p_item_id, COALESCE(p_reason, 'correction'), v_staff_id, v_corr);
  END IF;

  RETURN jsonb_build_object('success', true,
    'correction_id', v_corr,
    'original_item_id', p_item_id,
    'replacement_item_id', v_new_item,
    'correction_type', v_type,
    'voided_total', v_void_total,
    'new_total', v_new_total,
    'delta', v_delta,
    'replacement_status', 'pending');
END;
$function$;

-- 8. refund_with_inventory — REWRITE item-fate section (H8); payment/recalc
--    logic verbatim. return_to_stock fate => canonical 'reversal' rows;
--    waste fate => canonical 'waste' rows (previously no inventory effect).
CREATE OR REPLACE FUNCTION public.refund_with_inventory(p_order_id uuid, p_order_item_id uuid, p_quantity integer, p_amount numeric, p_method text DEFAULT 'cash'::text, p_item_fate text DEFAULT 'waste'::text, p_reason text DEFAULT NULL::text, p_reason_text text DEFAULT NULL::text, p_performed_by uuid DEFAULT NULL::uuid)
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
  v_new_paid NUMERIC;
  v_new_refund NUMERIC;
  v_product RECORD;
  v_rec RECORD;
  v_stock_returned INT := 0;
  v_waste_recorded INT := 0;
  v_session_id uuid;
  v_corr uuid := gen_random_uuid();
  v_key text;
  v_id uuid;
  v_prod_found boolean := false;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;
  IF v_order.status != 'paid' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Can only refund paid orders. Current: ' || v_order.status);
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

  INSERT INTO public.payments (
    order_id, payment_method, amount, status, is_refund,
    performed_by, performed_by_name, notes, metadata
  ) VALUES (
    p_order_id, p_method, -ABS(v_refund_amount), 'refunded', true,
    p_performed_by, v_performer_name, p_reason_text,
    jsonb_build_object(
      'reason', p_reason,
      'reason_text', p_reason_text,
      'item_fate', p_item_fate,
      'order_item_id', p_order_item_id,
      'quantity', v_refund_qty
    )
  );

  v_new_paid := GREATEST(0, COALESCE(v_order.paid_amount, 0) - v_refund_amount);

  UPDATE public.orders SET
    paid_amount = v_new_paid,
    refund_amount = v_new_refund,
    refund_reason = p_reason_text,
    refunded_at = v_now,
    updated_at = v_now,
    version = COALESCE(version, 0) + 1
  WHERE id = p_order_id;

  IF v_new_paid <= 0 THEN
    UPDATE public.orders SET status = 'refunded' WHERE id = p_order_id;
  END IF;

  SELECT * INTO v_product FROM public.products WHERE id = v_oi.product_id;
  IF FOUND THEN
    v_prod_found := true;
  END IF;

  IF p_item_fate = 'return_to_stock' THEN
    IF EXISTS (
      SELECT 1 FROM public.inventory_logs
      WHERE order_item_id = p_order_item_id AND type IN ('reversal', 'stock_return')
    ) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Stock already returned for this item');
    END IF;

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
      IF v_id IS NOT NULL THEN v_stock_returned := 1; END IF;

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
        IF v_id IS NOT NULL THEN v_stock_returned := 1; END IF;
      END LOOP;
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

    -- H8: waste fate now writes canonical waste ledger rows for the
    -- refunded quantity (already consumed at READY, now recorded as waste).
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
      IF v_id IS NOT NULL THEN v_waste_recorded := 1; END IF;

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
        IF v_id IS NOT NULL THEN v_waste_recorded := 1; END IF;
      END LOOP;
    END IF;
  END IF;

  IF v_refund_qty >= v_oi.quantity THEN
    UPDATE public.order_items SET kitchen_status = 'voided', total_price = 0 WHERE id = p_order_item_id;
  ELSE
    UPDATE public.order_items SET
      quantity = v_oi.quantity - v_refund_qty,
      total_price = COALESCE(unit_price, 0) * (v_oi.quantity - v_refund_qty)
    WHERE id = p_order_item_id;
  END IF;

  UPDATE public.orders SET
    total_amount = GREATEST(0, (SELECT COALESCE(SUM(total_price), 0) FROM public.order_items WHERE order_id = p_order_id AND kitchen_status != 'voided'))
  WHERE id = p_order_id;

  PERFORM public.log_audit(
    'refund_with_inventory', 'order', p_order_id::text,
    p_performed_by, v_performer_name,
    jsonb_build_object('paid_amount', v_order.paid_amount, 'status', v_order.status),
    jsonb_build_object(
      'refund_amount', v_refund_amount,
      'refund_qty', v_refund_qty,
      'item_fate', p_item_fate,
      'product_name', v_oi.product_name,
      'stock_returned', v_stock_returned,
      'waste_recorded', v_waste_recorded,
      'new_paid_amount', v_new_paid
    ),
    jsonb_build_object('order_id', p_order_id, 'order_item_id', p_order_item_id),
    NULL
  );

  RETURN jsonb_build_object(
    'success', true,
    'action', 'refund_with_inventory',
    'refund_amount', v_refund_amount,
    'quantity_refunded', v_refund_qty,
    'item_fate', p_item_fate,
    'stock_returned', v_stock_returned > 0,
    'waste_recorded', v_waste_recorded > 0,
    'new_paid_amount', v_new_paid,
    'new_status', CASE WHEN v_new_paid <= 0 THEN 'refunded' ELSE v_order.status END,
    'order_id', p_order_id,
    'timestamp', v_now
  );
END;
$function$;