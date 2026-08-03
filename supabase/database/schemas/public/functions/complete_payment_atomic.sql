CREATE FUNCTION public.complete_payment_atomic (
  p_order_id                 uuid,
  p_payments                 jsonb,
  p_payment_method           text    DEFAULT 'cash'::text,
  p_cash_amount              numeric DEFAULT 0,
  p_card_amount              numeric DEFAULT 0,
  p_tip_amount               numeric DEFAULT 0,
  p_discount_amount          numeric DEFAULT 0,
  p_discount_type            text    DEFAULT NULL::text,
  p_performed_by             uuid    DEFAULT NULL::uuid,
  p_performed_by_terminal_id text    DEFAULT NULL::text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  AS $function$
DECLARE
  v_order RECORD;
  v_payment JSONB;
  v_total_paid NUMERIC := 0;
  v_table RECORD;
  v_other_active_count INT;
BEGIN
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

  FOR v_payment IN SELECT * FROM jsonb_array_elements(p_payments) LOOP
    INSERT INTO public.order_payments (
      order_id, payment_method, method, amount, currency, status,
      split_group_id, is_partial, is_refund, created_by
    ) VALUES (
      p_order_id,
      COALESCE(v_payment->>'method', 'cash'),
      COALESCE(v_payment->>'method', 'cash'),
      COALESCE((v_payment->>'amount')::NUMERIC, 0),
      COALESCE(v_payment->>'currency', 'AZN'),
      COALESCE(v_payment->>'status', 'success'),
      (v_payment->>'split_group_id')::UUID,
      COALESCE((v_payment->>'is_partial')::BOOLEAN, false),
      COALESCE((v_payment->>'is_refund')::BOOLEAN, false),
      p_performed_by
    );
    v_total_paid := v_total_paid + COALESCE((v_payment->>'amount')::NUMERIC, 0);
  END LOOP;

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
    updated_by_terminal_id = p_performed_by_terminal_id,
    updated_at = NOW()
  WHERE id = p_order_id;

  IF v_total_paid >= (v_order.total_amount - COALESCE(p_discount_amount, 0)) THEN
    PERFORM public.deduct_stock_for_order(p_order_id);

    -- Reset table_floors if this was the last active order on the table
    IF v_order.table_number IS NOT NULL AND v_order.table_number > 0 THEN
      SELECT COUNT(*) INTO v_other_active_count FROM public.orders
        WHERE table_number = v_order.table_number
          AND id != p_order_id
          AND status NOT IN ('paid', 'cancelled', 'closed');

      IF v_other_active_count = 0 THEN
        SELECT * INTO v_table FROM public.table_floors WHERE table_number = v_order.table_number FOR UPDATE;
        IF FOUND THEN
          UPDATE public.table_floors SET
            status = 'dirty',
            current_order_id = NULL,
            guest_count = NULL,
            total_amount = 0,
            order_count = 0,
            bill_requested = false,
            kitchen_status = NULL,
            updated_at = NOW()
          WHERE table_number = v_order.table_number;
        END IF;
      END IF;
    END IF;
  END IF;

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
$function$;

GRANT ALL ON FUNCTION public.complete_payment_atomic(uuid, jsonb, text, numeric, numeric, numeric, numeric, text, uuid, text) TO anon;

GRANT ALL ON FUNCTION public.complete_payment_atomic(uuid, jsonb, text, numeric, numeric, numeric, numeric, text, uuid, text) TO authenticated;

GRANT ALL ON FUNCTION public.complete_payment_atomic(uuid, jsonb, text, numeric, numeric, numeric, numeric, text, uuid, text) TO service_role;