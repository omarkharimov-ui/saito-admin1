-- complete_payment_atomic: finalize payment, mark order paid, deduct inventory, log operation
CREATE OR REPLACE FUNCTION public.complete_payment_atomic(
  p_order_id UUID,
  p_payments JSONB,
  p_payment_method TEXT DEFAULT 'cash',
  p_cash_amount NUMERIC DEFAULT 0,
  p_card_amount NUMERIC DEFAULT 0,
  p_tip_amount NUMERIC DEFAULT 0,
  p_discount_amount NUMERIC DEFAULT 0,
  p_discount_type TEXT DEFAULT NULL,
  p_performed_by UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order RECORD;
  v_result JSONB;
  v_payment JSONB;
  v_total_paid NUMERIC := 0;
  v_new_status TEXT := 'paid';
BEGIN
  -- 1. Lock order row
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;

  IF v_order.status = 'paid' THEN
    RETURN jsonb_build_object('success', true, 'message', 'Already paid');
  END IF;

  IF v_order.status = 'cancelled' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot pay cancelled order');
  END IF;

  -- 2. Insert payments
  FOR v_payment IN SELECT * FROM jsonb_array_elements(p_payments) LOOP
    INSERT INTO public.order_payments (
      order_id, method, amount, currency, status, split_group_id, is_partial, is_refund, created_by
    ) VALUES (
      p_order_id,
      COALESCE(v_payment->>'method', 'cash'),
      COALESCE((v_payment->>'amount')::NUMERIC, 0),
      COALESCE(v_payment->>'currency', 'AZN'),
      COALESCE(v_payment->>'status', 'success'),
      (v_payment->>'split_group_id')::UUID,
      COALESCE(v_payment->>'is_partial', false),
      COALESCE(v_payment->>'is_refund', false),
      p_performed_by
    );
    v_total_paid := v_total_paid + COALESCE((v_payment->>'amount')::NUMERIC, 0);
  END LOOP;

  -- 3. Update order totals
  UPDATE public.orders SET
    paid_amount = v_total_paid,
    cash_amount = p_cash_amount,
    card_amount = p_card_amount,
    tip_amount = p_tip_amount,
    discount_amount = p_discount_amount,
    discount_type = p_discount_type,
    payment_method = p_payment_method,
    status = CASE WHEN v_total_paid >= (v_order.total_amount - COALESCE(p_discount_amount, 0)) THEN 'paid' ELSE v_order.status END,
    paid_at = CASE WHEN v_total_paid >= (v_order.total_amount - COALESCE(p_discount_amount, 0)) THEN NOW() ELSE v_order.paid_at END,
    version = COALESCE(v_order.version, 0) + 1,
    updated_at = NOW()
  WHERE id = p_order_id;

  -- 4. Deduct inventory if fully paid
  IF v_total_paid >= (v_order.total_amount - COALESCE(p_discount_amount, 0)) THEN
    PERFORM public.deduct_stock_for_order(p_order_id);
  END IF;

  -- 5. Operation log
  INSERT INTO public.operation_logs (
    table_number, order_id, action, old_values, new_values, performed_by
  ) VALUES (
    v_order.table_number,
    p_order_id,
    'complete_payment',
    jsonb_build_object('status', v_order.status, 'paid_amount', v_order.paid_amount),
    jsonb_build_object('status', 'paid', 'paid_amount', v_total_paid),
    p_performed_by
  );

  RETURN jsonb_build_object('success', true, 'order_id', p_order_id, 'paid_amount', v_total_paid);
END;
$$;
