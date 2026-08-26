-- ============================================================
-- record_item_waste — state-aware waste recording
-- ============================================================
-- READY/SERVED item-lər üçün waste qeydi:
--   - Item state yoxlanılır (READY/SERVED olmalıdır)
--   - Stock double-count yoxdur (stock artıq READY-də consume edilib)
--   - cancelled_orders-a waste qeydi yazılır
--   - Audit yazılır
--   - Item order_item silinir və ya quantity azaldılır

CREATE OR REPLACE FUNCTION public.record_item_waste(
  p_order_item_id uuid,
  p_quantity      int DEFAULT NULL,  -- NULL = tam quantity
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
BEGIN
  -- Fetch order item
  SELECT * INTO v_oi FROM public.order_items WHERE id = p_order_item_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order item not found');
  END IF;

  -- Fetch order
  SELECT * INTO v_order FROM public.orders WHERE id = v_oi.order_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;

  -- STATE CHECK: Only READY/SERVED items can be wasted
  IF v_oi.kitchen_status NOT IN ('ready', 'completed', 'served') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Cannot waste item in state: ' || COALESCE(v_oi.kitchen_status, 'pending') || '. Use void for DRAFT/SENT/PREPARING items.',
      'current_state', COALESCE(v_oi.kitchen_status, 'pending')
    );
  END IF;

  -- Get performer name
  IF p_performed_by IS NOT NULL THEN
    SELECT name INTO v_performer_name FROM public.staff WHERE id = p_performed_by;
  END IF;

  -- Determine waste quantity
  v_waste_qty := COALESCE(p_quantity, v_oi.quantity);
  IF v_waste_qty <= 0 OR v_waste_qty > v_oi.quantity THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid waste quantity');
  END IF;

  -- Record in cancelled_orders (waste event — no stock deduction, stock already consumed at READY)
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
      'kitchen_status', v_oi.kitchen_status
    )),
    v_oi.unit_price * v_waste_qty,
    v_now
  );

  -- Delete or reduce the order item
  IF v_waste_qty >= v_oi.quantity THEN
    DELETE FROM public.order_items WHERE id = v_oi.id;
  ELSE
    v_new_qty := v_oi.quantity - v_waste_qty;
    UPDATE public.order_items SET quantity = v_new_qty, total_price = COALESCE(unit_price, 0) * v_new_qty
    WHERE id = v_oi.id;
  END IF;

  -- Recalculate order total
  UPDATE public.orders SET
    total_amount = GREATEST(0, (SELECT COALESCE(SUM(total_price), 0) FROM public.order_items WHERE order_id = v_oi.order_id))
  WHERE id = v_oi.order_id;

  -- If no items remain, cancel the order
  IF NOT EXISTS (SELECT 1 FROM public.order_items WHERE order_id = v_oi.order_id) THEN
    UPDATE public.orders SET status = 'cancelled', kitchen_status = 'cancelled', cancelled_at = v_now WHERE id = v_oi.order_id;
  END IF;

  -- Audit
  PERFORM public.log_audit(
    'item_waste', 'order_item', p_order_item_id::text,
    p_performed_by, v_performer_name,
    NULL,
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
    'success', true,
    'action', 'waste',
    'product_name', v_oi.product_name,
    'quantity_wasted', v_waste_qty,
    'order_id', v_oi.order_id,
    'timestamp', v_now
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.record_item_waste(uuid, int, text, text, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.record_item_waste(uuid, int, text, text, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.record_item_waste(uuid, int, text, text, uuid) FROM authenticated;
