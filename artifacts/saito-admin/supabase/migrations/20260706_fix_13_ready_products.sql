-- ============================================================================
-- Fix 13: process_order_payment — handle ready products (direct_ingredient_id)
-- ============================================================================
-- The original RPC only deducted stock for recipe-based products via the
-- recipes table. Products with is_ready_product = true and direct_ingredient_id
-- were missed, causing stock to never be deducted for ready-made items.
--
-- This fix adds a UNION ALL to include ready products in the inventory
-- deduction step. Also adds a dashboard view for closed orders stats.

-- ─── 1. Drop old 10-param overload (had p_cash_amount, p_card_amount, p_tip_amount) ───
DROP FUNCTION IF EXISTS process_order_payment(UUID, TEXT, NUMERIC, NUMERIC, NUMERIC, NUMERIC, UUID, NUMERIC, TEXT, UUID);

-- ─── 2. Recreate process_order_payment to handle ready products ───
CREATE OR REPLACE FUNCTION process_order_payment(
  p_order_id UUID,
  p_payment_method TEXT,
  p_paid_amount NUMERIC,
  p_campaign_id UUID DEFAULT NULL,
  p_discount_amount NUMERIC DEFAULT 0,
  p_discount_type TEXT DEFAULT NULL,
  p_performed_by UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_order RECORD;
  v_reservation_id UUID;
  v_table_number INTEGER;
  v_total_deductions NUMERIC := 0;
  v_notification_id UUID;
BEGIN
  -- Step 1: Lock and validate order
  SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;
  IF v_order.status = 'paid' THEN
    RAISE EXCEPTION 'ORDER_ALREADY_PAID' USING ERRCODE = 'P0001';
  END IF;

  v_reservation_id := v_order.reservation_id;
  v_table_number := v_order.table_number;

  -- Step 2: Mark order as paid
  UPDATE orders SET
    status = 'paid',
    payment_method = p_payment_method,
    paid_amount = p_paid_amount,
    paid_at = now(),
    version = COALESCE(version, 0) + 1
  WHERE id = p_order_id;

  -- Step 2.5: Mark child orders (merged into this one) as paid
  UPDATE orders SET
    status = 'paid',
    paid_at = now(),
    version = COALESCE(version, 0) + 1
  WHERE merged_into = p_order_id
    AND status != 'paid';

  -- Step 3: Inventory deduction (idempotent — skip if already deducted)
  IF NOT EXISTS (SELECT 1 FROM inventory_logs WHERE reference_type = 'order' AND reference_id = p_order_id LIMIT 1) THEN
    INSERT INTO inventory_logs (
      ingredient_id, type, quantity, unit_cost,
      reference_type, reference_id, order_id, notes, created_at
    )
    -- Recipe-based products
    SELECT
      r.ingredient_id,
      'order_consumption',
      (r.quantity_required * oi.quantity),
      COALESCE(i.average_cost_per_unit, 0),
      'order',
      p_order_id,
      p_order_id,
      'Auto: Order ' || COALESCE(v_table_number::TEXT, '?'),
      now()
    FROM order_items oi
    JOIN products p ON p.id = oi.product_id
    JOIN recipes r ON r.menu_item_id = p.id
    JOIN ingredients i ON i.id = r.ingredient_id
    WHERE oi.order_id = p_order_id
      AND (oi.kitchen_status IS DISTINCT FROM 'cancelled')
      AND (p.is_ready_product IS NOT TRUE)
    UNION ALL
    -- Ready products (direct ingredient, no recipe)
    SELECT
      p.direct_ingredient_id,
      'order_consumption',
      oi.quantity,
      COALESCE(i.average_cost_per_unit, 0),
      'order',
      p_order_id,
      p_order_id,
      'Auto: Order ' || COALESCE(v_table_number::TEXT, '?'),
      now()
    FROM order_items oi
    JOIN products p ON p.id = oi.product_id
    LEFT JOIN ingredients i ON i.id = p.direct_ingredient_id
    WHERE oi.order_id = p_order_id
      AND (oi.kitchen_status IS DISTINCT FROM 'cancelled')
      AND p.is_ready_product = TRUE
      AND p.direct_ingredient_id IS NOT NULL;
  END IF;

  -- Step 4: Calculate total cost of goods sold (COGS)
  SELECT COALESCE(SUM(il.quantity * COALESCE(il.unit_cost, 0)), 0)
  INTO v_total_deductions
  FROM inventory_logs il
  WHERE il.reference_type = 'order' AND il.reference_id = p_order_id;

  -- Step 5: Campaign usage tracking
  IF p_campaign_id IS NOT NULL THEN
    INSERT INTO campaign_usage (campaign_id, order_id, discount_amount, discount_type, created_at)
    VALUES (p_campaign_id, p_order_id, p_discount_amount, p_discount_type, now());

    UPDATE campaigns
    SET current_uses = COALESCE(current_uses, 0) + 1
    WHERE id = p_campaign_id;
  END IF;

  -- Step 6: Reservation completion
  IF v_reservation_id IS NOT NULL THEN
    UPDATE reservations
    SET status = 'completed', completed_at = now()
    WHERE id = v_reservation_id
      AND status NOT IN ('completed', 'cancelled', 'no_show');
  END IF;

  -- Step 7: Kitchen items completion
  UPDATE order_items
  SET kitchen_status = 'completed'
  WHERE order_id = p_order_id
    AND kitchen_status IN ('pending', 'preparing', 'ready', 'accepted');

  UPDATE orders
  SET kitchen_status = 'completed'
  WHERE id = p_order_id;

  -- Step 8: Cancel pending kitchen schedule for this order
  UPDATE kitchen_schedule
  SET status = 'cancelled'
  WHERE reservation_id = v_reservation_id AND status = 'pending';

  -- Step 9: Release the table
  UPDATE table_floors
  SET
    status = 'empty',
    reservation_id = NULL,
    reservation_name = NULL,
    reservation_phone = NULL,
    reservation_time = NULL,
    guest_count = NULL
  WHERE table_number = v_table_number;

  -- Step 10: Free any merged child tables
  UPDATE table_floors
  SET
    status = 'empty',
    merged_into_table = NULL,
    guest_count = NULL
  WHERE merged_into_table = v_table_number::TEXT
     OR merged_into_table = v_table_number::INTEGER;

  -- Step 11: Audit log
  INSERT INTO audit_log (table_name, record_id, action, old_data, new_data, performed_by, created_at)
  VALUES (
    'orders',
    p_order_id,
    'payment',
    jsonb_build_object('status', v_order.status, 'total', v_order.total_amount),
    jsonb_build_object(
      'status', 'paid',
      'method', p_payment_method,
      'amount', p_paid_amount,
      'discount_amount', p_discount_amount,
      'discount_type', p_discount_type,
      'cogs', v_total_deductions,
      'profit', COALESCE(p_paid_amount, 0) - v_total_deductions
    ),
    p_performed_by,
    now()
  );

  -- Step 12: Create persistent notification
  INSERT INTO notifications (type, title, body, data, created_at)
  VALUES (
    'payment',
    'Ödəniş qəbul edildi',
    CASE
      WHEN v_table_number IS NOT NULL THEN 'Masa ' || v_table_number || ' — ' || p_paid_amount || ' AZN'
      ELSE p_paid_amount || ' AZN ödəniş qəbul edildi'
    END,
    jsonb_build_object(
      'order_id', p_order_id,
      'table_number', v_table_number,
      'paid_amount', p_paid_amount,
      'payment_method', p_payment_method,
      'cogs', v_total_deductions
    ),
    now()
  )
  RETURNING id INTO v_notification_id;

  -- Step 13: Update the order with financial metadata
  UPDATE orders SET
    cogs = v_total_deductions,
    profit = GREATEST(0, COALESCE(p_paid_amount, 0) - v_total_deductions)
  WHERE id = p_order_id;

  -- Return result
  RETURN jsonb_build_object(
    'success', true,
    'order_id', p_order_id,
    'table_number', v_table_number,
    'paid_amount', p_paid_amount,
    'cogs', v_total_deductions,
    'profit', GREATEST(0, COALESCE(p_paid_amount, 0) - v_total_deductions),
    'notification_id', v_notification_id
  );
END;
$$;

-- ─── 2. Dashboard view for closed orders statistics ───
DROP VIEW IF EXISTS v_closed_orders;
CREATE VIEW v_closed_orders AS
SELECT
  o.id AS order_id,
  o.table_number,
  o.total_amount,
  o.paid_amount,
  o.payment_method,
  o.discount_type,
  o.discount_value,
  o.cogs,
  o.profit,
  o.tip_amount,
  o.guest_count,
  o.created_at AS order_created_at,
  o.paid_at,
  o.updated_at,
  o.reservation_id,
  jsonb_array_length(o.items) AS item_count
FROM orders o
WHERE o.status = 'paid';
