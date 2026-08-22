-- Fix complete_payment_atomic: reject cancelled orders before any mutation
-- This ensures a cancelled order cannot be paid and resurrected to 'paid'

CREATE FUNCTION public.complete_payment_atomic (
  p_order_id                 uuid,
  p_payments                 jsonb,
  p_payment_method           text,
  p_cash_amount              numeric,
  p_card_amount              numeric,
  p_tip_amount               numeric,
  p_discount_amount          numeric,
  p_discount_type            text,
  p_performed_by             uuid,
  p_performed_by_terminal_id text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
DECLARE
  v_order RECORD;
  v_payment JSONB;
  v_total_paid NUMERIC := 0;
  v_total_refund NUMERIC := 0;
  v_table RECORD;
  v_other_active_count INT;
  v_has_refund BOOLEAN := false;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;

  -- Reject cancelled orders — no payment, no mutation, no audit
  IF v_order.status = 'cancelled' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot pay cancelled order');
  END IF;

  -- Check if any payment is a refund
  FOR v_payment IN SELECT * FROM jsonb_array_elements(p_payments) LOOP
    IF COALESCE((v_payment->>'is_refund')::BOOLEAN, false) THEN
      v_has_refund := true;
    END IF;
  END LOOP;

  IF v_order.status = 'paid' AND NOT v_has_refund THEN
    RETURN jsonb_build_object('success', true, 'message', 'Already paid');
  END IF;

  -- Process refunds on paid orders
  IF v_order.status = 'paid' AND v_has_refund THEN
    FOR v_payment IN SELECT * FROM jsonb_array_elements(p_payments) LOOP
      IF COALESCE((v_payment->>'is_refund')::BOOLEAN, false) THEN
        INSERT INTO public.order_payments (
          order_id, payment_method, method, amount, currency, status,
          split_group_id, is_partial, is_refund, reference_order_id, created_by
        ) VALUES (
          p_order_id,
          COALESCE(v_payment->>'method', 'cash'),
          COALESCE(v_payment->>'method', 'cash'),
          -COALESCE((v_payment->>'amount')::NUMERIC, 0),
          COALESCE(v_payment->>'currency', 'AZN'),
          COALESCE(v_payment->>'status', 'success'),
          (v_payment->>'split_group_id')::UUID,
          COALESCE((v_payment->>'is_partial')::BOOLEAN, false),
          true,
          p_order_id,
          p_performed_by
        );
        v_total_refund := v_total_refund + COALESCE((v_payment->>'amount')::NUMERIC, 0);
      END IF;
    END LOOP;

    UPDATE public.orders SET
      paid_amount = GREATEST(v_order.paid_amount - v_total_refund, 0),
      refund_amount = COALESCE(v_order.refund_amount, 0) + v_total_refund,
      refund_reason = (SELECT (value->>'reason') FROM jsonb_array_elements(p_payments) WHERE (value->>'is_refund')::BOOLEAN LIMIT 1),
      refunded_at = NOW(),
      updated_at = NOW()
    WHERE id = p_order_id;

    INSERT INTO public.operation_logs (
      table_number, order_id, action, old_values, new_values, performed_by
    ) VALUES (
      v_order.table_number,
      p_order_id,
      'refund',
      jsonb_build_object('paid_amount', v_order.paid_amount, 'refund_amount', v_order.refund_amount),
      jsonb_build_object('paid_amount', GREATEST(v_order.paid_amount - v_total_refund, 0), 'refund_amount', COALESCE(v_order.refund_amount, 0) + v_total_refund),
      p_performed_by
    );

    RETURN jsonb_build_object('success', true, 'order_id', p_order_id, 'paid_amount', GREATEST(v_order.paid_amount - v_total_refund, 0), 'refund_amount', v_total_refund);
  END IF;

  -- Normal payment processing
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


-- Overload with cash_drawer_session_id (added later, matches deployed production signature)
CREATE FUNCTION public.complete_payment_atomic (
  p_order_id                 uuid,
  p_payments                 jsonb,
  p_payment_method           text,
  p_cash_amount              numeric,
  p_card_amount              numeric,
  p_tip_amount               numeric,
  p_discount_amount          numeric,
  p_discount_type            text,
  p_performed_by             uuid,
  p_performed_by_terminal_id text,
  p_cash_drawer_session_id   uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
DECLARE
  v_order RECORD;
  v_payment JSONB;
  v_total_paid NUMERIC := 0;
  v_total_refund NUMERIC := 0;
  v_table RECORD;
  v_other_active_count INT;
  v_has_refund BOOLEAN := false;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;

  -- Reject cancelled orders — no payment, no mutation, no audit
  IF v_order.status = 'cancelled' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot pay cancelled order');
  END IF;

  -- Check if any payment is a refund
  FOR v_payment IN SELECT * FROM jsonb_array_elements(p_payments) LOOP
    IF COALESCE((v_payment->>'is_refund')::BOOLEAN, false) THEN
      v_has_refund := true;
    END IF;
  END LOOP;

  IF v_order.status = 'paid' AND NOT v_has_refund THEN
    RETURN jsonb_build_object('success', true, 'message', 'Already paid');
  END IF;

  -- Process refunds on paid orders
  IF v_order.status = 'paid' AND v_has_refund THEN
    FOR v_payment IN SELECT * FROM jsonb_array_elements(p_payments) LOOP
      IF COALESCE((v_payment->>'is_refund')::BOOLEAN, false) THEN
        INSERT INTO public.order_payments (
          order_id, payment_method, method, amount, currency, status,
          split_group_id, is_partial, is_refund, reference_order_id, created_by
        ) VALUES (
          p_order_id,
          COALESCE(v_payment->>'method', 'cash'),
          COALESCE(v_payment->>'method', 'cash'),
          -COALESCE((v_payment->>'amount')::NUMERIC, 0),
          COALESCE(v_payment->>'currency', 'AZN'),
          COALESCE(v_payment->>'status', 'success'),
          (v_payment->>'split_group_id')::UUID,
          COALESCE((v_payment->>'is_partial')::BOOLEAN, false),
          true,
          p_order_id,
          p_performed_by
        );
        v_total_refund := v_total_refund + COALESCE((v_payment->>'amount')::NUMERIC, 0);
      END IF;
    END LOOP;

    UPDATE public.orders SET
      paid_amount = GREATEST(v_order.paid_amount - v_total_refund, 0),
      refund_amount = COALESCE(v_order.refund_amount, 0) + v_total_refund,
      refund_reason = (SELECT (value->>'reason') FROM jsonb_array_elements(p_payments) WHERE (value->>'is_refund')::BOOLEAN LIMIT 1),
      refunded_at = NOW(),
      updated_at = NOW()
    WHERE id = p_order_id;

    INSERT INTO public.operation_logs (
      table_number, order_id, action, old_values, new_values, performed_by
    ) VALUES (
      v_order.table_number,
      p_order_id,
      'refund',
      jsonb_build_object('paid_amount', v_order.paid_amount, 'refund_amount', v_order.refund_amount),
      jsonb_build_object('paid_amount', GREATEST(v_order.paid_amount - v_total_refund, 0), 'refund_amount', COALESCE(v_order.refund_amount, 0) + v_total_refund),
      p_performed_by
    );

    RETURN jsonb_build_object('success', true, 'order_id', p_order_id, 'paid_amount', GREATEST(v_order.paid_amount - v_total_refund, 0), 'refund_amount', v_total_refund);
  END IF;

  -- Normal payment processing
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

GRANT ALL ON FUNCTION public.complete_payment_atomic(uuid, jsonb, text, numeric, numeric, numeric, numeric, text, uuid, text, uuid) TO anon;
GRANT ALL ON FUNCTION public.complete_payment_atomic(uuid, jsonb, text, numeric, numeric, numeric, numeric, text, uuid, text, uuid) TO authenticated;
GRANT ALL ON FUNCTION public.complete_payment_atomic(uuid, jsonb, text, numeric, numeric, numeric, numeric, text, uuid, text, uuid) TO service_role;
