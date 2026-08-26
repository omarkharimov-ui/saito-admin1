-- ============================================================
-- refund_with_inventory: refund + item fate (return_to_stock / waste)
-- Atomic, idempotent, state-aware
-- ============================================================

CREATE OR REPLACE FUNCTION public.refund_with_inventory(
  p_order_id        uuid,
  p_order_item_id   uuid,
  p_quantity        int,
  p_amount          numeric,
  p_method          text DEFAULT 'cash',
  p_item_fate       text DEFAULT 'waste',       -- 'return_to_stock' or 'waste'
  p_reason          text DEFAULT NULL,
  p_reason_text     text DEFAULT NULL,
  p_performed_by    uuid DEFAULT NULL
)
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
BEGIN
  -- ============================================================
  -- VALIDATIONS
  -- ============================================================

  -- Order exists and is PAID
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;
  IF v_order.status != 'paid' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Can only refund paid orders. Current: ' || v_order.status);
  END IF;

  -- Order item exists and is READY/SERVED
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

  -- Quantity validation
  v_refund_qty := COALESCE(p_quantity, 1);
  IF v_refund_qty <= 0 OR v_refund_qty > v_oi.quantity THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid refund quantity. Max: ' || v_oi.quantity);
  END IF;

  -- Amount validation
  v_refund_amount := COALESCE(p_amount, v_oi.unit_price * v_refund_qty);
  IF v_refund_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid refund amount');
  END IF;

  -- Refund amount cannot exceed remaining refundable
  v_new_refund := COALESCE(v_order.refund_amount, 0) + v_refund_amount;
  IF v_new_refund > COALESCE(v_order.paid_amount, 0) THEN
    RETURN jsonb_build_object('success', false, 'error',
      'Refund (' || v_refund_amount || ') exceeds remaining refundable (' ||
      ROUND(COALESCE(v_order.paid_amount, 0) - COALESCE(v_order.refund_amount, 0), 2) || ')');
  END IF;

  -- Item fate validation
  IF p_item_fate NOT IN ('return_to_stock', 'waste') THEN
    RETURN jsonb_build_object('success', false, 'error', 'item_fate must be return_to_stock or waste');
  END IF;

  -- Performer
  IF p_performed_by IS NOT NULL THEN
    SELECT name INTO v_performer_name FROM public.staff WHERE id = p_performed_by;
  END IF;

  -- ============================================================
  -- 1. RECORD REFUND PAYMENT
  -- ============================================================

  INSERT INTO public.payments (
    order_id, payment_method, amount, status, is_refund,
    performed_by, performed_by_name, notes, metadata
  ) VALUES (
    p_order_id, p_method, -ABS(v_refund_amount), 'refunded', true,
    p_performed_by, p_performer_name, p_reason_text,
    jsonb_build_object(
      'reason', p_reason,
      'reason_text', p_reason_text,
      'item_fate', p_item_fate,
      'order_item_id', p_order_item_id,
      'quantity', v_refund_qty
    )
  );

  -- ============================================================
  -- 2. UPDATE ORDER PAYMENT STATE
  -- ============================================================

  v_new_paid := GREATEST(0, COALESCE(v_order.paid_amount, 0) - v_refund_amount);

  UPDATE public.orders SET
    paid_amount = v_new_paid,
    refund_amount = v_new_refund,
    refund_reason = p_reason_text,
    refunded_at = v_now,
    updated_at = v_now,
    version = COALESCE(version, 0) + 1
  WHERE id = p_order_id;

  -- If fully refunded, mark order as refunded
  IF v_new_paid <= 0 THEN
    UPDATE public.orders SET status = 'refunded' WHERE id = p_order_id;
  END IF;

  -- ============================================================
  -- 3. ITEM FATE: RETURN TO STOCK or WASTE
  -- ============================================================

  IF p_item_fate = 'return_to_stock' THEN
    -- Reverse inventory consumption: stock +quantity
    -- Idempotent: check if already returned
    IF EXISTS (
      SELECT 1 FROM public.inventory_logs
      WHERE type = 'stock_return' AND order_item_id = p_order_item_id
    ) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Stock already returned for this item');
    END IF;

    SELECT * INTO v_product FROM public.products WHERE id = v_oi.product_id;

    IF v_product IS NOT NULL AND v_product.is_ready_product AND v_product.direct_ingredient_id IS NOT NULL THEN
      -- Ready product: reverse direct ingredient
      INSERT INTO public.inventory_logs (
        ingredient_id, type, quantity, order_id, order_item_id,
        item_quantity, reference_type, reference_id, reason, created_at
      ) VALUES (
        v_product.direct_ingredient_id, 'stock_return', v_refund_qty,
        p_order_id, p_order_item_id, v_refund_qty,
        'order', p_order_id,
        'Refund — return to stock: ' || COALESCE(v_oi.product_name, 'Məhsul'),
        v_now
      );
      v_stock_returned := 1;

    ELSIF v_product IS NOT NULL THEN
      -- Recipe product: reverse each ingredient
      FOR v_rec IN
        SELECT r.ingredient_id, r.quantity_required, r.quantity_brutto,
               COALESCE(i.unit, 'gram') as unit
        FROM public.recipes r
        JOIN public.ingredients i ON i.id = r.ingredient_id
        WHERE r.menu_item_id = v_oi.product_id AND r.is_ai_suggested = false
      LOOP
        INSERT INTO public.inventory_logs (
          ingredient_id, type, quantity, order_id, order_item_id,
          item_quantity, reference_type, reference_id, reason, created_at
        ) VALUES (
          v_rec.ingredient_id, 'stock_return',
          COALESCE(v_rec.quantity_brutto, v_rec.quantity_required) * v_refund_qty,
          p_order_id, p_order_item_id, v_refund_qty,
          'order', p_order_id,
          'Refund — return to stock: ' || COALESCE(v_oi.product_name, 'Məhsul'),
          v_now
        );
      END LOOP;
      v_stock_returned := 1;
    END IF;

  ELSIF p_item_fate = 'waste' THEN
    -- Record waste (no stock change — already consumed at READY)
    -- Idempotent: check if already wasted
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
      p_order_id, 'refund_waste',
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
    v_waste_recorded := 1;
  END IF;

  -- ============================================================
  -- 4. SOFT-DELETE ITEM (mark as refunded)
  -- ============================================================

  IF v_refund_qty >= v_oi.quantity THEN
    UPDATE public.order_items SET kitchen_status = 'voided', total_price = 0 WHERE id = p_order_item_id;
  ELSE
    UPDATE public.order_items SET
      quantity = v_oi.quantity - v_refund_qty,
      total_price = COALESCE(unit_price, 0) * (v_oi.quantity - v_refund_qty)
    WHERE id = p_order_item_id;
  END IF;

  -- ============================================================
  -- 5. RECALCULATE ORDER TOTAL
  -- ============================================================

  UPDATE public.orders SET
    total_amount = GREATEST(0, (SELECT COALESCE(SUM(total_price), 0) FROM public.order_items WHERE order_id = p_order_id AND kitchen_status != 'voided'))
  WHERE id = p_order_id;

  -- ============================================================
  -- 6. AUDIT
  -- ============================================================

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

GRANT EXECUTE ON FUNCTION public.refund_with_inventory(uuid, uuid, int, numeric, text, text, text, text, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.refund_with_inventory(uuid, uuid, int, numeric, text, text, text, text, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.refund_with_inventory(uuid, uuid, int, numeric, text, text, text, text, uuid) FROM authenticated;


-- ============================================================
-- return_to_stock: standalone inventory return
-- For cases where refund is not needed, just stock return
-- ============================================================

CREATE OR REPLACE FUNCTION public.return_to_stock(
  p_order_item_id uuid,
  p_quantity      int DEFAULT NULL,
  p_reason        text DEFAULT 'return_to_stock',
  p_reason_text   text DEFAULT NULL,
  p_performed_by  uuid DEFAULT NULL
)
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
BEGIN
  SELECT * INTO v_oi FROM public.order_items WHERE id = p_order_item_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order item not found');
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = v_oi.order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;

  -- Only READY/SERVED items can be returned
  IF v_oi.kitchen_status NOT IN ('ready', 'completed', 'served') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot return item in state: ' || COALESCE(v_oi.kitchen_status, 'pending'));
  END IF;

  -- Idempotent: check if already returned
  IF EXISTS (
    SELECT 1 FROM public.inventory_logs
    WHERE type = 'stock_return' AND order_item_id = p_order_item_id
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

  -- Ready product
  IF v_product IS NOT NULL AND v_product.is_ready_product AND v_product.direct_ingredient_id IS NOT NULL THEN
    INSERT INTO public.inventory_logs (
      ingredient_id, type, quantity, order_id, order_item_id,
      item_quantity, reference_type, reference_id, reason, created_at
    ) VALUES (
      v_product.direct_ingredient_id, 'stock_return', v_return_qty,
      v_oi.order_id, p_order_item_id, v_return_qty,
      'order', v_oi.order_id,
      COALESCE(p_reason_text, 'Return to stock: ' || COALESCE(v_oi.product_name, 'Məhsul')),
      v_now
    );
    v_returned := 1;

  -- Recipe product
  ELSIF v_product IS NOT NULL THEN
    FOR v_rec IN
      SELECT r.ingredient_id, r.quantity_required, r.quantity_brutto
      FROM public.recipes r
      WHERE r.menu_item_id = v_oi.product_id AND r.is_ai_suggested = false
    LOOP
      INSERT INTO public.inventory_logs (
        ingredient_id, type, quantity, order_id, order_item_id,
        item_quantity, reference_type, reference_id, reason, created_at
      ) VALUES (
        v_rec.ingredient_id, 'stock_return',
        COALESCE(v_rec.quantity_brutto, v_rec.quantity_required) * v_return_qty,
        v_oi.order_id, p_order_item_id, v_return_qty,
        'order', v_oi.order_id,
        COALESCE(p_reason_text, 'Return to stock: ' || COALESCE(v_oi.product_name, 'Məhsul')),
        v_now
      );
    END LOOP;
    v_returned := 1;
  END IF;

  -- Audit
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

GRANT EXECUTE ON FUNCTION public.return_to_stock(uuid, int, text, text, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.return_to_stock(uuid, int, text, text, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.return_to_stock(uuid, int, text, text, uuid) FROM authenticated;
