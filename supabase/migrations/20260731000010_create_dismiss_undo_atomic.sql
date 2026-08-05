-- Create dismiss_undo_atomic: atomic reverse of table dismiss
-- This fixes the SSOT gap where dismiss + undo left inconsistent state

CREATE OR REPLACE FUNCTION public.dismiss_undo_atomic (
  p_table_number integer,
  p_performed_by uuid DEFAULT NULL::uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
DECLARE
  v_caller_role text;
  v_cancelled_orders RECORD;
  v_order_ids UUID[];
  v_item RECORD;
  v_restored_count INTEGER := 0;
BEGIN
  -- Authorize caller
  SELECT public.effective_admin_role() INTO v_caller_role;
  IF v_caller_role NOT IN ('superadmin', 'admin', 'cashier', 'kitchen') THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = 'P0001';
  END IF;

  -- Find the most recent cancelled orders on this table (from the dismiss action)
  FOR v_cancelled_orders IN
    SELECT id, table_number, status, total_amount, guest_count, reservation_id,
           customer_name, customer_phone, kitchen_status, created_at, version
    FROM orders
    WHERE table_number = p_table_number
      AND status = 'cancelled'
      AND updated_at >= now() - interval '1 hour'
    ORDER BY updated_at DESC
    FOR UPDATE
  LOOP
    v_order_ids := array_append(v_order_ids, v_cancelled_orders.id);
  END LOOP;

  IF array_length(v_order_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No recent cancelled orders found to undo');
  END IF;

  -- Restore orders to their previous status (new/confirmed)
  UPDATE orders
  SET status = CASE WHEN kitchen_status = 'cancelled' THEN 'new' ELSE 'confirmed' END,
      kitchen_status = CASE WHEN kitchen_status = 'cancelled' THEN 'pending' ELSE kitchen_status END,
      cancelled_at = NULL,
      updated_at = now(),
      version = COALESCE(version, 0) + 1
  WHERE id = ANY(v_order_ids);

  -- Restore order items
  UPDATE order_items
  SET kitchen_status = 'pending'
  WHERE order_id = ANY(v_order_ids)
    AND kitchen_status = 'cancelled';

  -- Restore table state
  UPDATE table_floors
  SET
    status = 'occupied',
    guest_count = COALESCE((SELECT guest_count FROM orders WHERE id = v_order_ids[1]), 1),
    reservation_id = (SELECT reservation_id FROM orders WHERE id = v_order_ids[1]),
    reservation_name = (SELECT customer_name FROM orders WHERE id = v_order_ids[1]),
    reservation_phone = (SELECT customer_phone FROM orders WHERE id = v_order_ids[1]),
    current_order_id = v_order_ids[1],
    updated_at = now()
  WHERE table_number = p_table_number;

  -- Restore stock deductions
  FOR v_item IN
    SELECT oi.id, oi.product_id, oi.quantity, r.ingredient_id, r.quantity AS recipe_qty
    FROM order_items oi
    JOIN recipe_items r ON r.product_id = oi.product_id
    WHERE oi.order_id = ANY(v_order_ids)
  LOOP
    INSERT INTO inventory_logs (ingredient_id, quantity, type, unit_cost, reference_type, reference_id, created_at)
    VALUES (
      v_item.ingredient_id,
      v_item.recipe_qty * v_item.quantity,
      'stock_out'::inventory_log_type,
      0,
      'order',
      v_item.id,
      now()
    );
    v_restored_count := v_restored_count + 1;
  END LOOP;

  -- Audit
  INSERT INTO audit_log (table_name, record_id, action, old_data, new_data, performed_by, created_at)
  VALUES (
    'orders',
    v_order_ids[1],
    'dismiss_undo',
    jsonb_build_object('table_number', p_table_number, 'order_ids', v_order_ids, 'status', 'cancelled'),
    jsonb_build_object('status', 'restored', 'restored_items', v_restored_count),
    p_performed_by,
    now()
  );

  RETURN jsonb_build_object(
    'success', true,
    'restored_orders', array_length(v_order_ids, 1),
    'restored_items', v_restored_count
  );
END;
$function$;

GRANT ALL ON FUNCTION public.dismiss_undo_atomic(integer, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.dismiss_undo_atomic(integer, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.dismiss_undo_atomic(integer, uuid) FROM authenticated;
