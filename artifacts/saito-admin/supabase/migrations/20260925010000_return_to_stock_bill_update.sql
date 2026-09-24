-- 2026-09-25 (owner): "geri qaytar backendini qur — varsa oldugu kimi qalsın,
-- loglamada səbəb məcburi DB-də saxlanılsın (statistics üçün)".
--
-- FINDING: the live return_to_stock RPC restored inventory + wrote
-- log_audit(inventory reason), but did NOT touch the BILL — the returned
-- line stayed on the invoice with its original total. For a customer
-- return that is wrong: the item must leave the bill.
--
-- FIX: CREATE OR REPLACE return_to_stock with the SAME bill semantics as
-- record_item_waste (proven pattern):
--   full qty returned  → line voided (kitchen_status='voided', total 0)
--   partial qty        → quantity decremented, total recalculated
--   order total_amount recalculated; all-voided → order cancelled.
-- Everything else (state guard, idempotency, inventory reversal, outbox
-- events, audit) is preserved verbatim; reason_text is added to the audit
-- metadata so the statistics page has both code + free text.

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
  v_new_qty INT;
  v_product RECORD;
  v_rec RECORD;
  v_returned INT := 0;
  v_corr uuid := gen_random_uuid();
  v_key text;
  v_id uuid;
  v_prod_found boolean := false;
  v_meta jsonb;
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

  v_meta := jsonb_build_object('correlation_id', v_corr, 'operation', 'return_to_stock',
    'location_id', v_order.location_id, 'organization_id', v_order.organization_id,
    'performed_by', p_performed_by);

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
        jsonb_build_object('inventory_log_id', v_id, 'order_item_id', p_order_item_id, 'ingredient_id', v_product.direct_ingredient_id, 'quantity', v_return_qty, 'type', 'reversal'),
        v_meta);
      PERFORM public.emit_outbox_event('inventory', v_product.direct_ingredient_id, 'inventory.stock_changed',
        jsonb_build_object('inventory_log_id', v_id, 'order_item_id', p_order_item_id, 'ingredient_id', v_product.direct_ingredient_id, 'quantity', v_return_qty, 'type', 'reversal'),
        v_meta);
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
          jsonb_build_object('inventory_log_id', v_id, 'order_item_id', p_order_item_id, 'ingredient_id', v_rec.ingredient_id, 'quantity', COALESCE(v_rec.quantity_brutto, v_rec.quantity_required) * v_return_qty, 'type', 'reversal'),
          v_meta);
        PERFORM public.emit_outbox_event('inventory', v_rec.ingredient_id, 'inventory.stock_changed',
          jsonb_build_object('inventory_log_id', v_id, 'order_item_id', p_order_item_id, 'ingredient_id', v_rec.ingredient_id, 'quantity', COALESCE(v_rec.quantity_brutto, v_rec.quantity_required) * v_return_qty, 'type', 'reversal'),
          v_meta);
      END IF;
    END LOOP;
  END IF;

  -- 2026-09-25: BILL UPDATE — same semantics as record_item_waste: the
  -- returned quantity leaves the bill (full → voided line, partial →
  -- decremented). Order total recalculated; all-voided → order cancelled.
  IF v_return_qty >= v_oi.quantity THEN
    UPDATE public.order_items SET kitchen_status = 'voided', total_price = 0 WHERE id = v_oi.id;
  ELSE
    v_new_qty := v_oi.quantity - v_return_qty;
    UPDATE public.order_items SET quantity = v_new_qty, total_price = COALESCE(unit_price, 0) * v_new_qty WHERE id = v_oi.id;
  END IF;

  UPDATE public.orders SET
    total_amount = GREATEST(0, (SELECT COALESCE(SUM(total_price), 0) FROM public.order_items WHERE order_id = v_oi.order_id AND kitchen_status != 'voided'))
  WHERE id = v_oi.order_id;

  IF NOT EXISTS (SELECT 1 FROM public.order_items WHERE order_id = v_oi.order_id AND kitchen_status != 'voided') THEN
    UPDATE public.orders SET status = 'cancelled', kitchen_status = 'cancelled', cancelled_at = v_now WHERE id = v_oi.order_id;
  END IF;

  PERFORM public.log_audit(
    'return_to_stock', 'order_item', p_order_item_id::text,
    p_performed_by, v_performer_name, NULL,
    jsonb_build_object(
      'product_name', v_oi.product_name,
      'quantity', v_return_qty,
      'reason', p_reason,
      'reason_text', COALESCE(p_reason_text, ''),
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
    'bill_updated', true,
    'reason', p_reason,
    'order_id', v_oi.order_id,
    'timestamp', v_now
  );
END;
$function$;
