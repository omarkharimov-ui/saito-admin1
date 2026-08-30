CREATE OR REPLACE FUNCTION public.void_order_item_atomic (
  p_order_item_id            uuid,
  p_reason                   text DEFAULT 'void'::text,
  p_performed_by             uuid DEFAULT NULL::uuid,
  p_performed_by_terminal_id text DEFAULT NULL::text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  AS $function$
  DECLARE
  v_item RECORD;
  v_order RECORD;
  v_tx RECORD;
  v_new_total NUMERIC := 0;
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

  IF v_item.kitchen_status = 'cancelled' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Item already voided');
  END IF;

  UPDATE public.order_items SET
    kitchen_status = 'cancelled',
    updated_at = NOW()
  WHERE id = p_order_item_id;

  FOR v_tx IN 
    SELECT * FROM public.inventory_transactions 
    WHERE order_item_id = p_order_item_id AND transaction_type = 'order_consumption'
    FOR UPDATE
  LOOP
    INSERT INTO public.inventory_transactions (
      order_item_id, ingredient_id, quantity, unit, transaction_type,
      reference_type, reference_id, performed_by, created_at
    ) VALUES (
      v_tx.order_item_id, v_tx.ingredient_id, -v_tx.quantity, v_tx.unit, 'reversal',
      v_tx.reference_type, v_tx.reference_id, p_performed_by, NOW()
    );
  END LOOP;

  SELECT COALESCE(SUM(total_price), 0) INTO v_new_total FROM public.order_items WHERE order_id = v_order.id AND kitchen_status != 'cancelled';

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
    jsonb_build_object('item_id', p_order_item_id, 'kitchen_status', 'cancelled', 'reason', p_reason, 'order_total', v_new_total),
    p_performed_by
  );

  RETURN jsonb_build_object('success', true, 'new_order_total', v_new_total);
END;
$function$;



