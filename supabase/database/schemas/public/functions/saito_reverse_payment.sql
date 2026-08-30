CREATE OR REPLACE FUNCTION public.saito_reverse_payment (
  p_order_id     uuid,
  p_performed_by uuid DEFAULT NULL::uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  AS $function$
  DECLARE
  v_order RECORD;
  v_total_deductions NUMERIC;
  v_inventory_count INTEGER;
BEGIN
  PERFORM public.validate_actor(p_performed_by);
  SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  IF v_order.status != 'paid' THEN
    RAISE EXCEPTION 'ORDER_NOT_PAID' USING ERRCODE = 'P0001';
  END IF;

  -- Get inventory deductions for reversal
  SELECT COUNT(*) INTO v_inventory_count FROM inventory_logs
  WHERE reference_type = 'order' AND reference_id = p_order_id;

  -- Reverse stock: insert opposite entries
  INSERT INTO inventory_logs (ingredient_id, type, quantity, unit_cost, reference_type, reference_id, order_id, notes, created_at)
  SELECT
    il.ingredient_id, 'order_consumption'::inventory_log_type,
    -il.quantity, COALESCE(il.unit_cost, 0),
    'reversal', p_order_id, p_order_id,
    'Reversal: Payment ' || p_order_id, now()
  FROM inventory_logs il
  WHERE il.reference_type = 'order' AND il.reference_id = p_order_id AND il.quantity > 0;

  -- Reset order to confirmed state
  UPDATE orders SET
    status = 'confirmed',
    paid_at = NULL,
    paid_amount = 0,
    tip_amount = 0,
    payment_method = NULL,
    cogs = 0,
    profit = 0,
    kitchen_status = 'pending',
    version = COALESCE(version, 0) + 1
  WHERE id = p_order_id;

  -- Restore table
  UPDATE table_floors SET status = 'occupied', guest_count = COALESCE(v_order.guest_count, 1)
  WHERE table_number = v_order.table_number;

  -- Mark order_payments as reversed (soft delete via updating payment_method)
  UPDATE order_payments SET payment_method = 'reversed'
  WHERE order_id = p_order_id AND payment_method != 'reversed';

  -- Un-complete kitchen items
  UPDATE order_items SET kitchen_status = 'pending'
  WHERE order_id = p_order_id AND kitchen_status = 'completed';

  -- Audit log
  INSERT INTO audit_log (table_name, record_id, action, old_data, new_data, performed_by, created_at)
  VALUES (
    'orders', p_order_id, 'payment_reversal',
    jsonb_build_object('status', 'paid', 'paid_amount', v_order.paid_amount, 'cogs', v_order.cogs),
    jsonb_build_object('status', 'confirmed', 'reversed_inventory', v_inventory_count),
    p_performed_by, now()
  );

  -- Notification
  INSERT INTO notifications (type, title, body, data, created_at)
  VALUES (
    'payment_reversal', 'Ödəniş ləğv edildi',
    'Masa ' || v_order.table_number || ' — ' || v_order.paid_amount || ' AZN ödəniş ləğv edildi',
    jsonb_build_object('order_id', p_order_id, 'table_number', v_order.table_number, 'reversed_amount', v_order.paid_amount),
    now()
  );

  RETURN jsonb_build_object(
    'success', true, 'order_id', p_order_id,
    'reversed_amount', v_order.paid_amount,
    'reversed_inventory', v_inventory_count
  );
END;
$function$;



