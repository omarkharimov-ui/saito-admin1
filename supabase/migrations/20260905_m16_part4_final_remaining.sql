-- =====================================================================
-- M16-PART4 — FINAL 9 RPCs VALIDATION
-- Purpose: Add validate_actor to remaining critical RPCs
-- =====================================================================

-- complete_payment_atomic_v2
CREATE OR REPLACE FUNCTION public.complete_payment_atomic_v2 (
  p_order_id uuid,
  p_payments jsonb DEFAULT '[]'::jsonb,
  p_payment_method text DEFAULT 'cash'::text,
  p_cash_amount numeric DEFAULT 0,
  p_card_amount numeric DEFAULT 0,
  p_tip_amount numeric DEFAULT 0,
  p_discount_amount numeric DEFAULT 0,
  p_discount_type text DEFAULT NULL::text,
  p_performed_by uuid DEFAULT NULL::uuid,
  p_performed_by_terminal_id text DEFAULT NULL::text,
  p_cash_drawer_session_id uuid DEFAULT NULL::uuid,
  p_cash_received numeric DEFAULT NULL::numeric,
  p_idempotency_key text DEFAULT NULL::text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
AS $function$
DECLARE
  v_order RECORD;
  v_total_paid NUMERIC := 0;
  v_cash_total NUMERIC := 0;
  v_card_total NUMERIC := 0;
  v_payment JSONB;
  v_now TIMESTAMPTZ := NOW();
  v_payment_ids UUID[] := '{}';
  v_remaining NUMERIC;
  v_new_status TEXT;
  v_change NUMERIC := 0;
  v_performer_name TEXT;
BEGIN
  PERFORM public.validate_actor(p_performed_by);
  SELECT name INTO v_performer_name FROM staff WHERE id = p_performed_by;

  -- Lock order
  SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'ORDER_NOT_FOUND');
  END IF;

  -- Process payments from JSONB array
  FOR v_payment IN SELECT * FROM jsonb_array_elements(p_payments) LOOP
    v_total_paid := v_total_paid + COALESCE((v_payment->>'amount')::NUMERIC, 0);
    IF (v_payment->>'method')::TEXT = 'cash' THEN
      v_cash_total := v_cash_total + COALESCE((v_payment->>'amount')::NUMERIC, 0);
    ELSE
      v_card_total := v_card_total + COALESCE((v_payment->>'amount')::NUMERIC, 0);
    END IF;
  END LOOP;

  -- Calculate new totals
  v_remaining := v_order.total_amount - COALESCE(v_order.paid_amount, 0) - v_total_paid;
  v_new_status := CASE
    WHEN v_remaining <= 0 THEN 'paid'
    WHEN COALESCE(v_order.paid_amount, 0) + v_total_paid > 0 THEN v_order.status
    ELSE v_order.status
  END;

  -- Update order
  UPDATE orders SET
    paid_amount = COALESCE(paid_amount, 0) + v_total_paid,
    cash_amount = COALESCE(cash_amount, 0) + v_cash_total,
    card_amount = COALESCE(card_amount, 0) + v_card_total,
    tip_amount = COALESCE(tip_amount, 0) + p_tip_amount,
    discount_amount = p_discount_amount,
    discount_type = p_discount_type,
    payment_method = p_payment_method,
    status = v_new_status,
    cash_received = COALESCE(cash_received, 0) + COALESCE(p_cash_received, v_cash_total),
    change_amount = COALESCE(change_amount, 0) + v_change,
    paid_at = CASE WHEN v_new_status = 'paid' AND v_order.status != 'paid' THEN v_now ELSE paid_at END,
    updated_at = v_now,
    version = COALESCE(version, 0) + 1
  WHERE id = p_order_id;

  -- Audit
  PERFORM public.log_audit(
    'payment', 'order', p_order_id::text,
    p_performed_by, v_performer_name,
    jsonb_build_object('status', v_order.status, 'paid_amount', v_order.paid_amount),
    jsonb_build_object('status', v_new_status, 'paid_amount', COALESCE(v_order.paid_amount, 0) + v_total_paid, 'payment_method', p_payment_method, 'amount', v_total_paid),
    jsonb_build_object('payments', p_payments, 'cash_received', p_cash_received, 'change', v_change, 'idempotency_key', p_idempotency_key),
    NULL
  );

  RETURN jsonb_build_object(
    'success', true,
    'action', 'payment',
    'paid_amount', COALESCE(v_order.paid_amount, 0) + v_total_paid,
    'total_amount', v_order.total_amount,
    'remaining', GREATEST(0, v_remaining),
    'is_fully_paid', v_remaining <= 0,
    'status', v_new_status,
    'cash_received', p_cash_received,
    'change', v_change,
    'tip_amount', p_tip_amount,
    'payment_ids', v_payment_ids,
    'idempotent', false,
    'timestamp', v_now
  );
END;
$function$;

-- complete_payment_v4 with p_performed_by
CREATE OR REPLACE FUNCTION public.complete_payment_v4 (
  p_order_id uuid,
  p_payment_method text,
  p_total_amount numeric,
  p_tax_amount numeric,
  p_service_amount numeric,
  p_discount_amount numeric,
  p_performed_by uuid DEFAULT NULL::uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
AS $function$
DECLARE
  v_table_id INTEGER;
  v_group_id UUID;
BEGIN
  PERFORM public.validate_actor(p_performed_by);
  -- Lock order
  SELECT table_number, group_id INTO v_table_id, v_group_id FROM orders WHERE id = p_order_id FOR UPDATE;

  -- Update Order Status
  UPDATE orders SET 
    status = 'COMPLETED',
    payment_method = p_payment_method,
    paid_amount = p_total_amount,
    total_amount = p_total_amount,
    updated_at = NOW()
  WHERE id = p_order_id;

  RETURN jsonb_build_object('success', true, 'order_id', p_order_id);
END;
$function$;

-- deduct_stock_on_order with p_performed_by
CREATE OR REPLACE FUNCTION public.deduct_stock_on_order (
  p_order_id uuid,
  p_performed_by uuid DEFAULT NULL::uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
AS $function$
DECLARE
  v_item RECORD;
  v_deduct_qty NUMERIC;
  v_ingredient_id UUID;
  v_notes TEXT;
  v_total_deducted INTEGER := 0;
  v_errors TEXT[] := '{}';
BEGIN
  PERFORM public.validate_actor(p_performed_by);
  -- Idempotency: skip if already deducted
  IF EXISTS (SELECT 1 FROM inventory_logs WHERE type = 'order_consumption' AND order_id = p_order_id) THEN
    RETURN jsonb_build_object('success', true, 'message', 'Already deducted', 'deducted', 0);
  END IF;

  FOR v_item IN 
    SELECT oi.product_id, oi.quantity, r.ingredient_id,
           COALESCE(r.quantity_brutto, r.quantity_required) AS ingred_qty,
           i.average_cost_per_unit, i.current_stock, i.unit
    FROM order_items oi
    JOIN recipes r ON r.menu_item_id = oi.product_id
    JOIN ingredients i ON i.id = r.ingredient_id
    WHERE oi.order_id = p_order_id
  LOOP
    v_deduct_qty := v_item.ingred_qty * v_item.quantity;
    IF v_item.current_stock < v_deduct_qty THEN
      v_errors := array_append(v_errors, format('Insufficient stock for ingredient %s: need %s, have %s', v_item.ingredient_id, v_deduct_qty, v_item.current_stock));
    ELSE
      INSERT INTO inventory_transactions (
        ingredient_id, quantity, unit, transaction_type, reference_type, reference_id, performed_by, created_at
      ) VALUES (
        v_item.ingredient_id, -v_deduct_qty, v_item.unit, 'order_consumption', 'order', p_order_id, p_performed_by, NOW()
      );
      v_total_deducted := v_total_deducted + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'deducted', v_total_deducted, 'errors', v_errors);
END;
$function$;

-- open_cash_register with validate_actor
CREATE OR REPLACE FUNCTION public.open_cash_register (
  p_opening_balance numeric DEFAULT 0,
  p_notes text DEFAULT NULL::text,
  p_opened_by uuid DEFAULT NULL::uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
AS $function$
DECLARE
  v_session_id uuid;
BEGIN
  PERFORM public.validate_actor(p_opened_by);
  INSERT INTO public.cash_drawer_sessions (opening_balance, status, notes, opened_by)
  VALUES (p_opening_balance, 'open', p_notes, p_opened_by)
  RETURNING id INTO v_session_id;

  INSERT INTO public.cash_drawer_log (session_id, type, amount, description, created_by)
  VALUES (v_session_id, 'open', p_opening_balance, COALESCE(p_notes, 'Kassa açıldı'), p_opened_by);

  PERFORM public.log_audit(
    'cash_register_opened', NULL, NULL, p_opened_by,
    NULL, NULL, NULL, NULL,
    jsonb_build_object('session_id', v_session_id, 'opening_balance', p_opening_balance),
    NULL, NULL, NULL, NULL
  );

  RETURN jsonb_build_object('success', true, 'id', v_session_id, 'opening_balance', p_opening_balance);
END;
$function$;

-- refund_payment_atomic with validate_actor
CREATE OR REPLACE FUNCTION public.refund_payment_atomic (
  p_order_id uuid,
  p_amount numeric,
  p_method text DEFAULT 'cash'::text,
  p_reason text DEFAULT NULL::text,
  p_performed_by uuid DEFAULT NULL::uuid,
  p_cash_drawer_session_id uuid DEFAULT NULL::uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
AS $function$
DECLARE
  v_order RECORD;
  v_refund_id UUID;
BEGIN
  PERFORM public.validate_actor(p_performed_by);
  SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'ORDER_NOT_FOUND');
  END IF;

  INSERT INTO order_payments (
    order_id, payment_method, method, amount, status, is_refund, created_by
  ) VALUES (
    p_order_id, p_method, p_method, p_amount, 'success', true, p_performed_by
  ) RETURNING id INTO v_refund_id;

  PERFORM public.log_audit(
    'refund', 'order', p_order_id::text,
    p_performed_by, NULL,
    jsonb_build_object('amount', v_order.paid_amount),
    jsonb_build_object('amount', v_order.paid_amount - p_amount, 'refund', p_amount),
    jsonb_build_object('payment_id', v_refund_id, 'reason', p_reason),
    NULL
  );

  RETURN jsonb_build_object('success', true, 'refund_id', v_refund_id, 'refund_amount', p_amount);
END;
$function$;

-- reverse_stock_deduction with p_performed_by and validate_actor
CREATE OR REPLACE FUNCTION public.reverse_stock_deduction (
  p_order_id uuid,
  p_performed_by uuid DEFAULT NULL::uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  v_reversed INTEGER := 0;
  v_log RECORD;
BEGIN
  PERFORM public.validate_actor(p_performed_by);
  FOR v_log IN
    SELECT ingredient_id, SUM(quantity) AS total_qty
    FROM inventory_logs
    WHERE type = 'order_consumption' AND order_id = p_order_id
    GROUP BY ingredient_id
  LOOP
    INSERT INTO inventory_transactions (
      ingredient_id, quantity, unit, transaction_type, reference_type, reference_id, performed_by, created_at
    ) VALUES (
      v_log.ingredient_id, -v_log.total_qty, 'piece', 'reversal', 'order', p_order_id, p_performed_by, NOW()
    );
    v_reversed := v_reversed + 1;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'reversed', v_reversed);
END;
$function$;

-- send_to_kitchen_atomic reservation signature with validate_actor
CREATE OR REPLACE FUNCTION public.send_to_kitchen_atomic (
  p_reservation_id uuid,
  p_user_id uuid DEFAULT NULL::uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
AS $function$
DECLARE
  v_reservation RECORD;
BEGIN
  PERFORM public.validate_actor(p_user_id);
  SELECT * INTO v_reservation FROM public.reservations WHERE id = p_reservation_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Reservation not found');
  END IF;

  INSERT INTO public.operation_logs (
    reservation_id, action, new_values, performed_by
  ) VALUES (
    p_reservation_id, 'send_to_kitchen',
    jsonb_build_object('reservation_id', p_reservation_id),
    p_user_id
  );

  RETURN jsonb_build_object('success', true);
END;
$function$;

-- void_payment_atomic overload 1
CREATE OR REPLACE FUNCTION public.void_payment_atomic (
  p_payment_id uuid,
  p_reason text DEFAULT NULL::text,
  p_performed_by uuid DEFAULT NULL::uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
AS $function$
DECLARE
  v_payment RECORD;
BEGIN
  PERFORM public.validate_actor(p_performed_by);
  SELECT * INTO v_payment FROM order_payments WHERE id = p_payment_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Payment not found');
  END IF;

  UPDATE order_payments SET
    status = 'voided',
    updated_at = NOW()
  WHERE id = p_payment_id;

  PERFORM public.log_audit(
    'void_payment', 'order_payment', p_payment_id::text,
    p_performed_by, NULL,
    jsonb_build_object('status', v_payment.status),
    jsonb_build_object('status', 'voided', 'reason', p_reason),
    NULL, NULL
  );

  RETURN jsonb_build_object('success', true, 'payment_id', p_payment_id);
END;
$function$;

-- void_payment_atomic overload 2
CREATE OR REPLACE FUNCTION public.void_payment_atomic (
  p_order_id text,
  p_items jsonb,
  p_performed_by uuid DEFAULT NULL::uuid,
  p_performed_by_terminal_id text DEFAULT NULL::text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
AS $function$
DECLARE
  v_order RECORD;
BEGIN
  PERFORM public.validate_actor(p_performed_by);
  SELECT * INTO v_order FROM orders WHERE id = p_order_id::uuid FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;

  PERFORM public.log_audit(
    'void_order', 'order', p_order_id,
    p_performed_by, NULL,
    jsonb_build_object('status', v_order.status),
    jsonb_build_object('status', 'voided', 'items', p_items),
    NULL, NULL
  );

  RETURN jsonb_build_object('success', true);
END;
$function$;

-- Verification
DO $$
DECLARE
  v_missing INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_missing
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.prokind = 'f'
    AND p.proname IN (
      'complete_payment_atomic_v2', 'complete_payment_v4', 'deduct_stock_on_order',
      'open_cash_register', 'refund_payment_atomic', 'reverse_stock_deduction',
      'send_to_kitchen_atomic', 'void_payment_atomic'
    )
    AND pg_get_functiondef(p.oid) NOT LIKE '%validate_actor%';

  IF v_missing > 0 THEN
    RAISE WARNING 'M16-PART4: % RPCs still missing validate_actor', v_missing;
  ELSE
    RAISE NOTICE 'M16-PART4: All remaining RPCs have validate_actor';
  END IF;
END $$;
