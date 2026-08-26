-- ============================================================================
-- MIGRATION: 20260826180000_close_ssot_bypasses.sql
-- Purpose: Replace all direct DB writes that bypass atomic RPCs
-- Covers: kitchen completed, assigned_to, kitchen-push, finance/loss,
--          item-hold, cash-drawer open
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. mark_order_completed — kitchen "completed" status transition
--    Replaces: kitchen/page.tsx:1013-1017 (direct order_items.update)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mark_order_completed(
  p_order_id  uuid,
  p_performed_by uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order     record;
  v_updated   int := 0;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;

  UPDATE public.order_items
  SET    kitchen_status = 'completed',
         updated_at = now()
  WHERE  order_id = p_order_id
  AND    kitchen_status IS DISTINCT FROM 'completed'
  AND    kitchen_status NOT IN ('voided', 'cancelled', 'wasted');

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  UPDATE public.orders
  SET    kitchen_status = 'completed',
         updated_at = now()
  WHERE  id = p_order_id;

  PERFORM public.log_audit(
    'order_completed', p_order_id, NULL, p_performed_by,
    NULL, NULL, NULL, NULL,
    jsonb_build_object('items_completed', v_updated),
    NULL, NULL, NULL, NULL
  );

  RETURN jsonb_build_object('success', true, 'items_completed', v_updated);
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. assign_order_staff — atomic staff assignment
--    Replaces: kitchen/page.tsx:1090 (direct orders.update assigned_to)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.assign_order_staff(
  p_order_id   uuid,
  p_staff_id   uuid,
  p_performed_by uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order record;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;

  UPDATE public.orders
  SET    assigned_to = p_staff_id,
         updated_at = now()
  WHERE  id = p_order_id;

  PERFORM public.log_audit(
    'order_assigned', p_order_id, NULL, p_performed_by,
    NULL, NULL, NULL, NULL,
    jsonb_build_object('assigned_to', p_staff_id),
    NULL, NULL, NULL, NULL
  );

  RETURN jsonb_build_object('success', true);
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. push_reservation_to_kitchen — atomic reservation → kitchen transition
--    Replaces: reservations/kitchen-push/route.ts:46-50 (3 direct updates)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.push_reservation_to_kitchen(
  p_order_id    uuid,
  p_schedule_id uuid,
  p_performed_by uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_now timestamptz := now();
  v_updated int := 0;
BEGIN
  UPDATE public.orders
  SET    kitchen_status = 'pending',
         kitchen_accepted_at = v_now,
         updated_at = v_now
  WHERE  id = p_order_id;

  UPDATE public.order_items
  SET    kitchen_status = 'pending',
         updated_at = v_now
  WHERE  order_id = p_order_id
  AND    kitchen_status = 'reserved';

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  UPDATE public.kitchen_schedule
  SET    status = 'started'
  WHERE  id = p_schedule_id;

  PERFORM public.log_audit(
    'reservation_pushed_to_kitchen', p_order_id, NULL, p_performed_by,
    NULL, NULL, NULL, NULL,
    jsonb_build_object('items_activated', v_updated, 'schedule_id', p_schedule_id),
    NULL, NULL, NULL, NULL
  );

  RETURN jsonb_build_object('success', true, 'items_activated', v_updated);
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. cancel_loss_table — atomic loss: cancel orders + clear table
--    Replaces: finance/loss/route.ts:22-74 (3 direct updates + RPC mix)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cancel_loss_table(
  p_table_number   int,
  p_reason         text,
  p_reason_text    text DEFAULT NULL,
  p_total_amount   numeric DEFAULT 0,
  p_items          jsonb DEFAULT '[]'::jsonb,
  p_performed_by   uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order_ids uuid[];
  v_order_id  uuid;
BEGIN
  INSERT INTO public.cancelled_orders (order_id, table_number, reason, reason_text, total_amount, items, created_at)
  SELECT o.id, p_table_number, p_reason, COALESCE(p_reason_text, p_reason), p_total_amount, p_items, now()
  FROM public.orders o
  WHERE o.table_number = p_table_number
  AND   o.status NOT IN ('paid', 'cancelled')
  RETURNING order_id INTO v_order_ids;

  FOREACH v_order_id IN ARRAY v_order_ids LOOP
    UPDATE public.order_items
    SET    kitchen_status = 'cancelled', updated_at = now()
    WHERE  order_id = v_order_id;

    PERFORM public.transition_order_status(v_order_id, 'cancelled');
  END LOOP;

  UPDATE public.table_floors
  SET    status = 'empty',
         guest_count = NULL,
         reservation_id = NULL,
         reservation_name = NULL,
         reservation_phone = NULL,
         reservation_time = NULL,
         merged_into_table = NULL
  WHERE  table_number = p_table_number;

  PERFORM public.log_audit(
    'loss_table_cancelled', NULL, NULL, p_performed_by,
    NULL, NULL, NULL, NULL,
    jsonb_build_object('table_number', p_table_number, 'reason', p_reason, 'orders_cancelled', array_length(v_order_ids, 1)),
    NULL, NULL, NULL, NULL
  );

  RETURN jsonb_build_object('success', true, 'orders_cancelled', array_length(v_order_ids, 1));
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. toggle_item_hold — atomic hold toggle
--    Replaces: orders/item-hold/route.ts:16-22 (direct order_items.update)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.toggle_item_hold(
  p_item_id    uuid,
  p_is_hold    boolean,
  p_performed_by uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_item record;
BEGIN
  SELECT * INTO v_item FROM public.order_items WHERE id = p_item_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Item not found');
  END IF;

  UPDATE public.order_items
  SET    is_hold = p_is_hold,
         hold_until = CASE WHEN p_is_hold THEN now() ELSE NULL END,
         updated_at = now()
  WHERE  id = p_item_id;

  PERFORM public.log_audit(
    'item_hold_toggled', v_item.order_id, p_item_id, p_performed_by,
    NULL, NULL, NULL, NULL,
    jsonb_build_object('is_hold', p_is_hold),
    NULL, NULL, NULL, NULL
  );

  RETURN jsonb_build_object('success', true, 'item_id', p_item_id, 'is_hold', p_is_hold);
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. open_cash_register — atomic cash drawer open
--    Replaces: cash-drawer/route.ts:77-95 (2 non-atomic inserts)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.open_cash_register(
  p_opening_balance numeric DEFAULT 0,
  p_notes           text DEFAULT NULL,
  p_opened_by       uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_session_id uuid;
BEGIN
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
$$;
