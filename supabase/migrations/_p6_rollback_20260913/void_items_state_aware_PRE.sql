CREATE OR REPLACE FUNCTION public.void_items_state_aware(p_order_id text, p_items jsonb, p_performed_by uuid DEFAULT NULL::uuid, p_reason text DEFAULT NULL::text)
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
$function$

