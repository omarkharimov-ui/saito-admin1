-- ============================================================================
-- FIX 28: Add terminal_id tracking + version increment to all order-updating RPCs
-- ============================================================================
-- Every RPC that modifies orders must:
-- 1. Accept a terminal/session ID parameter
-- 2. Set updated_by_terminal_id on orders and order_items
-- 3. Increment order version so optimistic locking stays accurate
-- ============================================================================

-- dismiss_table_atomic
CREATE OR REPLACE FUNCTION public.dismiss_table_atomic(
  p_table_number INT,
  p_reason TEXT DEFAULT 'dismissed',
  p_final_status TEXT DEFAULT 'empty',
  p_performed_by UUID DEFAULT NULL,
  p_terminal_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_table RECORD;
  v_order RECORD;
BEGIN
  SELECT * INTO v_table FROM public.table_floors WHERE table_number = p_table_number FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Table not found');
  END IF;

  SELECT * INTO v_order FROM public.orders 
  WHERE table_number = p_table_number 
    AND status NOT IN ('paid', 'cancelled', 'closed', 'completed')
  ORDER BY created_at ASC LIMIT 1;

  IF v_order.id IS NOT NULL THEN
    UPDATE public.orders SET
      status = 'cancelled',
      cancelled_at = NOW(),
      cancelled_reason = p_reason,
      updated_at = NOW(),
      version = COALESCE(v_order.version, 0) + 1,
      updated_by_terminal_id = p_terminal_id
    WHERE id = v_order.id;

    DELETE FROM public.order_items WHERE order_id = v_order.id AND kitchen_status IN ('pending', 'reserved');
  END IF;

  UPDATE public.table_floors SET
    status = p_final_status,
    guest_count = NULL,
    total_amount = 0,
    order_count = 0,
    current_order_id = NULL,
    merged_into_table = NULL,
    reservation_id = NULL,
    reservation_name = NULL,
    reservation_phone = NULL,
    reservation_time = NULL,
    bill_requested = false,
    updated_at = NOW(),
    updated_by_terminal_id = p_terminal_id
  WHERE table_number = p_table_number;

  INSERT INTO public.operation_logs (
    table_number, order_id, action, old_values, new_values, performed_by
  ) VALUES (
    p_table_number,
    COALESCE(v_order.id, NULL),
    'dismiss_table',
    jsonb_build_object('status', v_table.status),
    jsonb_build_object('status', p_final_status, 'reason', p_reason),
    p_performed_by
  );

  RETURN jsonb_build_object('success', true);
END;
$$;

-- merge_tables_atomic
CREATE OR REPLACE FUNCTION public.merge_tables_atomic(
  p_parent_table_number INT,
  p_child_table_numbers INT[],
  p_performed_by UUID DEFAULT NULL,
  p_performed_by_terminal_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_parent RECORD;
  v_child RECORD;
  v_parent_order_id UUID;
  v_child_order_ids UUID[] := '{}';
  v_merged_group_id TEXT;
BEGIN
  IF p_parent_table_number = ANY(p_child_table_numbers) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Parent cannot be in child list');
  END IF;

  SELECT * INTO v_parent FROM public.table_floors WHERE table_number = p_parent_table_number FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Parent table not found');
  END IF;

  FOR v_child IN SELECT * FROM public.table_floors WHERE table_number = ANY(p_child_table_numbers) FOR UPDATE LOOP
    NULL;
  END LOOP;

  SELECT id INTO v_parent_order_id FROM public.orders 
  WHERE table_number = p_parent_table_number 
    AND status NOT IN ('paid', 'cancelled', 'closed', 'completed')
  ORDER BY created_at ASC LIMIT 1;

  IF v_parent_order_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No active order on parent table');
  END IF;

  FOR v_child IN SELECT * FROM public.table_floors WHERE table_number = ANY(p_child_table_numbers) LOOP
    UPDATE public.orders SET
      merged_into = v_parent_order_id,
      table_number = p_parent_table_number,
      updated_at = NOW(),
      version = COALESCE(version, 0) + 1,
      updated_by_terminal_id = p_performed_by_terminal_id
    WHERE table_number = v_child.table_number 
      AND status NOT IN ('paid', 'cancelled', 'closed', 'completed')
      AND merged_into IS NULL;

    SELECT array_agg(id) INTO v_child_order_ids FROM public.orders 
    WHERE table_number = v_child.table_number AND merged_into = v_parent_order_id;
  END LOOP;

  UPDATE public.table_floors SET
    merged_into_table = p_parent_table_number,
    status = 'empty',
    current_order_id = NULL,
    updated_at = NOW(),
    updated_by_terminal_id = p_performed_by_terminal_id
  WHERE table_number = ANY(p_child_table_numbers);

  UPDATE public.kitchen_schedule SET
    table_number = p_parent_table_number,
    updated_at = NOW()
  WHERE table_number = ANY(p_child_table_numbers);

  FOR v_child IN SELECT * FROM public.table_floors WHERE table_number = ANY(p_child_table_numbers) LOOP
    IF v_child.reservation_id IS NOT NULL THEN
      UPDATE public.reservations SET
        table_ids = array_remove(table_ids, v_child.table_number),
        updated_at = NOW()
      WHERE id = v_child.reservation_id;

      UPDATE public.reservations SET
        table_ids = array_append(
          CASE WHEN table_ids @> ARRAY[p_parent_table_number] THEN table_ids ELSE array_append(table_ids, p_parent_table_number) END,
          v_child.table_number
        ),
        updated_at = NOW()
      WHERE id = (
        SELECT id FROM public.reservations 
        WHERE id != v_child.reservation_id 
          AND table_ids @> ARRAY[p_parent_table_number]
        LIMIT 1
      );
    END IF;
  END LOOP;

  v_merged_group_id := 'group-' || p_parent_table_number;

  INSERT INTO public.operation_logs (
    table_number, order_id, action, old_values, new_values, performed_by
  ) VALUES (
    p_parent_table_number,
    v_parent_order_id,
    'merge_tables',
    jsonb_build_object('children', p_child_table_numbers),
    jsonb_build_object('merged_group_id', v_merged_group_id),
    p_performed_by
  );

  RETURN jsonb_build_object('success', true, 'parent_order_id', v_parent_order_id, 'merged_group_id', v_merged_group_id);
END;
$$;

-- transfer_table_atomic
CREATE OR REPLACE FUNCTION public.transfer_table_atomic(
  p_from_table INT,
  p_to_table INT,
  p_performed_by UUID DEFAULT NULL,
  p_performed_by_terminal_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_from RECORD;
  v_to RECORD;
  v_order RECORD;
  v_total_guests INT := 0;
  v_total_amount NUMERIC := 0;
BEGIN
  IF p_from_table = p_to_table THEN
    RETURN jsonb_build_object('success', false, 'error', 'Source and target are the same');
  END IF;

  SELECT * INTO v_from FROM public.table_floors WHERE table_number = p_from_table FOR UPDATE;
  SELECT * INTO v_to FROM public.table_floors WHERE table_number = p_to_table FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Table not found');
  END IF;

  SELECT * INTO v_order FROM public.orders 
  WHERE table_number = p_from_table 
    AND status NOT IN ('paid', 'cancelled', 'closed', 'completed')
  ORDER BY created_at ASC LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'No active order on source table');
  END IF;

  v_total_guests := COALESCE(v_order.guest_count, 0);
  v_total_amount := COALESCE(v_order.total_amount, 0);

  UPDATE public.orders SET
    table_number = p_to_table,
    updated_at = NOW(),
    version = COALESCE(version, 0) + 1,
    updated_by_terminal_id = p_performed_by_terminal_id
  WHERE table_number = p_from_table 
    AND status NOT IN ('paid', 'cancelled', 'closed', 'completed');

  UPDATE public.table_floors SET
    status = 'occupied',
    guest_count = v_total_guests,
    total_amount = v_total_amount,
    current_order_id = v_order.id,
    merged_into_table = NULL,
    reservation_id = NULL,
    reservation_name = NULL,
    reservation_phone = NULL,
    reservation_time = NULL,
    updated_at = NOW(),
    updated_by_terminal_id = p_performed_by_terminal_id
  WHERE table_number = p_to_table;

  IF v_from.reservation_id IS NOT NULL THEN
    UPDATE public.reservations SET
      table_ids = array_remove(table_ids, p_from_table),
      updated_at = NOW()
    WHERE id = v_from.reservation_id;

    IF NOT (table_ids @> ARRAY[p_to_table]) THEN
      UPDATE public.reservations SET
        table_ids = array_append(table_ids, p_to_table),
        updated_at = NOW()
      WHERE id = v_from.reservation_id;
    END IF;
  END IF;

  UPDATE public.table_floors SET
    status = 'empty',
    guest_count = NULL,
    total_amount = 0,
    current_order_id = NULL,
    merged_into_table = NULL,
    reservation_id = NULL,
    reservation_name = NULL,
    reservation_phone = NULL,
    reservation_time = NULL,
    updated_at = NOW(),
    updated_by_terminal_id = p_performed_by_terminal_id
  WHERE table_number = p_from_table;

  INSERT INTO public.operation_logs (
    table_number, order_id, action, old_values, new_values, performed_by
  ) VALUES (
    p_from_table,
    v_order.id,
    'transfer_table',
    jsonb_build_object('from_table', p_from_table),
    jsonb_build_object('to_table', p_to_table),
    p_performed_by
  );

  RETURN jsonb_build_object('success', true, 'order_id', v_order.id);
END;
$$;

-- reopen_order_atomic
CREATE OR REPLACE FUNCTION public.reopen_order_atomic(
  p_order_id UUID,
  p_reason TEXT DEFAULT 'reopen',
  p_performed_by UUID DEFAULT NULL,
  p_performed_by_terminal_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order RECORD;
  v_tx RECORD;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;

  IF v_order.status NOT IN ('paid', 'completed') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order is not paid/completed');
  END IF;

  FOR v_tx IN SELECT * FROM public.inventory_transactions WHERE reference_id = p_order_id AND reference_type = 'order' LOOP
    INSERT INTO public.inventory_transactions (
      order_item_id, ingredient_id, quantity, unit, transaction_type, reference_type, reference_id, performed_by
    ) VALUES (
      v_tx.order_item_id,
      v_tx.ingredient_id,
      -v_tx.quantity,
      v_tx.unit,
      'reversal',
      v_tx.reference_type,
      v_tx.reference_id,
      p_performed_by
    );
  END LOOP;

  DELETE FROM public.order_payments WHERE order_id = p_order_id;

  UPDATE public.orders SET
    status = 'new',
    paid_amount = 0,
    cash_amount = 0,
    card_amount = 0,
    tip_amount = 0,
    paid_at = NULL,
    updated_at = NOW(),
    version = COALESCE(v_order.version, 0) + 1,
    updated_by_terminal_id = p_performed_by_terminal_id
  WHERE id = p_order_id;

  INSERT INTO public.operation_logs (
    table_number, order_id, action, old_values, new_values, performed_by
  ) VALUES (
    v_order.table_number,
    p_order_id,
    'reopen_order',
    jsonb_build_object('status', v_order.status),
    jsonb_build_object('status', 'new', 'reason', p_reason),
    p_performed_by
  );

  RETURN jsonb_build_object('success', true);
END;
$$;

-- transition_delivery_status
CREATE OR REPLACE FUNCTION public.transition_delivery_status(
  p_order_id UUID,
  p_new_status TEXT,
  p_courier_id UUID DEFAULT NULL,
  p_courier_name TEXT DEFAULT NULL,
  p_performed_by UUID DEFAULT NULL,
  p_performed_by_terminal_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order RECORD;
  v_update JSONB;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;

  v_update := jsonb_build_object(
    'delivery_status', p_new_status,
    'updated_at', NOW(),
    'version', COALESCE(v_order.version, 0) + 1,
    'updated_by_terminal_id', p_performed_by_terminal_id
  );

  IF p_new_status = 'delivered' THEN
    v_update := v_update || jsonb_build_object('delivered_at', NOW(), 'status', 'paid');
  END IF;

  IF p_courier_id IS NOT NULL THEN
    v_update := v_update || jsonb_build_object('courier_id', p_courier_id);
  END IF;

  IF p_courier_name IS NOT NULL THEN
    v_update := v_update || jsonb_build_object('courier_name', p_courier_name);
  END IF;

  UPDATE public.orders SET
    delivery_status = p_new_status,
    status = CASE WHEN p_new_status = 'delivered' THEN 'paid' ELSE status END,
    delivered_at = CASE WHEN p_new_status = 'delivered' THEN NOW() ELSE delivered_at END,
    courier_id = p_courier_id,
    courier_name = p_courier_name,
    updated_at = NOW(),
    version = COALESCE(v_order.version, 0) + 1,
    updated_by_terminal_id = p_performed_by_terminal_id
  WHERE id = p_order_id;

  INSERT INTO public.operation_logs (
    order_id, action, old_values, new_values, performed_by
  ) VALUES (
    p_order_id, 'transition_delivery_status',
    jsonb_build_object('delivery_status', v_order.delivery_status),
    jsonb_build_object('delivery_status', p_new_status),
    p_performed_by
  );

  RETURN jsonb_build_object('success', true, 'order_id', p_order_id);
END;
$$;

-- send_to_kitchen_atomic
CREATE OR REPLACE FUNCTION public.send_to_kitchen_atomic(
  p_order_id UUID,
  p_performed_by UUID DEFAULT NULL,
  p_performed_by_terminal_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order RECORD;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;

  IF v_order.kitchen_status IN ('pending', 'accepted', 'preparing', 'ready', 'served') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order already sent to kitchen');
  END IF;

  UPDATE public.orders SET
    kitchen_status = 'pending',
    is_draft = false,
    kitchen_accepted_at = NOW(),
    updated_at = NOW(),
    version = COALESCE(v_order.version, 0) + 1,
    updated_by_terminal_id = p_performed_by_terminal_id
  WHERE id = p_order_id;

  UPDATE public.order_items SET
    kitchen_status = 'pending',
    updated_at = NOW()
  WHERE order_id = p_order_id AND kitchen_status = 'reserved';

  IF v_order.table_number IS NOT NULL THEN
    UPDATE public.table_floors SET
      kitchen_status = 'pending',
      updated_at = NOW()
    WHERE table_number = v_order.table_number;
  END IF;

  INSERT INTO public.operation_logs (
    table_number, order_id, action, old_values, new_values, performed_by
  ) VALUES (
    v_order.table_number, p_order_id, 'send_to_kitchen',
    jsonb_build_object('kitchen_status', v_order.kitchen_status),
    jsonb_build_object('kitchen_status', 'pending'),
    p_performed_by
  );

  RETURN jsonb_build_object('success', true);
END;
$$;

-- accept_kitchen_ticket_atomic
CREATE OR REPLACE FUNCTION public.accept_kitchen_ticket_atomic(
  p_order_id UUID,
  p_performed_by UUID DEFAULT NULL,
  p_performed_by_terminal_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order RECORD;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;

  IF v_order.kitchen_status != 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order is not pending');
  END IF;

  UPDATE public.orders SET
    kitchen_status = 'accepted',
    updated_at = NOW(),
    version = COALESCE(v_order.version, 0) + 1,
    updated_by_terminal_id = p_performed_by_terminal_id
  WHERE id = p_order_id;

  IF v_order.table_number IS NOT NULL THEN
    UPDATE public.table_floors SET
      kitchen_status = 'accepted',
      updated_at = NOW()
    WHERE table_number = v_order.table_number;
  END IF;

  INSERT INTO public.operation_logs (
    table_number, order_id, action, old_values, new_values, performed_by
  ) VALUES (
    v_order.table_number, p_order_id, 'accept_kitchen_ticket',
    jsonb_build_object('kitchen_status', 'pending'),
    jsonb_build_object('kitchen_status', 'accepted'),
    p_performed_by
  );

  RETURN jsonb_build_object('success', true);
END;
$$;

-- start_preparing_atomic
CREATE OR REPLACE FUNCTION public.start_preparing_atomic(
  p_order_id UUID,
  p_performed_by UUID DEFAULT NULL,
  p_performed_by_terminal_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order RECORD;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;

  IF v_order.kitchen_status NOT IN ('accepted', 'pending') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order cannot start preparing');
  END IF;

  UPDATE public.orders SET
    kitchen_status = 'preparing',
    updated_at = NOW(),
    version = COALESCE(v_order.version, 0) + 1,
    updated_by_terminal_id = p_performed_by_terminal_id
  WHERE id = p_order_id;

  IF v_order.table_number IS NOT NULL THEN
    UPDATE public.table_floors SET
      kitchen_status = 'preparing',
      updated_at = NOW()
    WHERE table_number = v_order.table_number;
  END IF;

  INSERT INTO public.operation_logs (
    table_number, order_id, action, old_values, new_values, performed_by
  ) VALUES (
    v_order.table_number, p_order_id, 'start_preparing',
    jsonb_build_object('kitchen_status', v_order.kitchen_status),
    jsonb_build_object('kitchen_status', 'preparing'),
    p_performed_by
  );

  RETURN jsonb_build_object('success', true);
END;
$$;

-- mark_ready_atomic
CREATE OR REPLACE FUNCTION public.mark_ready_atomic(
  p_order_id UUID,
  p_performed_by UUID DEFAULT NULL,
  p_performed_by_terminal_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order RECORD;
  v_item RECORD;
  v_recipe RECORD;
  v_deducted INT := 0;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;

  IF v_order.kitchen_status NOT IN ('preparing', 'accepted', 'pending') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order cannot be marked ready');
  END IF;

  IF v_order.status != 'paid' THEN
    FOR v_item IN 
      SELECT oi.id, oi.product_id, oi.quantity, p.is_ready_product, p.direct_ingredient_id
      FROM public.order_items oi
      JOIN public.products p ON p.id = oi.product_id
      WHERE oi.order_id = p_order_id
      FOR UPDATE
    LOOP
      IF v_item.is_ready_product AND v_item.direct_ingredient_id IS NOT NULL THEN
        INSERT INTO public.inventory_transactions (
          order_item_id, ingredient_id, quantity, unit, transaction_type,
          reference_type, reference_id, performed_by, created_at
        ) VALUES (
          v_item.id, v_item.direct_ingredient_id, v_item.quantity, 'piece', 'order_consumption',
          'order', p_order_id, p_performed_by, NOW()
        );
        v_deducted := v_deducted + 1;
      ELSE
        FOR v_recipe IN 
          SELECT r.ingredient_id, r.quantity_required, r.quantity_brutto, i.unit
          FROM public.recipes r
          JOIN public.ingredients i ON i.id = r.ingredient_id
          WHERE r.menu_item_id = v_item.product_id
        LOOP
          INSERT INTO public.inventory_transactions (
            order_item_id, ingredient_id, quantity, unit, transaction_type,
            reference_type, reference_id, performed_by, created_at
          ) VALUES (
            v_item.id, v_recipe.ingredient_id, 
            COALESCE(v_recipe.quantity_brutto, v_recipe.quantity_required) * v_item.quantity,
            v_recipe.unit, 'order_consumption', 'order', p_order_id, p_performed_by, NOW()
          );
          v_deducted := v_deducted + 1;
        END LOOP;
      END IF;
    END LOOP;
  END IF;

  UPDATE public.orders SET
    kitchen_status = 'ready',
    kitchen_ready_at = NOW(),
    updated_at = NOW(),
    version = COALESCE(v_order.version, 0) + 1,
    updated_by_terminal_id = p_performed_by_terminal_id
  WHERE id = p_order_id;

  IF v_order.table_number IS NOT NULL THEN
    UPDATE public.table_floors SET
      kitchen_status = 'ready',
      updated_at = NOW()
    WHERE table_number = v_order.table_number;
  END IF;

  INSERT INTO public.operation_logs (
    table_number, order_id, action, old_values, new_values, performed_by
  ) VALUES (
    v_order.table_number, p_order_id, 'mark_ready',
    jsonb_build_object('kitchen_status', v_order.kitchen_status),
    jsonb_build_object('kitchen_status', 'ready', 'inventory_deducted', v_deducted),
    p_performed_by
  );

  RETURN jsonb_build_object('success', true, 'inventory_deducted', v_deducted);
END;
$$;

-- mark_served_atomic
CREATE OR REPLACE FUNCTION public.mark_served_atomic(
  p_order_id UUID,
  p_performed_by UUID DEFAULT NULL,
  p_performed_by_terminal_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order RECORD;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;

  IF v_order.kitchen_status NOT IN ('ready', 'preparing') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order cannot be marked served');
  END IF;

  UPDATE public.orders SET
    kitchen_status = 'served',
    updated_at = NOW(),
    version = COALESCE(v_order.version, 0) + 1,
    updated_by_terminal_id = p_performed_by_terminal_id
  WHERE id = p_order_id;

  IF v_order.table_number IS NOT NULL THEN
    UPDATE public.table_floors SET
      kitchen_status = 'served',
      updated_at = NOW()
    WHERE table_number = v_order.table_number;
  END IF;

  INSERT INTO public.operation_logs (
    table_number, order_id, action, old_values, new_values, performed_by
  ) VALUES (
    v_order.table_number, p_order_id, 'mark_served',
    jsonb_build_object('kitchen_status', v_order.kitchen_status),
    jsonb_build_object('kitchen_status', 'served'),
    p_performed_by
  );

  RETURN jsonb_build_object('success', true);
END;
$$;

-- reopen_kitchen_ticket_atomic
CREATE OR REPLACE FUNCTION public.reopen_kitchen_ticket_atomic(
  p_order_id UUID,
  p_performed_by UUID DEFAULT NULL,
  p_performed_by_terminal_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order RECORD;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;

  IF v_order.kitchen_status NOT IN ('ready', 'served', 'cancelled') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order cannot be reopened');
  END IF;

  UPDATE public.orders SET
    kitchen_status = 'pending',
    updated_at = NOW(),
    version = COALESCE(v_order.version, 0) + 1,
    updated_by_terminal_id = p_performed_by_terminal_id
  WHERE id = p_order_id;

  UPDATE public.order_items SET
    kitchen_status = 'pending',
    updated_at = NOW()
  WHERE order_id = p_order_id AND kitchen_status IN ('ready', 'served', 'cancelled');

  IF v_order.table_number IS NOT NULL THEN
    UPDATE public.table_floors SET
      kitchen_status = 'pending',
      updated_at = NOW()
    WHERE table_number = v_order.table_number;
  END IF;

  INSERT INTO public.operation_logs (
    table_number, order_id, action, old_values, new_values, performed_by
  ) VALUES (
    v_order.table_number, p_order_id, 'reopen_kitchen_ticket',
    jsonb_build_object('kitchen_status', v_order.kitchen_status),
    jsonb_build_object('kitchen_status', 'pending'),
    p_performed_by
  );

  RETURN jsonb_build_object('success', true);
END;
$$;

-- complete_payment_atomic (add updated_by_terminal_id)
CREATE OR REPLACE FUNCTION public.complete_payment_atomic(
  p_order_id UUID,
  p_payments JSONB,
  p_payment_method TEXT DEFAULT 'cash',
  p_cash_amount NUMERIC DEFAULT 0,
  p_card_amount NUMERIC DEFAULT 0,
  p_tip_amount NUMERIC DEFAULT 0,
  p_discount_amount NUMERIC DEFAULT 0,
  p_discount_type TEXT DEFAULT NULL,
  p_performed_by UUID DEFAULT NULL,
  p_performed_by_terminal_id TEXT DEFAULT NULL
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
      COALESCE((v_payment->>'currency')::NUMERIC, 'AZN'),
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
$$;

-- unmerge_tables_atomic
CREATE OR REPLACE FUNCTION public.unmerge_tables_atomic(
  p_parent_table_number INT,
  p_child_table_numbers INT[],
  p_performed_by UUID DEFAULT NULL,
  p_performed_by_terminal_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_parent_order_id UUID;
  v_child_order RECORD;
  v_child_total NUMERIC := 0;
BEGIN
  IF p_parent_table_number = ANY(p_child_table_numbers) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Parent cannot be in child list');
  END IF;

  SELECT id INTO v_parent_order_id FROM public.orders 
    WHERE table_number = p_parent_table_number 
      AND status NOT IN ('paid', 'cancelled', 'closed', 'completed')
    ORDER BY created_at ASC LIMIT 1;

  IF v_parent_order_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No active order on parent table');
  END IF;

  FOR v_child_order IN 
    SELECT * FROM public.orders 
    WHERE table_number = ANY(p_child_table_numbers) 
      AND merged_into = v_parent_order_id
    FOR UPDATE
  LOOP
    UPDATE public.orders SET
      table_number = v_child_order.table_number,
      merged_into = NULL,
      updated_at = NOW(),
      version = COALESCE(v_child_order.version, 0) + 1,
      updated_by_terminal_id = p_performed_by_terminal_id
    WHERE id = v_child_order.id;

    v_child_total := v_child_total + COALESCE(v_child_order.total_amount, 0);

    UPDATE public.table_floors SET
      status = 'occupied',
      current_order_id = v_child_order.id,
      merged_into_table = NULL,
      updated_at = NOW()
    WHERE table_number = v_child_order.table_number;
  END LOOP;

  UPDATE public.orders SET
    total_amount = GREATEST(0, total_amount - v_child_total),
    updated_at = NOW()
  WHERE id = v_parent_order_id;

  UPDATE public.table_floors SET
    merged_into_table = NULL,
    updated_at = NOW()
  WHERE table_number = p_parent_table_number;

  INSERT INTO public.operation_logs (
    table_number, order_id, action, old_values, new_values, performed_by
  ) VALUES (
    p_parent_table_number, v_parent_order_id, 'unmerge_tables',
    jsonb_build_object('children', p_child_table_numbers),
    jsonb_build_object('parent_order_id', v_parent_order_id),
    p_performed_by
  );

  RETURN jsonb_build_object('success', true, 'parent_order_id', v_parent_order_id);
END;
$$;
