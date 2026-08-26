-- ============================================================
-- FOR UPDATE concurrency locks on critical RPCs
-- ============================================================

-- 1. void_items_state_aware: lock order_items row
CREATE OR REPLACE FUNCTION public.void_items_state_aware(
  p_order_id    text,
  p_items       jsonb,
  p_performed_by uuid DEFAULT NULL,
  p_reason      text DEFAULT NULL
)
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
  v_voided INT := 0;
  v_blocked TEXT[] := ARRAY[]::text[];
  v_order RECORD;
BEGIN
  IF p_order_id IS NULL OR p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'order_id and items required');
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id::uuid FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;

  IF v_order.status IN ('paid', 'closed', 'refunded') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot void paid/closed/refunded orders');
  END IF;

  IF p_performed_by IS NOT NULL THEN
    SELECT name INTO v_performer_name FROM public.staff WHERE id = p_performed_by;
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    SELECT * INTO v_oi FROM public.order_items WHERE id = (v_item->>'order_item_id')::uuid FOR UPDATE;
    IF NOT FOUND THEN CONTINUE; END IF;

    IF v_oi.kitchen_status IN ('ready', 'completed', 'served') THEN
      v_blocked := array_append(v_blocked,
        v_oi.product_name || ' (status=' || COALESCE(v_oi.kitchen_status, 'pending') || ')'
      );
      CONTINUE;
    END IF;

    IF (v_item->>'quantity')::int >= v_oi.quantity THEN
      UPDATE public.order_items SET kitchen_status = 'voided', total_price = 0 WHERE id = v_oi.id;
    ELSE
      v_new_qty := v_oi.quantity - (v_item->>'quantity')::int;
      UPDATE public.order_items SET quantity = v_new_qty, total_price = COALESCE(unit_price, 0) * v_new_qty WHERE id = v_oi.id;
    END IF;

    v_voided := v_voided + 1;
  END LOOP;

  IF array_length(v_blocked, 1) > 0 AND v_voided = 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'All items are READY/SERVED — use waste workflow instead',
      'blocked_items', to_jsonb(v_blocked)
    );
  END IF;

  INSERT INTO public.cancelled_orders (order_id, reason, reason_text, items, created_at)
  VALUES (p_order_id::uuid, 'void', COALESCE(p_reason, 'Ləğv edildi'), p_items, v_now);

  UPDATE public.orders SET
    total_amount = GREATEST(0, (SELECT COALESCE(SUM(total_price), 0) FROM public.order_items WHERE order_id = p_order_id::uuid AND kitchen_status != 'voided'))
  WHERE id = p_order_id::uuid;

  IF NOT EXISTS (SELECT 1 FROM public.order_items WHERE order_id = p_order_id::uuid AND kitchen_status != 'voided') THEN
    UPDATE public.orders SET status = 'cancelled', kitchen_status = 'cancelled', cancelled_at = v_now WHERE id = p_order_id::uuid;
  END IF;

  PERFORM public.log_audit(
    'void_items', 'order', p_order_id,
    p_performed_by, v_performer_name, NULL,
    jsonb_build_object('items', p_items, 'reason', p_reason, 'voided', v_voided, 'blocked', array_length(v_blocked, 1)),
    jsonb_build_object('order_id', p_order_id), NULL
  );

  RETURN jsonb_build_object(
    'success', true, 'action', 'void',
    'voided_items', v_voided,
    'blocked_items', to_jsonb(v_blocked),
    'order_id', p_order_id, 'timestamp', v_now
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.void_items_state_aware(text, jsonb, uuid, text) TO service_role;
REVOKE ALL ON FUNCTION public.void_items_state_aware(text, jsonb, uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.void_items_state_aware(text, jsonb, uuid, text) FROM authenticated;


-- 2. record_item_waste: lock order_item row
CREATE OR REPLACE FUNCTION public.record_item_waste(
  p_order_item_id uuid,
  p_quantity      int DEFAULT NULL,
  p_reason        text DEFAULT 'waste',
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
  v_waste_qty INT;
  v_new_qty INT;
  v_valid_reasons text[] := ARRAY['customer_return','kitchen_error','burned','spilled','wrong_item','expired','spoilage','other'];
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
    p_reason,
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

GRANT EXECUTE ON FUNCTION public.record_item_waste(uuid, int, text, text, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.record_item_waste(uuid, int, text, text, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.record_item_waste(uuid, int, text, text, uuid) FROM authenticated;


-- 3. mark_item_ready_atomic: lock order_items row
CREATE OR REPLACE FUNCTION public.mark_item_ready_atomic(
  p_order_id    uuid,
  p_item_ids    uuid[] DEFAULT NULL,
  p_performed_by uuid DEFAULT NULL
)
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
      PERFORM public.consume_stock_for_item(v_item_id, p_order_id, v_oi.product_id, v_oi.quantity);
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

GRANT EXECUTE ON FUNCTION public.mark_item_ready_atomic(uuid, uuid[], uuid) TO service_role;
REVOKE ALL ON FUNCTION public.mark_item_ready_atomic(uuid, uuid[], uuid) FROM anon;
REVOKE ALL ON FUNCTION public.mark_item_ready_atomic(uuid, uuid[], uuid) FROM authenticated;


-- 4. dismiss_table_state_aware: lock orders + order_items
CREATE OR REPLACE FUNCTION public.dismiss_table_state_aware(
  p_table_number int,
  p_performed_by uuid DEFAULT NULL,
  p_reason       text DEFAULT NULL
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  v_order RECORD;
  v_item RECORD;
  v_performer_name TEXT;
  v_now TIMESTAMPTZ := NOW();
  v_voided INT := 0;
  v_wasted INT := 0;
  v_paid_skipped INT := 0;
  v_order_ids uuid[] := ARRAY[]::uuid[];
BEGIN
  IF p_performed_by IS NOT NULL THEN
    SELECT name INTO v_performer_name FROM public.staff WHERE id = p_performed_by;
  END IF;

  FOR v_order IN
    SELECT id, status FROM public.orders
    WHERE table_number = p_table_number
      AND status NOT IN ('paid', 'closed', 'refunded', 'cancelled')
    FOR UPDATE
  LOOP
    v_order_ids := array_append(v_order_ids, v_order.id);

    FOR v_item IN
      SELECT id, kitchen_status, quantity, product_name, unit_price, total_price
      FROM public.order_items WHERE order_id = v_order.id FOR UPDATE
    LOOP
      IF v_item.kitchen_status IS NULL OR v_item.kitchen_status IN ('pending', 'accepted', 'sent', 'preparing') THEN
        UPDATE public.order_items SET kitchen_status = 'voided', total_price = 0 WHERE id = v_item.id;
        v_voided := v_voided + 1;

      ELSIF v_item.kitchen_status IN ('ready', 'completed', 'served') THEN
        INSERT INTO public.cancelled_orders (order_id, reason, reason_text, items, created_at)
        VALUES (
          v_order.id, 'waste',
          COALESCE(p_reason, 'Dismiss — item was ' || v_item.kitchen_status),
          jsonb_build_array(jsonb_build_object(
            'order_item_id', v_item.id, 'product_name', v_item.product_name,
            'quantity', v_item.quantity, 'kitchen_status', v_item.kitchen_status,
            'unit_price', v_item.unit_price, 'reason', 'dismiss_waste'
          )),
          v_now
        );
        UPDATE public.order_items SET kitchen_status = 'voided', total_price = 0 WHERE id = v_item.id;
        v_wasted := v_wasted + 1;

      ELSIF v_item.kitchen_status = 'voided' THEN
        CONTINUE;
      END IF;
    END LOOP;

    UPDATE public.orders SET status = 'cancelled', kitchen_status = 'cancelled', cancelled_at = v_now WHERE id = v_order.id;
  END LOOP;

  FOR v_order IN
    SELECT id FROM public.orders WHERE table_number = p_table_number AND status = 'paid'
  LOOP
    v_paid_skipped := v_paid_skipped + 1;
  END LOOP;

  IF p_table_number IS NOT NULL THEN
    UPDATE public.table_floors SET
      status = 'empty', guest_count = NULL, reservation_id = NULL,
      reservation_name = NULL, reservation_phone = NULL, reservation_time = NULL,
      merged_into_table = NULL
    WHERE table_number = p_table_number;
  END IF;

  PERFORM public.log_audit(
    'dismiss_table', 'table', p_table_number::text,
    p_performed_by, v_performer_name, NULL,
    jsonb_build_object(
      'voided_items', v_voided, 'wasted_items', v_wasted,
      'paid_skipped', v_paid_skipped, 'order_ids', to_jsonb(v_order_ids)
    ),
    jsonb_build_object('table_number', p_table_number), NULL
  );

  RETURN jsonb_build_object(
    'success', true, 'action', 'dismiss',
    'voided_items', v_voided, 'wasted_items', v_wasted,
    'paid_orders_skipped', v_paid_skipped,
    'table_number', p_table_number, 'timestamp', v_now
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.dismiss_table_state_aware(int, uuid, text) TO service_role;
REVOKE ALL ON FUNCTION public.dismiss_table_state_aware(int, uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.dismiss_table_state_aware(int, uuid, text) FROM authenticated;
