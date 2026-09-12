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
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
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

  RETURN jsonb_build_object(
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
END;
$function$

