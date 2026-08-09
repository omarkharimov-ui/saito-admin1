-- Fix walk-in pre-order support, refund tracking, and cash drawer issues

-- 1. Add pre-order columns to reservations
ALTER TABLE public.reservations
  ADD COLUMN IF NOT EXISTS pre_order boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS scheduled_date text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS scheduled_time text DEFAULT NULL;

-- 2. Add refund tracking columns to orders for statistics
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS refund_amount numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS refund_reason text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS refunded_at timestamp with time zone DEFAULT NULL;

-- 3. Update walkin_atomic to accept pre-order fields
CREATE OR REPLACE FUNCTION public.walkin_atomic (
  p_table_number integer,
  p_guests       integer DEFAULT 1,
  p_name         text    DEFAULT NULL::text,
  p_phone        text    DEFAULT NULL::text,
  p_order_type   text    DEFAULT 'dine_in'::text,
  p_notes        text    DEFAULT NULL::text,
  p_user_id      uuid    DEFAULT NULL::uuid,
  p_pre_order    boolean DEFAULT false,
  p_scheduled_date text DEFAULT NULL,
  p_scheduled_time text DEFAULT NULL
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
DECLARE
  v_table RECORD;
  v_reservation_id UUID;
  v_order_id UUID;
  v_reservation_date date;
  v_reservation_time time without time zone;
BEGIN
  SELECT * INTO v_table FROM public.table_floors WHERE table_number = p_table_number FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'TABLE_NOT_FOUND');
  END IF;
  IF v_table.status NOT IN ('empty', 'dirty') THEN
    RETURN jsonb_build_object('success', false, 'error', 'TABLE_NOT_EMPTY');
  END IF;

  IF p_pre_order THEN
    IF p_scheduled_date IS NULL OR p_scheduled_date = '' THEN
      v_reservation_date := CURRENT_DATE;
    ELSE
      v_reservation_date := p_scheduled_date::date;
    END IF;
    IF p_scheduled_time IS NULL OR p_scheduled_time = '' THEN
      v_reservation_time := CURRENT_TIME;
    ELSE
      v_reservation_time := p_scheduled_time::time without time zone;
    END IF;
  ELSE
    v_reservation_date := CURRENT_DATE;
    v_reservation_time := CURRENT_TIME;
  END IF;

  INSERT INTO public.reservations (
    name, phone, guests, date, time, status, table_ids, order_type, note, created_at, updated_at,
    pre_order, scheduled_date, scheduled_time
  ) VALUES (
    p_name, p_phone, p_guests, v_reservation_date, v_reservation_time, 'confirmed',
    ARRAY[p_table_number], p_order_type, p_notes, NOW(), NOW(),
    p_pre_order, p_scheduled_date, p_scheduled_time
  ) RETURNING id INTO v_reservation_id;
  INSERT INTO public.reservation_tables (reservation_id, table_number, created_at)
  VALUES (v_reservation_id, p_table_number, NOW());
  INSERT INTO public.orders (
    table_number, status, guest_count, reservation_id, customer_name,
    customer_phone, customer_note, kitchen_status, order_source, total_amount, created_at, updated_at, version
  ) VALUES (
    p_table_number, 'confirmed', p_guests, v_reservation_id, p_name, p_phone,
    p_notes, 'pending', p_order_type, 0, NOW(), NOW(), 1
  ) RETURNING id INTO v_order_id;
  UPDATE public.table_floors SET
    status = 'occupied',
    current_order_id = v_order_id,
    reservation_id = v_reservation_id,
    reservation_name = p_name,
    reservation_phone = p_phone,
    reservation_time = v_reservation_time,
    guest_count = p_guests,
    total_amount = 0,
    order_count = 0,
    bill_requested = false,
    updated_at = NOW()
  WHERE table_number = p_table_number;
  INSERT INTO public.operation_logs (
    table_number, order_id, reservation_id, action, old_values, new_values, performed_by
  ) VALUES (
    p_table_number, v_order_id, v_reservation_id, 'walkin',
    jsonb_build_object('status', v_table.status),
    jsonb_build_object('status', 'occupied', 'reservation_id', v_reservation_id),
    p_user_id
  );
  RETURN jsonb_build_object('success', true, 'reservation_id', v_reservation_id, 'order_id', v_order_id);
END;
$function$;

GRANT ALL ON FUNCTION public.walkin_atomic(integer, integer, text, text, text, text, uuid, boolean, text, text) TO service_role;
REVOKE ALL ON FUNCTION public.walkin_atomic(integer, integer, text, text, text, text, uuid, boolean, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.walkin_atomic(integer, integer, text, text, text, text, uuid, boolean, text, text) FROM authenticated;

-- 4. Update complete_payment_atomic to handle refunds on paid orders
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
  p_performed_by_terminal_id text DEFAULT NULL::text
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

GRANT ALL ON FUNCTION public.complete_payment_atomic(uuid, jsonb, text, numeric, numeric, numeric, numeric, text, uuid, text) TO service_role;
REVOKE ALL ON FUNCTION public.complete_payment_atomic(uuid, jsonb, text, numeric, numeric, numeric, numeric, text, uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.complete_payment_atomic(uuid, jsonb, text, numeric, numeric, numeric, numeric, text, uuid, text) FROM authenticated;
