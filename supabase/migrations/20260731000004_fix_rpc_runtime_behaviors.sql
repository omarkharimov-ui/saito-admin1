-- Migration 4: fix deployed RPC layer behaviors found by live testing
--  1. order_items CHECK: allow lifecycle statuses the functions write
--  2. orders kitchen_status CHECK: allow 'served'
--  3. idx_orders_active_table: exclude merged child orders (merge moves child
--     order rows onto the parent table while keeping merged_into set)
--  4. complete_payment_atomic: fix COALESCE(text, boolean) type error
--  5. walkin_atomic: orders.total_amount is NOT NULL, was omitted
--  6. sync_order_kitchen_status: aggregate must cover served/reserved lifecycle

-- 1. order_items kitchen_status CHECK
ALTER TABLE public.order_items DROP CONSTRAINT IF EXISTS order_items_kitchen_status_check;
ALTER TABLE public.order_items
  ADD CONSTRAINT order_items_kitchen_status_check
  CHECK (kitchen_status IS NULL OR kitchen_status = ANY (ARRAY[
    'pending', 'accepted', 'preparing', 'ready', 'served', 'completed', 'cancelled',
    'bar', 'hot', 'sushi', 'reserved', 'sent', 'recalled', 'comped', 'wasted'
  ]::text[]));

-- 2. orders kitchen_status CHECK (+ served)
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_kitchen_status_check;
ALTER TABLE public.orders
  ADD CONSTRAINT orders_kitchen_status_check
  CHECK (kitchen_status IS NULL OR kitchen_status = ANY (ARRAY[
    'pending', 'accepted', 'preparing', 'cooking', 'partially_ready', 'ready',
    'completed', 'cancelled', 'reserved', 'served'
  ]::text[]));

-- 3. Partial unique index: merged child orders no longer block the parent table
DROP INDEX IF EXISTS idx_orders_active_table;
CREATE UNIQUE INDEX idx_orders_active_table
  ON public.orders (table_number)
  WHERE status <> ALL (ARRAY['paid', 'cancelled', 'closed'])
    AND is_split IS DISTINCT FROM true
    AND merged_into IS NULL;

-- 4. complete_payment_atomic: boolean casts
CREATE OR REPLACE FUNCTION public.complete_payment_atomic(
  p_order_id uuid,
  p_payments jsonb,
  p_payment_method text DEFAULT 'cash',
  p_cash_amount numeric DEFAULT 0,
  p_card_amount numeric DEFAULT 0,
  p_tip_amount numeric DEFAULT 0,
  p_discount_amount numeric DEFAULT 0,
  p_discount_type text DEFAULT NULL,
  p_performed_by uuid DEFAULT NULL,
  p_performed_by_terminal_id text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_order RECORD;
  v_payment JSONB;
  v_total_paid NUMERIC := 0;
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
      order_id, method, amount, currency, status, split_group_id, is_partial, is_refund, created_by
    ) VALUES (
      p_order_id,
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

-- 5. walkin_atomic: total_amount is NOT NULL
CREATE OR REPLACE FUNCTION public.walkin_atomic(
  p_table_number integer,
  p_guests integer DEFAULT 1,
  p_name text DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_order_type text DEFAULT 'dine_in',
  p_user_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_table RECORD;
  v_reservation_id UUID;
  v_order_id UUID;
BEGIN
  SELECT * INTO v_table FROM public.table_floors WHERE table_number = p_table_number FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'TABLE_NOT_FOUND');
  END IF;

  IF v_table.status != 'empty' THEN
    RETURN jsonb_build_object('success', false, 'error', 'TABLE_NOT_EMPTY');
  END IF;

  INSERT INTO public.reservations (
    name, phone, guests, date, time, status, table_ids, order_type, created_at, updated_at
  ) VALUES (
    p_name, p_phone, p_guests, CURRENT_DATE, CURRENT_TIME, 'confirmed',
    ARRAY[p_table_number], p_order_type, NOW(), NOW()
  ) RETURNING id INTO v_reservation_id;

  INSERT INTO public.reservation_tables (reservation_id, table_number, created_at)
  VALUES (v_reservation_id, p_table_number, NOW());

  INSERT INTO public.orders (
    table_number, status, guest_count, reservation_id, customer_name,
    customer_phone, kitchen_status, order_source, total_amount, created_at, updated_at, version
  ) VALUES (
    p_table_number, 'confirmed', p_guests, v_reservation_id, p_name, p_phone,
    'pending', p_order_type, 0, NOW(), NOW(), 1
  ) RETURNING id INTO v_order_id;

  UPDATE public.table_floors SET
    status = 'occupied',
    current_order_id = v_order_id,
    reservation_id = v_reservation_id,
    reservation_name = p_name,
    reservation_phone = p_phone,
    reservation_time = CURRENT_TIME,
    guest_count = p_guests,
    updated_at = NOW()
  WHERE table_number = p_table_number;

  INSERT INTO public.operation_logs (
    table_number, order_id, reservation_id, action, old_values, new_values, performed_by
  ) VALUES (
    p_table_number, v_order_id, v_reservation_id, 'walkin',
    jsonb_build_object('status', 'empty'),
    jsonb_build_object('status', 'occupied', 'reservation_id', v_reservation_id),
    p_user_id
  );

  RETURN jsonb_build_object('success', true, 'reservation_id', v_reservation_id, 'order_id', v_order_id);
END;
$function$;

-- 6. sync_order_kitchen_status: cover full lifecycle
CREATE OR REPLACE FUNCTION public.sync_order_kitchen_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_order_id UUID;
  v_new_status TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_order_id := OLD.order_id;
  ELSE
    v_order_id := NEW.order_id;
  END IF;

  SELECT
    CASE
      WHEN COUNT(*) FILTER (WHERE kitchen_status NOT IN ('cancelled', 'comped', 'wasted', 'recalled')) = 0 THEN 'cancelled'
      WHEN COUNT(*) FILTER (WHERE kitchen_status = 'served') > 0 THEN 'served'
      WHEN COUNT(*) FILTER (WHERE kitchen_status = 'preparing') > 0
           AND COUNT(*) FILTER (WHERE kitchen_status IN ('pending', 'accepted', 'ready')) > 0 THEN 'partially_ready'
      WHEN COUNT(*) FILTER (WHERE kitchen_status = 'preparing') > 0 THEN 'preparing'
      WHEN COUNT(*) FILTER (WHERE kitchen_status = 'ready') > 0 THEN 'ready'
      WHEN COUNT(*) FILTER (WHERE kitchen_status = 'accepted') > 0 THEN 'accepted'
      WHEN COUNT(*) FILTER (WHERE kitchen_status = 'pending') > 0 THEN 'pending'
      WHEN COUNT(*) FILTER (WHERE kitchen_status = 'reserved') > 0 THEN 'reserved'
      WHEN COUNT(*) FILTER (WHERE kitchen_status = 'completed') > 0 THEN 'completed'
      ELSE 'cancelled'
    END INTO v_new_status
  FROM order_items
  WHERE order_id = v_order_id;

  UPDATE orders
  SET kitchen_status = v_new_status
  WHERE id = v_order_id
    AND status NOT IN ('paid', 'cancelled', 'closed');

  RETURN COALESCE(NEW, OLD);
END;
$function$;
