-- ============================================================
-- BUSINESS RULE FIXES: state-aware void, dismiss, stock, QR
-- ============================================================

-- 1. void_items_state_aware — checks kitchen_status before voiding
--    DRAFT items: delete (no stock)
--    SENT/PREPARING items: void (no stock — not consumed yet)
--    READY/SERVED items: BLOCKED — must use waste/loss workflow
CREATE OR REPLACE FUNCTION public.void_items_state_aware(
  p_order_id     text,
  p_items        jsonb,       -- [{ order_item_id, quantity }]
  p_performed_by uuid DEFAULT NULL,
  p_reason       text DEFAULT NULL
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
  v_deleted INT := 0;
  v_blocked TEXT[] := ARRAY[]::text[];
  v_order RECORD;
BEGIN
  IF p_order_id IS NULL OR p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'order_id and items required');
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id::uuid;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;

  -- Only allow void on unpaid/partially-paid orders
  IF v_order.status IN ('paid', 'closed', 'refunded') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot void paid/closed/refunded orders');
  END IF;

  IF p_performed_by IS NOT NULL THEN
    SELECT name INTO v_performer_name FROM public.staff WHERE id = p_performed_by;
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    SELECT * INTO v_oi FROM public.order_items WHERE id = (v_item->>'order_item_id')::uuid;
    IF NOT FOUND THEN CONTINUE; END IF;

    -- STATE CHECK: READY/SERVED items cannot be voided
    IF v_oi.kitchen_status IN ('ready', 'completed', 'served') THEN
      v_blocked := array_append(v_blocked,
        v_oi.product_name || ' (kitchen_status=' || COALESCE(v_oi.kitchen_status, 'pending') || ')'
      );
      CONTINUE;
    END IF;

    -- DRAFT (pending) items: just delete — no stock impact
    IF v_oi.kitchen_status IS NULL OR v_oi.kitchen_status = 'pending' THEN
      DELETE FROM public.order_items WHERE id = v_oi.id;
      v_deleted := v_deleted + 1;
    ELSE
      -- SENT/PREPARING/ACCEPTED items: void — no stock reverse (stock not consumed yet)
      IF (v_item->>'quantity')::int >= v_oi.quantity THEN
        DELETE FROM public.order_items WHERE id = v_oi.id;
      ELSE
        v_new_qty := v_oi.quantity - (v_item->>'quantity')::int;
        UPDATE public.order_items SET quantity = v_new_qty, total_price = COALESCE(unit_price, 0) * v_new_qty
        WHERE id = v_oi.id;
      END IF;
      v_voided := v_voided + 1;
    END IF;
  END LOOP;

  -- If any items were blocked, return error
  IF array_length(v_blocked, 1) > 0 AND v_voided = 0 AND v_deleted = 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'All items are in READY/SERVED state — use waste/loss workflow instead',
      'blocked_items', to_jsonb(v_blocked)
    );
  END IF;

  -- Record in cancelled_orders
  INSERT INTO public.cancelled_orders (order_id, reason, reason_text, items, created_at)
  VALUES (p_order_id::uuid, 'void', COALESCE(p_reason, 'Ləğv edildi'), p_items, v_now);

  -- Recalculate order total
  UPDATE public.orders SET
    total_amount = GREATEST(0, (SELECT COALESCE(SUM(total_price), 0) FROM public.order_items WHERE order_id = p_order_id::uuid)),
    kitchen_status = CASE
      WHEN NOT EXISTS (SELECT 1 FROM public.order_items WHERE order_id = p_order_id::uuid)
        THEN 'cancelled'
      ELSE 'pending'
    END
  WHERE id = p_order_id::uuid;

  -- If no items remain, cancel the order entirely
  IF NOT EXISTS (SELECT 1 FROM public.order_items WHERE order_id = p_order_id::uuid) THEN
    UPDATE public.orders SET status = 'cancelled', kitchen_status = 'cancelled', cancelled_at = v_now WHERE id = p_order_id::uuid;
  END IF;

  -- Audit
  PERFORM public.log_audit(
    'void_items', 'order', p_order_id,
    p_performed_by, v_performer_name,
    NULL,
    jsonb_build_object('items', p_items, 'reason', p_reason, 'deleted', v_deleted, 'voided', v_voided, 'blocked', array_length(v_blocked, 1)),
    jsonb_build_object('order_id', p_order_id),
    NULL
  );

  RETURN jsonb_build_object(
    'success', true,
    'action', 'void',
    'deleted_items', v_deleted,
    'voided_items', v_voided,
    'blocked_items', to_jsonb(v_blocked),
    'order_id', p_order_id,
    'timestamp', v_now
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.void_items_state_aware(text, jsonb, uuid, text) TO service_role;
REVOKE ALL ON FUNCTION public.void_items_state_aware(text, jsonb, uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.void_items_state_aware(text, jsonb, uuid, text) FROM authenticated;


-- 2. dismiss_table_state_aware — item-state-aware table dismiss
--    DRAFT items: delete
--    SENT/PREPARING items: cancel (no stock)
--    READY/SERVED items: record as waste (stock already consumed)
--    Paid items: require refund workflow separately
CREATE OR REPLACE FUNCTION public.dismiss_table_state_aware(
  p_table_number int,
  p_performed_by uuid DEFAULT NULL,
  p_reason       text DEFAULT 'dismissed_from_pos'
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
  v_deleted INT := 0;
  v_voided INT := 0;
  v_wasted INT := 0;
  v_paid_skipped INT := 0;
  v_order_ids uuid[] := ARRAY[]::uuid[];
BEGIN
  IF p_performed_by IS NOT NULL THEN
    SELECT name INTO v_performer_name FROM public.staff WHERE id = p_performed_by;
  END IF;

  -- Find all active orders for this table
  FOR v_order IN
    SELECT id, status FROM public.orders
    WHERE table_number = p_table_number
      AND status NOT IN ('paid', 'closed', 'refunded', 'cancelled')
  LOOP
    v_order_ids := array_append(v_order_ids, v_order.id);

    FOR v_item IN
      SELECT id, kitchen_status, quantity, product_name, unit_price, total_price
      FROM public.order_items WHERE order_id = v_order.id
    LOOP
      -- DRAFT items: delete silently
      IF v_item.kitchen_status IS NULL OR v_item.kitchen_status = 'pending' THEN
        DELETE FROM public.order_items WHERE id = v_item.id;
        v_deleted := v_deleted + 1;

      -- SENT/PREPARING/ACCEPTED: void (no stock reverse)
      ELSIF v_item.kitchen_status IN ('sent', 'preparing', 'accepted') THEN
        DELETE FROM public.order_items WHERE id = v_item.id;
        v_voided := v_voided + 1;

      -- READY/SERVED/COMPLETED: record as waste (stock was already consumed)
      ELSIF v_item.kitchen_status IN ('ready', 'completed', 'served') THEN
        INSERT INTO public.cancelled_orders (order_id, reason, reason_text, items, created_at)
        VALUES (
          v_order.id, 'waste',
          'Dismiss — item was ' || v_item.kitchen_status,
          jsonb_build_array(jsonb_build_object(
            'order_item_id', v_item.id,
            'product_name', v_item.product_name,
            'quantity', v_item.quantity,
            'kitchen_status', v_item.kitchen_status,
            'unit_price', v_item.unit_price
          )),
          v_now
        );
        DELETE FROM public.order_items WHERE id = v_item.id;
        v_wasted := v_wasted + 1;
      END IF;
    END LOOP;

    -- Cancel the order
    UPDATE public.orders SET
      status = 'cancelled',
      kitchen_status = 'cancelled',
      total_amount = 0,
      cancelled_at = v_now
    WHERE id = v_order.id;

    -- Audit per order
    PERFORM public.log_audit(
      'dismiss_table', 'order', v_order.id::text,
      p_performed_by, v_performer_name,
      NULL,
      jsonb_build_object('table_number', p_table_number, 'reason', p_reason,
        'deleted', v_deleted, 'voided', v_voided, 'wasted', v_wasted),
      jsonb_build_object('order_id', v_order.id),
      NULL
    );
  END LOOP;

  -- Mark table as empty
  UPDATE public.table_floors SET status = 'empty', current_order_id = NULL, total_amount = 0, guest_count = 0
  WHERE table_number = p_table_number AND status != 'empty';

  RETURN jsonb_build_object(
    'success', true,
    'table_number', p_table_number,
    'deleted_items', v_deleted,
    'voided_items', v_voided,
    'wasted_items', v_wasted,
    'orders_cancelled', array_length(v_order_ids, 1),
    'order_ids', to_jsonb(v_order_ids),
    'timestamp', v_now
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.dismiss_table_state_aware(int, uuid, text) TO service_role;
REVOKE ALL ON FUNCTION public.dismiss_table_state_aware(int, uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.dismiss_table_state_aware(int, uuid, text) FROM authenticated;


-- 3. Add QR to payment_methods (canonical, single entry)
INSERT INTO public.payment_methods (key, display_name, display_name_az, icon, is_active, allows_split, allows_refund, allows_tip, sort_order)
VALUES ('qr', 'QR Code', 'QR Kod', 'QrCode', true, true, true, false, 3)
ON CONFLICT (key) DO NOTHING;
