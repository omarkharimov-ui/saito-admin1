-- rollback_inventory_atomic: rollback inventory for an order (reversal transactions)
CREATE OR REPLACE FUNCTION public.rollback_inventory_atomic(
  p_order_id UUID,
  p_performed_by UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tx RECORD;
  v_rolled_back INT := 0;
BEGIN
  FOR v_tx IN 
    SELECT * FROM public.inventory_transactions 
    WHERE reference_id = p_order_id AND reference_type = 'order' AND transaction_type = 'order_consumption'
    FOR UPDATE
  LOOP
    INSERT INTO public.inventory_transactions (
      order_item_id, ingredient_id, quantity, unit, transaction_type,
      reference_type, reference_id, performed_by, created_at
    ) VALUES (
      v_tx.order_item_id, v_tx.ingredient_id, -v_tx.quantity, v_tx.unit, 'reversal',
      v_tx.reference_type, v_tx.reference_id, p_performed_by, NOW()
    );
    v_rolled_back := v_rolled_back + 1;
  END LOOP;

  INSERT INTO public.operation_logs (
    order_id, action, new_values, performed_by
  ) VALUES (
    p_order_id, 'rollback_inventory',
    jsonb_build_object('rolled_back_items', v_rolled_back),
    p_performed_by
  );

  RETURN jsonb_build_object('success', true, 'rolled_back_items', v_rolled_back);
END;
$$;
