-- Fix table state machine: map order status to canonical table transitions
-- This ensures table_floors.status always follows the canonical table lifecycle
-- defined in public.state_transitions for entity = 'table'

-- ============================================================
-- 1. Fix transition_order_status: use canonical table transitions
-- ============================================================
CREATE OR REPLACE FUNCTION public.transition_order_status (
  p_order_id      uuid,
  p_new_status    text,
  p_performed_by  uuid  DEFAULT NULL::uuid,
  p_employee_name text  DEFAULT NULL::text,
  p_reason        text  DEFAULT NULL::text,
  p_metadata      jsonb DEFAULT NULL::jsonb,
  p_ip_address    text  DEFAULT NULL::text,
  p_device_id     text  DEFAULT NULL::text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  v_order RECORD;
  v_validation JSONB;
  v_old_status TEXT;
  v_old_kitchen_status TEXT;
  v_table_number INT;
  v_current_table_status TEXT;
  v_target_table_status TEXT;
BEGIN
  SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  v_old_status := v_order.status;
  v_old_kitchen_status := v_order.kitchen_status;
  v_table_number := v_order.table_number;

  v_validation := validate_transition('order', v_old_status, p_new_status);
  IF NOT (v_validation->>'valid')::BOOLEAN THEN
    RAISE EXCEPTION 'INVALID_TRANSITION: %', v_validation->>'error' USING ERRCODE = 'P0001';
  END IF;

  UPDATE orders SET
    status = p_new_status,
    version = COALESCE(version, 0) + 1,
    updated_at = now()
  WHERE id = p_order_id;

  CASE p_new_status
    WHEN 'in_kitchen' THEN
      UPDATE orders SET kitchen_status = 'preparing' WHERE id = p_order_id AND kitchen_status IS DISTINCT FROM 'preparing';
    WHEN 'ready' THEN
      UPDATE orders SET kitchen_status = 'ready' WHERE id = p_order_id;
    WHEN 'served' THEN
      UPDATE orders SET kitchen_status = 'completed' WHERE id = p_order_id;
    WHEN 'paid', 'closed' THEN
      UPDATE orders SET kitchen_status = 'completed' WHERE id = p_order_id
        AND kitchen_status NOT IN ('completed', 'cancelled');
    WHEN 'cancelled' THEN
      UPDATE orders SET kitchen_status = 'cancelled' WHERE id = p_order_id
        AND kitchen_status NOT IN ('cancelled');
    ELSE NULL;
  END CASE;

  IF v_table_number IS NOT NULL AND v_table_number > 0 THEN
    SELECT status INTO v_current_table_status FROM table_floors WHERE table_number = v_table_number;

    CASE p_new_status
      WHEN 'new' THEN v_target_table_status := 'ordering';
      WHEN 'confirmed' THEN v_target_table_status := 'ordering';
      WHEN 'in_kitchen' THEN v_target_table_status := 'in_kitchen';
      WHEN 'partially_ready' THEN v_target_table_status := 'in_kitchen';
      WHEN 'ready' THEN v_target_table_status := 'ready';
      WHEN 'served' THEN v_target_table_status := 'dining';
      WHEN 'payment_pending' THEN v_target_table_status := 'bill_requested';
      WHEN 'paid' THEN v_target_table_status := 'payment_pending';
      WHEN 'closed' THEN v_target_table_status := 'cleaning';
      WHEN 'cancelled' THEN v_target_table_status := 'empty';
      ELSE v_target_table_status := NULL;
    END CASE;

    IF v_target_table_status IS NOT NULL AND v_current_table_status IS DISTINCT FROM v_target_table_status THEN
      BEGIN
        PERFORM transition_table_status(
          v_table_number,
          v_target_table_status,
          p_performed_by,
          p_employee_name,
          p_reason,
          p_metadata,
          NULL,
          p_ip_address,
          p_device_id
        );
      EXCEPTION WHEN OTHERS THEN
        INSERT INTO audit_logs (table_name, record_id, action, old_data, new_data, performed_by, created_at)
        SELECT 'table_floors', tf.id, 'status_change_failed',
          jsonb_build_object('status', v_current_table_status),
          jsonb_build_object('status', v_target_table_status, 'error', SQLERRM),
          p_performed_by, now()
        FROM table_floors tf WHERE tf.table_number = v_table_number;
      END;
    END IF;
  END IF;

  PERFORM log_order_event(
    p_order_id,
    'status_changed',
    jsonb_build_object('status', v_old_status, 'kitchen_status', v_old_kitchen_status),
    jsonb_build_object('status', p_new_status, 'kitchen_status', (SELECT kitchen_status FROM orders WHERE id = p_order_id)),
    p_metadata,
    p_performed_by,
    p_employee_name,
    p_ip_address,
    p_device_id
  );

  INSERT INTO audit_logs (table_name, record_id, action, old_data, new_data, performed_by, created_at)
  VALUES (
    'orders', p_order_id, 'status_change',
    jsonb_build_object('status', v_old_status),
    jsonb_build_object('status', p_new_status, 'reason', p_reason),
    p_performed_by, now()
  );

  RETURN jsonb_build_object(
    'success', true,
    'order_id', p_order_id,
    'old_status', v_old_status,
    'new_status', p_new_status,
    'kitchen_status', (SELECT kitchen_status FROM orders WHERE id = p_order_id)
  );
END;
$function$;

GRANT ALL ON FUNCTION public.transition_order_status(uuid, text, uuid, text, text, jsonb, text, text) TO anon;
GRANT ALL ON FUNCTION public.transition_order_status(uuid, text, uuid, text, text, jsonb, text, text) TO authenticated;
GRANT ALL ON FUNCTION public.transition_order_status(uuid, text, uuid, text, text, jsonb, text, text) TO service_role;


-- ============================================================
-- 2. Fix complete_payment_atomic: use canonical table transition
-- ============================================================
CREATE OR REPLACE FUNCTION public.complete_payment_atomic (
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

    IF v_order.table_number IS NOT NULL AND v_order.table_number > 0 THEN
      SELECT COUNT(*) INTO v_other_active_count FROM public.orders
        WHERE table_number = v_order.table_number
          AND id != p_order_id
          AND status NOT IN ('paid', 'cancelled', 'closed');

      IF v_other_active_count = 0 THEN
        SELECT * INTO v_table FROM public.table_floors WHERE table_number = v_order.table_number FOR UPDATE;
        IF FOUND THEN
          UPDATE public.table_floors SET
            status = 'cleaning',
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


-- ============================================================
-- 3. Fix mark_order_ready: advance dine-in order status to ready
-- ============================================================
CREATE OR REPLACE FUNCTION public.mark_order_ready (
  p_order_id uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  v_order RECORD;
  v_deducted INTEGER := 0;
BEGIN
  SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'ORDER_NOT_FOUND');
  END IF;

  UPDATE order_items
  SET kitchen_status = 'ready'
  WHERE order_id = p_order_id
    AND kitchen_status IN ('pending', 'preparing', 'cooking', 'accepted');

  UPDATE orders SET
    kitchen_status = 'ready',
    kitchen_ready_at = now(),
    version = COALESCE(version, 0) + 1
  WHERE id = p_order_id;

  IF v_order.order_source = 'delivery' AND COALESCE(v_order.delivery_status, 'pending') IN ('pending', 'confirmed', 'preparing') THEN
    UPDATE orders SET delivery_status = 'ready', updated_at = now() WHERE id = p_order_id;
  END IF;

  IF v_order.order_source = 'takeaway' AND v_order.status IN ('confirmed', 'in_kitchen') THEN
    UPDATE orders SET status = 'ready', updated_at = now() WHERE id = p_order_id;
  END IF;

  IF v_order.order_source = 'dine_in' AND v_order.status IN ('confirmed', 'in_kitchen', 'partially_ready') THEN
    UPDATE orders SET status = 'ready', updated_at = now() WHERE id = p_order_id;
  END IF;

  IF v_order.order_source = 'dine_in' AND v_order.table_number IS NOT NULL AND v_order.table_number > 0 THEN
    UPDATE public.table_floors
    SET status = 'ready', updated_at = now()
    WHERE table_number = v_order.table_number;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM inventory_logs
    WHERE reference_type = 'order' AND reference_id = p_order_id
    LIMIT 1
  ) THEN
    INSERT INTO inventory_logs (ingredient_id, type, quantity, unit_cost, reference_type, reference_id, order_id, notes, created_at)
    SELECT
      r.ingredient_id, 'order_consumption',
      (r.quantity_required * oi.quantity),
      COALESCE(i.average_cost_per_unit, 0),
      'order', p_order_id, p_order_id,
      'Ready: Order ' || p_order_id::TEXT, now()
    FROM order_items oi
    JOIN products p ON p.id = oi.product_id
    JOIN recipes r ON r.menu_item_id = p.id
    JOIN ingredients i ON i.id = r.ingredient_id
    WHERE oi.order_id = p_order_id
      AND (oi.kitchen_status IS DISTINCT FROM 'cancelled')
      AND (p.is_ready_product IS NOT TRUE);

    GET DIAGNOSTICS v_deducted = ROW_COUNT;

    INSERT INTO inventory_logs (ingredient_id, type, quantity, unit_cost, reference_type, reference_id, order_id, notes, created_at)
    SELECT
      p.direct_ingredient_id, 'order_consumption',
      oi.quantity, COALESCE(i.average_cost_per_unit, 0),
      'order', p_order_id, p_order_id,
      'Ready: Order ' || p_order_id::TEXT, now()
    FROM order_items oi
    JOIN products p ON p.id = oi.product_id
    LEFT JOIN ingredients i ON i.id = p.direct_ingredient_id
    WHERE oi.order_id = p_order_id
      AND (oi.kitchen_status IS DISTINCT FROM 'cancelled')
      AND p.is_ready_product = TRUE
      AND p.direct_ingredient_id IS NOT NULL;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'order_id', p_order_id,
    'status', 'ready',
    'deducted_ingredients', v_deducted
  );
END;
$function$;

GRANT ALL ON FUNCTION public.mark_order_ready(uuid) TO anon;
GRANT ALL ON FUNCTION public.mark_order_ready(uuid) TO authenticated;
GRANT ALL ON FUNCTION public.mark_order_ready(uuid) TO service_role;


-- ============================================================
-- 4. Fix prepare_order_items: update table status for dine-in
-- ============================================================
CREATE OR REPLACE FUNCTION public.prepare_order_items (
  p_order_id uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  v_updated INTEGER;
  v_order RECORD;
BEGIN
  SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  UPDATE order_items
  SET kitchen_status = 'preparing'
  WHERE order_id = p_order_id
    AND kitchen_status IN ('pending', 'accepted', 'reserved');

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated > 0 THEN
    UPDATE orders SET
      kitchen_status = 'preparing',
      kitchen_accepted_at = now()
    WHERE id = p_order_id
      AND kitchen_status IS DISTINCT FROM 'preparing';
  END IF;

  IF v_order.order_source = 'dine_in' AND v_order.table_number IS NOT NULL AND v_order.table_number > 0 THEN
    UPDATE public.table_floors
    SET status = 'in_kitchen', updated_at = now()
    WHERE table_number = v_order.table_number AND status IS DISTINCT FROM 'in_kitchen';
  END IF;

  RETURN jsonb_build_object('success', true, 'updated_items', v_updated);
END;
$function$;

GRANT ALL ON FUNCTION public.prepare_order_items(uuid) TO anon;
GRANT ALL ON FUNCTION public.prepare_order_items(uuid) TO authenticated;
GRANT ALL ON FUNCTION public.prepare_order_items(uuid) TO service_role;
