-- reopen_order_atomic: reopen paid/completed order, rollback inventory and payments
CREATE OR REPLACE FUNCTION public.reopen_order_atomic(
  p_order_id UUID,
  p_reason TEXT DEFAULT 'reopen',
  p_performed_by UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order RECORD;
  v_tx RECORD;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;

  IF v_order.status NOT IN ('paid', 'completed') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order is not paid/completed');
  END IF;

  -- Rollback inventory transactions
  FOR v_tx IN SELECT * FROM public.inventory_transactions WHERE reference_id = p_order_id AND reference_type = 'order' LOOP
    INSERT INTO public.inventory_transactions (
      order_item_id, ingredient_id, quantity, unit, transaction_type, reference_type, reference_id, performed_by
    ) VALUES (
      v_tx.order_item_id,
      v_tx.ingredient_id,
      -v_tx.quantity,
      v_tx.unit,
      'reversal',
      v_tx.reference_type,
      v_tx.reference_id,
      p_performed_by
    );
  END LOOP;

  -- Clear payments
  DELETE FROM public.order_payments WHERE order_id = p_order_id;

  -- Reopen order
  UPDATE public.orders SET
    status = 'new',
    paid_amount = 0,
    cash_amount = 0,
    card_amount = 0,
    tip_amount = 0,
    paid_at = NULL,
    updated_at = NOW()
  WHERE id = p_order_id;

  INSERT INTO public.operation_logs (
    table_number, order_id, action, old_values, new_values, performed_by
  ) VALUES (
    v_order.table_number,
    p_order_id,
    'reopen_order',
    jsonb_build_object('status', v_order.status),
    jsonb_build_object('status', 'new', 'reason', p_reason),
    p_performed_by
  );

  RETURN jsonb_build_object('success', true);
END;
$$;
