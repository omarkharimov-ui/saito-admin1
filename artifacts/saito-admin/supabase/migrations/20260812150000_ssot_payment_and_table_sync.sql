-- SSOT: complete_payment_atomic becomes the single payment RPC
-- Replaces process_order_payment for all payment flows (POS, refund, etc.)
-- Handles: order_payments, orders update, table_floors sync, cash_drawer_log,
-- inventory deduction, COGS/profit, notifications, operation_logs

CREATE OR REPLACE FUNCTION public.complete_payment_atomic(
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
  p_cash_drawer_session_id uuid DEFAULT NULL::uuid
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
  v_cogs NUMERIC := 0;
  v_profit NUMERIC := 0;
  v_table RECORD;
  v_other_active_count INT;
  v_has_refund BOOLEAN := false;
  v_ingredient RECORD;
  v_total_deducted INTEGER := 0;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;

  -- Check if any payment is a refund
  FOR v_payment IN SELECT * FROM jsonb_array_elements(p_payments) LOOP
    IF COALESCE((v_payment->>'is_refund')::BOOLEAN, false) THEN
      v_has_refund := true;
    END IF;
  END LOOP;

  IF v_order.status = 'paid' AND NOT v_has_refund THEN
    RETURN jsonb_build_object('success', false, 'duplicate', true, 'message', 'Order already paid', 'total_paid', v_order.paid_amount, 'cogs', 0, 'profit', 0, 'fully_paid', true);
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
      refunded_at = v_now,
      updated_at = v_now
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

  -- Inventory deduction (idempotent via deduct_stock_on_order)
  IF NOT EXISTS (SELECT 1 FROM inventory_logs WHERE reference_type = 'order' AND reference_id = p_order_id LIMIT 1) THEN
    DECLARE
      v_recipe RECORD;
    BEGIN
      FOR v_ingredient IN
        SELECT oi.product_id, oi.quantity, p.is_ready_product, p.direct_ingredient_id
        FROM order_items oi
        JOIN products p ON p.id = oi.product_id
        WHERE oi.order_id = p_order_id
          AND (oi.kitchen_status IS DISTINCT FROM 'cancelled')
      LOOP
        IF v_ingredient.is_ready_product AND v_ingredient.direct_ingredient_id IS NOT NULL THEN
          INSERT INTO inventory_logs (ingredient_id, type, quantity, unit_cost, reference_type, reference_id, order_id, notes, created_at)
          SELECT v_ingredient.direct_ingredient_id, 'order_consumption', v_ingredient.quantity, COALESCE(i.average_cost_per_unit, 0), 'order', p_order_id, p_order_id, 'Ready-product: ' || COALESCE((SELECT product_name FROM order_items WHERE product_id = v_ingredient.product_id LIMIT 1), '?'), v_now
          FROM ingredients i WHERE i.id = v_ingredient.direct_ingredient_id;
          v_total_deducted := v_total_deducted + 1;
        ELSIF NOT v_ingredient.is_ready_product OR v_ingredient.is_ready_product IS NULL THEN
          FOR v_recipe IN
            SELECT r.ingredient_id, COALESCE(r.quantity_brutto, r.quantity_required) * v_ingredient.quantity AS deduct_qty
            FROM recipes r
            WHERE r.menu_item_id = v_ingredient.product_id
          LOOP
            INSERT INTO inventory_logs (ingredient_id, type, quantity, unit_cost, reference_type, reference_id, order_id, notes, created_at)
            SELECT v_recipe.ingredient_id, 'order_consumption', v_recipe.deduct_qty, COALESCE(i.average_cost_per_unit, 0), 'order', p_order_id, p_order_id, 'Recipe: ' || COALESCE((SELECT product_name FROM order_items WHERE product_id = v_ingredient.product_id LIMIT 1), '?'), v_now
            FROM ingredients i WHERE i.id = v_recipe.ingredient_id;
            v_total_deducted := v_total_deducted + 1;
          END LOOP;
        END IF;
      END LOOP;
    END;
  END IF;

  -- COGS calculation
  SELECT COALESCE(SUM(quantity * unit_cost), 0) INTO v_cogs FROM inventory_logs
  WHERE type = 'order_consumption' AND order_id = p_order_id;

  v_profit := v_total_paid - v_cogs;

  -- Update order
  UPDATE public.orders SET
    paid_amount = v_total_paid,
    cash_amount = p_cash_amount,
    card_amount = p_card_amount,
    tip_amount = p_tip_amount,
    discount_amount = p_discount_amount,
    discount_type = p_discount_type,
    payment_method = p_payment_method,
    status = CASE WHEN v_total_paid >= (v_order.total_amount - COALESCE(p_discount_amount, 0)) THEN 'paid' ELSE v_order.status END,
    paid_at = CASE WHEN v_total_paid >= (v_order.total_amount - COALESCE(p_discount_amount, 0)) THEN v_now ELSE v_order.paid_at END,
    version = COALESCE(v_order.version, 0) + 1,
    updated_by_terminal_id = p_performed_by_terminal_id,
    updated_at = v_now
  WHERE id = p_order_id;

  -- Cash drawer logging (single source: RPC writes directly)
  IF p_cash_drawer_session_id IS NOT NULL AND (p_cash_amount > 0 OR p_card_amount > 0) THEN
    IF p_cash_amount > 0 THEN
      INSERT INTO public.cash_drawer_log (
        session_id, type, amount, description, order_id, created_by
      ) VALUES (
        p_cash_drawer_session_id,
        'payment',
        p_cash_amount,
        'Nağd ödəniş',
        p_order_id,
        p_performed_by
      );
    END IF;
    IF p_card_amount > 0 THEN
      INSERT INTO public.cash_drawer_log (
        session_id, type, amount, description, order_id, created_by
      ) VALUES (
        p_cash_drawer_session_id,
        'card_payment',
        p_card_amount,
        CASE WHEN p_payment_method = 'voucher' THEN 'Vouçer ödəniş' ELSE 'Kart ödəniş' END,
        p_order_id,
        p_performed_by
      );
    END IF;
  END IF;

  -- Table_floors sync (SSOT)
  IF v_total_paid >= (v_order.total_amount - COALESCE(p_discount_amount, 0)) THEN
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
            updated_at = v_now
          WHERE table_number = v_order.table_number;
        END IF;
      END IF;
    END IF;
  END IF;

  -- Operation log
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

  -- Notification
  IF v_total_paid >= (v_order.total_amount - COALESCE(p_discount_amount, 0)) THEN
    INSERT INTO public.notifications (title, body, type, created_at)
    VALUES (
      'Ödəniş qəbul edildi',
      CASE WHEN v_order.table_number IS NOT NULL
        THEN 'Masa ' || v_order.table_number || ' - ' || v_total_paid || ' AZN'
        ELSE v_total_paid || ' AZN ödəniş qəbul edildi'
      END,
      'payment',
      v_now
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'order_id', p_order_id,
    'paid_amount', v_total_paid,
    'cogs', v_cogs,
    'profit', v_profit,
    'fully_paid', v_total_paid >= (v_order.total_amount - COALESCE(p_discount_amount, 0))
  );
END;
$function$;

GRANT ALL ON FUNCTION public.complete_payment_atomic(uuid, jsonb, text, numeric, numeric, numeric, numeric, text, uuid, text, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.complete_payment_atomic(uuid, jsonb, text, numeric, numeric, numeric, numeric, text, uuid, text, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.complete_payment_atomic(uuid, jsonb, text, numeric, numeric, numeric, numeric, text, uuid, text, uuid) FROM authenticated;
