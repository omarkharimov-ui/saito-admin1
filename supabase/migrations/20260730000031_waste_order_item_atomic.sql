-- waste_order_item_atomic: mark order item as waste, rollback inventory
CREATE OR REPLACE FUNCTION public.waste_order_item_atomic(
  p_order_item_id UUID,
  p_reason TEXT DEFAULT 'waste',
  p_performed_by UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_item RECORD;
  v_order RECORD;
  v_tx RECORD;
BEGIN
  SELECT * INTO v_item FROM public.order_items WHERE id = p_order_item_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order item not found');
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = v_item.order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;

  UPDATE public.order_items SET
    kitchen_status = 'wasted',
    updated_at = NOW()
  WHERE id = p_order_item_id;

  -- Rollback inventory
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

  INSERT INTO public.operation_logs (
    table_number, order_id, action, old_values, new_values, performed_by
  ) VALUES (
    v_order.table_number, v_order.id, 'waste_order_item',
    jsonb_build_object('item_id', p_order_item_id, 'kitchen_status', v_item.kitchen_status),
    jsonb_build_object('item_id', p_order_item_id, 'kitchen_status', 'wasted', 'reason', p_reason),
    p_performed_by
  );

  RETURN jsonb_build_object('success', true);
END;
$$;
