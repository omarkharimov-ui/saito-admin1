-- ============================================================================
-- FIX 36: kitchen item RPCs + version + missing kitchen ticket actions
-- ============================================================================

-- void_order_item_atomic: bump order version and recalculate total
CREATE OR REPLACE FUNCTION public.void_order_item_atomic(
  p_order_item_id UUID,
  p_reason TEXT DEFAULT 'void',
  p_performed_by UUID DEFAULT NULL,
  p_performed_by_terminal_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_item RECORD;
  v_order RECORD;
  v_tx RECORD;
  v_new_total NUMERIC := 0;
BEGIN
  SELECT * INTO v_item FROM public.order_items WHERE id = p_order_item_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order item not found');
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = v_item.order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;

  IF v_item.kitchen_status = 'cancelled' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Item already voided');
  END IF;

  UPDATE public.order_items SET
    kitchen_status = 'cancelled',
    updated_at = NOW()
  WHERE id = p_order_item_id;

  FOR v_tx IN 
    SELECT * FROM public.inventory_transactions 
    WHERE order_item_id = p_order_item_id AND transaction_type = 'order_consumption'
    FOR UPDATE
  LOOP
    INSERT INTO public.inventory_transactions (
      order_item_id, ingredient_id, quantity, unit, transaction_type,
      reference_type, reference_id, performed_by, created_at
    ) VALUES (
      v_tx.order_item_id, v_tx.ingredient_id, -v_tx.quantity, v_tx.unit, 'reversal',
      v_tx.reference_type, v_tx.reference_id, p_performed_by, NOW()
    );
  END LOOP;

  SELECT COALESCE(SUM(total_price), 0) INTO v_new_total FROM public.order_items WHERE order_id = v_order.id AND kitchen_status != 'cancelled';

  UPDATE public.orders SET
    total_amount = v_new_total,
    version = COALESCE(version, 0) + 1,
    updated_by_terminal_id = p_performed_by_terminal_id,
    updated_at = NOW()
  WHERE id = v_order.id;

  INSERT INTO public.operation_logs (
    table_number, order_id, action, old_values, new_values, performed_by
  ) VALUES (
    v_order.table_number, v_order.id, 'void_order_item',
    jsonb_build_object('item_id', p_order_item_id, 'kitchen_status', v_item.kitchen_status, 'order_total', v_order.total_amount),
    jsonb_build_object('item_id', p_order_item_id, 'kitchen_status', 'cancelled', 'reason', p_reason, 'order_total', v_new_total),
    p_performed_by
  );

  RETURN jsonb_build_object('success', true, 'new_order_total', v_new_total);
END;
$$;

-- comp_order_item_atomic: bump order version and recalculate total
CREATE OR REPLACE FUNCTION public.comp_order_item_atomic(
  p_order_item_id UUID,
  p_reason TEXT DEFAULT 'comp',
  p_performed_by UUID DEFAULT NULL,
  p_performed_by_terminal_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_item RECORD;
  v_order RECORD;
  v_new_total NUMERIC := 0;
BEGIN
  SELECT * INTO v_item FROM public.order_items WHERE id = p_order_item_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order item not found');
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = v_item.order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;

  IF v_item.kitchen_status = 'comped' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Item already comped');
  END IF;

  UPDATE public.order_items SET
    kitchen_status = 'comped',
    updated_at = NOW()
  WHERE id = p_order_item_id;

  SELECT COALESCE(SUM(total_price), 0) INTO v_new_total FROM public.order_items WHERE order_id = v_order.id AND kitchen_status != 'cancelled';

  UPDATE public.orders SET
    total_amount = v_new_total,
    version = COALESCE(version, 0) + 1,
    updated_by_terminal_id = p_performed_by_terminal_id,
    updated_at = NOW()
  WHERE id = v_order.id;

  INSERT INTO public.operation_logs (
    table_number, order_id, action, old_values, new_values, performed_by
  ) VALUES (
    v_order.table_number, v_order.id, 'comp_order_item',
    jsonb_build_object('item_id', p_order_item_id, 'kitchen_status', v_item.kitchen_status, 'order_total', v_order.total_amount),
    jsonb_build_object('item_id', p_order_item_id, 'kitchen_status', 'comped', 'reason', p_reason, 'order_total', v_new_total),
    p_performed_by
  );

  RETURN jsonb_build_object('success', true, 'new_order_total', v_new_total);
END;
$$;

-- waste_order_item_atomic: bump order version and recalculate total
CREATE OR REPLACE FUNCTION public.waste_order_item_atomic(
  p_order_item_id UUID,
  p_reason TEXT DEFAULT 'waste',
  p_performed_by UUID DEFAULT NULL,
  p_performed_by_terminal_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_item RECORD;
  v_order RECORD;
  v_tx RECORD;
  v_new_total NUMERIC := 0;
BEGIN
  SELECT * INTO v_item FROM public.order_items WHERE id = p_order_item_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order item not found');
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = v_item.order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;

  IF v_item.kitchen_status = 'wasted' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Item already wasted');
  END IF;

  UPDATE public.order_items SET
    kitchen_status = 'wasted',
    updated_at = NOW()
  WHERE id = p_order_item_id;

  FOR v_tx IN 
    SELECT * FROM public.inventory_transactions 
    WHERE order_item_id = p_order_item_id AND transaction_type = 'order_consumption'
    FOR UPDATE
  LOOP
    INSERT INTO public.inventory_transactions (
      order_item_id, ingredient_id, quantity, unit, transaction_type,
      reference_type, reference_id, performed_by, created_at
    ) VALUES (
      v_tx.order_item_id, v_tx.ingredient_id, -v_tx.quantity, v_tx.unit, 'reversal',
      v_tx.reference_type, v_tx.reference_id, p_performed_by, NOW()
    );
  END LOOP;

  SELECT COALESCE(SUM(total_price), 0) INTO v_new_total FROM public.order_items WHERE order_id = v_order.id AND kitchen_status != 'cancelled';

  UPDATE public.orders SET
    total_amount = v_new_total,
    version = COALESCE(version, 0) + 1,
    updated_by_terminal_id = p_performed_by_terminal_id,
    updated_at = NOW()
  WHERE id = v_order.id;

  INSERT INTO public.operation_logs (
    table_number, order_id, action, old_values, new_values, performed_by
  ) VALUES (
    v_order.table_number, v_order.id, 'waste_order_item',
    jsonb_build_object('item_id', p_order_item_id, 'kitchen_status', v_item.kitchen_status, 'order_total', v_order.total_amount),
    jsonb_build_object('item_id', p_order_item_id, 'kitchen_status', 'wasted', 'reason', p_reason, 'order_total', v_new_total),
    p_performed_by
  );

  RETURN jsonb_build_object('success', true, 'new_order_total', v_new_total);
END;
$$;

-- reopen_order_atomic: add version bump
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
    version = COALESCE(v_order.version, 0) + 1,
    updated_by_terminal_id = p_performed_by_terminal_id,
    updated_at = NOW()
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

-- recall_ticket_atomic: kitchen recalls ticket back to pending
CREATE OR REPLACE FUNCTION public.recall_ticket_atomic(
  p_order_id UUID,
  p_reason TEXT DEFAULT 'recall',
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

  IF v_order.kitchen_status NOT IN ('accepted', 'preparing', 'ready', 'served') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order cannot be recalled from current status');
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
  WHERE order_id = p_order_id AND kitchen_status IN ('accepted', 'preparing', 'ready', 'served');

  IF v_order.table_number IS NOT NULL THEN
    UPDATE public.table_floors SET
      kitchen_status = 'pending',
      updated_at = NOW()
    WHERE table_number = v_order.table_number;
  END IF;

  INSERT INTO public.operation_logs (
    table_number, order_id, action, old_values, new_values, performed_by
  ) VALUES (
    v_order.table_number, p_order_id, 'recall_ticket',
    jsonb_build_object('kitchen_status', v_order.kitchen_status),
    jsonb_build_object('kitchen_status', 'pending', 'reason', p_reason),
    p_performed_by
  );

  RETURN jsonb_build_object('success', true);
END;
$$;

-- cancel_ticket_atomic: kitchen cancels the ticket entirely
CREATE OR REPLACE FUNCTION public.cancel_ticket_atomic(
  p_order_id UUID,
  p_reason TEXT DEFAULT 'kitchen_cancel',
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

  IF v_order.kitchen_status IN ('cancelled', 'served', 'ready') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order cannot be cancelled from current status');
  END IF;

  UPDATE public.orders SET
    kitchen_status = 'cancelled',
    updated_at = NOW(),
    version = COALESCE(v_order.version, 0) + 1,
    updated_by_terminal_id = p_performed_by_terminal_id
  WHERE id = p_order_id;

  UPDATE public.order_items SET
    kitchen_status = 'cancelled',
    updated_at = NOW()
  WHERE order_id = p_order_id AND kitchen_status NOT IN ('cancelled', 'served');

  IF v_order.table_number IS NOT NULL THEN
    UPDATE public.table_floors SET
      kitchen_status = 'cancelled',
      updated_at = NOW()
    WHERE table_number = v_order.table_number;
  END IF;

  INSERT INTO public.operation_logs (
    table_number, order_id, action, old_values, new_values, performed_by
  ) VALUES (
    v_order.table_number, p_order_id, 'cancel_ticket',
    jsonb_build_object('kitchen_status', v_order.kitchen_status),
    jsonb_build_object('kitchen_status', 'cancelled', 'reason', p_reason),
    p_performed_by
  );

  RETURN jsonb_build_object('success', true);
END;
$$;
