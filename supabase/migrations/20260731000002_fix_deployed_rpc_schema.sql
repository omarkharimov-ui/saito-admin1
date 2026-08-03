-- ============================================================================
-- FIX: The deployed RPC layer (terminal-era functions) was written against a
-- schema that was never applied to the remote database. Every call that
-- INSERTs into operation_logs failed at runtime with "column X of relation
-- Y does not exist" — affecting dismiss/merge/transfer/kitchen/payment/
-- reservation operations.
--
-- Approach: schema-completion compatibility layer (lowest-risk fix).
--   1. operation_logs: add the legacy alias columns the old functions INSERT
--      into, relax the NOT NULL on `operation`, and normalize legacy values
--      into the canonical columns (operation, source_table_number, old_state,
--      new_state, undo_payload) via a BEFORE INSERT trigger. New canonical
--      writers (clear_table_atomic, log_operation) are unaffected.
--   2. Add columns that kitchen/table RPCs write but that are missing:
--      table_floors.kitchen_status, orders.assigned_to_name,
--      kitchen_schedule.updated_at, kitchen_analytics.created_by.
--   3. order_payments: add the columns the app's own /api/order-payments route
--      and complete_payment_atomic write (the table only had the old ones).
--   4. deduct_stock_for_order: wrapper the payment RPC calls but that never
--      existed (real deduction logic lives in deduct_stock_on_order).
--   5. profiles: view over staff (accept_order_atomic reads the assignee name
--      from public.profiles, which did not exist).
--   6. activate_table_atomic / auto_no_show_v2: fix their malformed
--      operation_logs INSERTs (column/value count mismatch).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. operation_logs compatibility layer
-- ---------------------------------------------------------------------------

-- Legacy INSERTs never supply `operation`; the canonical schema requires it.
ALTER TABLE public.operation_logs ALTER COLUMN operation DROP NOT NULL;

-- Legacy alias columns referenced by the deployed functions.
ALTER TABLE public.operation_logs
  ADD COLUMN IF NOT EXISTS table_number INT,
  ADD COLUMN IF NOT EXISTS action TEXT,
  ADD COLUMN IF NOT EXISTS old_values JSONB,
  ADD COLUMN IF NOT EXISTS new_values JSONB,
  ADD COLUMN IF NOT EXISTS reservation_id UUID,
  ADD COLUMN IF NOT EXISTS table_name TEXT,
  ADD COLUMN IF NOT EXISTS record_id UUID,
  ADD COLUMN IF NOT EXISTS old_data JSONB,
  ADD COLUMN IF NOT EXISTS new_data JSONB,
  ADD COLUMN IF NOT EXISTS type TEXT,
  ADD COLUMN IF NOT EXISTS payload JSONB;

CREATE OR REPLACE FUNCTION public.operation_logs_normalize() RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.operation IS NULL THEN
    NEW.operation := COALESCE(NEW.action, NEW.type, NEW.table_name, 'log');
  END IF;

  IF NEW.source_table_number IS NULL THEN
    NEW.source_table_number := NEW.table_number;
  END IF;

  -- old_state/new_state have NOT NULL DEFAULT '{}'; only override when they
  -- still carry the empty default and a legacy value was actually provided.
  IF NEW.old_state = '{}'::jsonb AND NEW.old_values IS NOT NULL THEN
    NEW.old_state := NEW.old_values;
  ELSIF NEW.old_state = '{}'::jsonb AND NEW.old_data IS NOT NULL THEN
    NEW.old_state := NEW.old_data;
  END IF;

  IF NEW.new_state = '{}'::jsonb AND NEW.new_values IS NOT NULL THEN
    NEW.new_state := NEW.new_values;
  ELSIF NEW.new_state = '{}'::jsonb AND NEW.new_data IS NOT NULL THEN
    NEW.new_state := NEW.new_data;
  END IF;

  IF NEW.undo_payload IS NULL THEN
    NEW.undo_payload := NEW.payload;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_operation_logs_normalize ON public.operation_logs;
CREATE TRIGGER trg_operation_logs_normalize
  BEFORE INSERT ON public.operation_logs
  FOR EACH ROW EXECUTE FUNCTION public.operation_logs_normalize();

-- ---------------------------------------------------------------------------
-- 2. Missing columns written by kitchen/table RPCs
-- ---------------------------------------------------------------------------

ALTER TABLE public.table_floors
  ADD COLUMN IF NOT EXISTS kitchen_status TEXT;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS assigned_to_name TEXT;

ALTER TABLE public.kitchen_schedule
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE public.kitchen_analytics
  ADD COLUMN IF NOT EXISTS created_by UUID;

-- ---------------------------------------------------------------------------
-- 3. order_payments: columns written by /api/order-payments and
--    complete_payment_atomic (kept alongside the legacy ones).
-- ---------------------------------------------------------------------------

ALTER TABLE public.order_payments
  ADD COLUMN IF NOT EXISTS method TEXT,
  ADD COLUMN IF NOT EXISTS currency TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT,
  ADD COLUMN IF NOT EXISTS transaction_id TEXT,
  ADD COLUMN IF NOT EXISTS split_group_id UUID,
  ADD COLUMN IF NOT EXISTS is_partial BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_refund BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS reference_order_id UUID,
  ADD COLUMN IF NOT EXISTS created_by UUID;

-- ---------------------------------------------------------------------------
-- 4. deduct_stock_for_order: wrapper for complete_payment_atomic
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.deduct_stock_for_order(p_order_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN public.deduct_stock_on_order(p_order_id);
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. profiles: view over staff for accept_order_atomic (assignee name)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.profiles AS
  SELECT id, name, full_name AS name_full, role, is_active, created_at
  FROM public.staff;

-- ---------------------------------------------------------------------------
-- 6. activate_table_atomic / auto_no_show_v2: malformed INSERTs
--    (trailing NULL made column/value counts mismatch).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.activate_table_atomic(p_table_id uuid, p_guest_count integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_table RECORD;
  v_reservation RECORD;
  v_order_id UUID;
  v_result JSONB;
BEGIN
  SELECT * INTO v_table FROM public.table_floors WHERE id = p_table_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'TABLE_NOT_FOUND');
  END IF;

  IF v_table.status != 'reserved' THEN
    RETURN jsonb_build_object('success', false, 'error', 'TABLE_NOT_RESERVED');
  END IF;

  SELECT * INTO v_reservation FROM public.reservations
    WHERE id = v_table.reservation_id AND status = 'confirmed'
    FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'RESERVATION_NOT_FOUND');
  END IF;

  INSERT INTO public.orders (
    table_number, status, guest_count, reservation_id, customer_id, customer_name,
    customer_phone, kitchen_status, is_draft, created_at, updated_at, version
  ) VALUES (
    v_table.table_number, 'confirmed', COALESCE(p_guest_count, v_reservation.guests),
    v_reservation.id, v_reservation.customer_id, v_reservation.name, v_reservation.phone,
    'pending', false, NOW(), NOW(), 1
  ) RETURNING id INTO v_order_id;

  INSERT INTO public.order_items (
    order_id, product_id, product_name, quantity, unit_price, total_price,
    kitchen_status, price_snapshot, created_at
  )
  SELECT
    v_order_id, rpi.product_id, rpi.product_name, rpi.quantity, rpi.unit_price,
    rpi.unit_price * rpi.quantity, 'pending',
    jsonb_build_object(
      'unit_price', rpi.unit_price, 'quantity', rpi.quantity,
      'total_price', rpi.unit_price * rpi.quantity, 'snapshot_at', NOW()
    ), NOW()
  FROM public.reservation_preorder_items rpi
  WHERE rpi.reservation_id = v_reservation.id;

  UPDATE public.table_floors SET
    status = 'occupied',
    current_order_id = v_order_id,
    reservation_id = NULL,
    reservation_name = NULL,
    reservation_phone = NULL,
    reservation_time = NULL,
    updated_at = NOW()
  WHERE id = p_table_id;

  INSERT INTO public.operation_logs (
    operation, order_id, source_table_number, old_state, new_state, performed_by
  ) VALUES (
    'activate_table', v_order_id, v_table.table_number,
    jsonb_build_object('status', v_table.status, 'reservation_id', v_table.reservation_id),
    jsonb_build_object('status', 'occupied', 'order_id', v_order_id),
    NULL
  );

  RETURN jsonb_build_object('success', true, 'table', v_table, 'order_id', v_order_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.auto_no_show_v2()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_reservation RECORD;
  v_count INT := 0;
BEGIN
  FOR v_reservation IN
    SELECT * FROM public.reservations
    WHERE status = 'confirmed'
      AND date < CURRENT_DATE
    FOR UPDATE
  LOOP
    UPDATE public.reservations SET
      status = 'no_show',
      no_show_at = NOW(),
      updated_at = NOW()
    WHERE id = v_reservation.id;

    IF v_reservation.table_ids IS NOT NULL THEN
      UPDATE public.table_floors SET
        status = 'empty',
        reservation_id = NULL,
        reservation_name = NULL,
        reservation_phone = NULL,
        reservation_time = NULL,
        updated_at = NOW()
      WHERE table_number = ANY(
        CASE
          WHEN jsonb_typeof(v_reservation.table_ids::jsonb) = 'array' THEN
            (SELECT array_agg(x::int) FROM jsonb_array_elements_text(v_reservation.table_ids::jsonb) AS x)
          ELSE ARRAY[]::INT[]
        END
      );
    END IF;

    INSERT INTO public.operation_logs (
      operation, old_state, new_state
    ) VALUES (
      'auto_no_show',
      jsonb_build_object('status', 'confirmed'),
      jsonb_build_object('status', 'no_show')
    );

    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'processed', v_count);
END;
$function$;

-- ---------------------------------------------------------------------------
-- 7. complete_payment_atomic (terminal version): the order_payments INSERT had
--    `COALESCE((v_payment->>'currency')::NUMERIC, 'AZN')` which casts the text
--    default 'AZN' to NUMERIC → runtime error. Use the new text `currency`
--    column properly.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.complete_payment_atomic(p_order_id uuid, p_payments jsonb, p_payment_method text DEFAULT 'cash'::text, p_cash_amount numeric DEFAULT 0, p_card_amount numeric DEFAULT 0, p_tip_amount numeric DEFAULT 0, p_discount_amount numeric DEFAULT 0, p_discount_type text DEFAULT NULL::text, p_performed_by uuid DEFAULT NULL::uuid, p_performed_by_terminal_id text DEFAULT NULL::text)
 RETURNS jsonb
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
      COALESCE(v_payment->>'is_partial', false),
      COALESCE(v_payment->>'is_refund', false),
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

-- ---------------------------------------------------------------------------
-- 8. process_order_payment: JOINed `recipe_items`, a table that does not
--    exist (the real table is `recipes` keyed by menu_item_id). This broke
--    the /api/orders/pay path.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.process_order_payment(p_order_id uuid, p_payment_method text DEFAULT 'card'::text, p_paid_amount numeric DEFAULT NULL::numeric, p_tip_amount numeric DEFAULT 0, p_campaign_id uuid DEFAULT NULL::uuid, p_discount_amount numeric DEFAULT 0, p_discount_type text DEFAULT NULL::text, p_performed_by uuid DEFAULT NULL::uuid, p_cash_amount numeric DEFAULT NULL::numeric, p_card_amount numeric DEFAULT NULL::numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_order RECORD;
  v_new_paid numeric;
  v_total_paid numeric;
  v_profit numeric;
  v_cogs numeric := 0;
  v_fully_paid boolean;
  v_result jsonb;
  v_now timestamptz := now();
  v_ingredient RECORD;
  v_already_deducted boolean := false;
BEGIN
  SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order % not found', p_order_id;
  END IF;
  IF v_order.status = 'paid' THEN
    SELECT COALESCE(SUM(amount), 0) INTO v_total_paid FROM order_payments WHERE order_id = p_order_id;
    RETURN jsonb_build_object('success', false, 'duplicate', true, 'message', 'Order already paid', 'total_paid', v_total_paid, 'cogs', 0, 'profit', 0, 'fully_paid', true);
  END IF;
  v_new_paid := COALESCE(p_paid_amount, 0);
  v_total_paid := v_new_paid;
  v_total_paid := LEAST(v_total_paid, v_order.total_amount);
  IF v_new_paid > v_order.total_amount THEN
    RAISE EXCEPTION 'OVERPAYMENT: paid % exceeds total %', v_new_paid, v_order.total_amount;
  END IF;
  SELECT EXISTS (SELECT 1 FROM inventory_logs WHERE type = 'order_consumption' AND order_id = p_order_id) INTO v_already_deducted;
  IF v_already_deducted THEN
    SELECT COALESCE(SUM(quantity * unit_cost), 0) INTO v_cogs FROM inventory_logs WHERE type = 'order_consumption' AND order_id = p_order_id;
  ELSE
    FOR v_ingredient IN
      SELECT oi.product_id, oi.quantity, r.ingredient_id,
             COALESCE(r.quantity_brutto, r.quantity_required) AS ingred_qty,
             i.average_cost_per_unit, i.current_stock, i.unit
      FROM order_items oi
      JOIN recipes r ON r.menu_item_id = oi.product_id
      JOIN ingredients i ON i.id = r.ingredient_id
      WHERE oi.order_id = p_order_id
    LOOP
      INSERT INTO inventory_logs (ingredient_id, quantity, type, unit_cost, reference_type, reference_id, created_at)
      VALUES (v_ingredient.ingredient_id, -(v_ingredient.ingred_qty * v_ingredient.quantity), 'order_consumption'::inventory_log_type, v_ingredient.average_cost_per_unit, 'order', p_order_id, v_now);
      v_cogs := v_cogs + (v_ingredient.average_cost_per_unit * v_ingredient.ingred_qty * v_ingredient.quantity);
    END LOOP;
  END IF;
  v_profit := v_total_paid - v_cogs;
  IF p_cash_amount IS NOT NULL AND p_cash_amount > 0 THEN
    INSERT INTO order_payments (order_id, payment_method, amount, created_at) VALUES (p_order_id, 'cash', p_cash_amount, v_now);
  END IF;
  IF p_card_amount IS NOT NULL AND p_card_amount > 0 THEN
    INSERT INTO order_payments (order_id, payment_method, amount, created_at) VALUES (p_order_id, 'card', p_card_amount, v_now);
  END IF;
  IF p_cash_amount IS NULL AND p_card_amount IS NULL THEN
    INSERT INTO order_payments (order_id, payment_method, amount, created_at) VALUES (p_order_id, p_payment_method, v_new_paid, v_now);
  END IF;
  UPDATE orders SET status = 'paid', paid_amount = v_total_paid, payment_method = p_payment_method, tip_amount = COALESCE(p_tip_amount, 0), cash_amount = COALESCE(p_cash_amount, 0), card_amount = COALESCE(p_card_amount, 0), cogs = v_cogs, profit = v_profit, paid_at = v_now, inventory_deducted = true, discount_amount = COALESCE(p_discount_amount, 0), discount_type = p_discount_type, campaign_id = p_campaign_id, updated_at = v_now WHERE id = p_order_id;
  IF COALESCE(v_order.order_source, 'dine_in') = 'dine_in' AND v_order.table_number IS NOT NULL THEN
    UPDATE table_floors SET status = 'dirty', total_amount = 0, guest_count = NULL, order_count = 0, bill_requested = false WHERE table_number = v_order.table_number;
  END IF;
  INSERT INTO audit_log (table_name, record_id, action, old_data, new_data, performed_by) VALUES ('orders', p_order_id, 'payment', jsonb_build_object('status', v_order.status), jsonb_build_object('status', 'paid', 'amount', v_total_paid, 'cogs', v_cogs, 'profit', v_profit, 'method', p_payment_method, 'discount_type', p_discount_type, 'discount_amount', p_discount_amount, 'tip', p_tip_amount, 'total_paid', v_total_paid), p_performed_by);
  INSERT INTO notifications (title, body, type, created_at) VALUES ('Ödəniş qəbul edildi', CASE WHEN v_order.table_number IS NOT NULL THEN 'Masa ' || v_order.table_number || ' - ' || v_total_paid || ' AZN (cogs: ' || v_cogs || ', profit: ' || v_profit || ')' ELSE v_total_paid || ' AZN ödəniş qəbul edildi' END, 'payment', v_now);
  SELECT jsonb_build_object('success', true, 'cogs', v_cogs, 'profit', v_profit, 'fully_paid', v_total_paid >= v_order.total_amount, 'paid_amount', v_new_paid, 'total_paid', v_total_paid, 'duplicate', false) INTO v_result;
  RETURN v_result;
END;
$function$;
