-- ============================================================================
-- P9: EVENT PIPELINE + ATOMIC PAY RPC + PERSISTENT NOTIFICATIONS
-- Cross-module orchestration, server-side business logic
-- ============================================================================

-- ─── 1. PERSISTENT NOTIFICATIONS TABLE ───
-- Replaces the frontend-only NotificationContext with DB-backed notifications
-- that sync across all devices via realtime.
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL CHECK (type IN ('payment', 'reservation', 'order', 'kitchen', 'stock', 'campaign', 'system')),
  title TEXT NOT NULL,
  body TEXT,
  data JSONB,
  recipient_role TEXT,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  read_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(type);

-- Enable row-level security (RLS) so realtime can push new rows
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS notifications_insert ON notifications;
CREATE POLICY notifications_insert ON notifications
  FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS notifications_select ON notifications;
CREATE POLICY notifications_select ON notifications
  FOR SELECT USING (true);
DROP POLICY IF EXISTS notifications_update ON notifications;
CREATE POLICY notifications_update ON notifications
  FOR UPDATE USING (true);

-- Track the last notification read per user for badge counts
CREATE TABLE IF NOT EXISTS notification_read_state (
  user_id UUID NOT NULL,
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id)
);

-- ─── 2. ATOMIC PAY RPC ───
-- Single database transaction that executes all pay side effects.
-- Called by the API endpoint instead of manual Supabase fetches.
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

  -- Step 3: Recipe-based inventory deduction (idempotent — skip if already deducted)
  IF NOT EXISTS (SELECT 1 FROM inventory_logs WHERE reference_type = 'order' AND reference_id = p_order_id LIMIT 1) THEN
    INSERT INTO inventory_logs (
      ingredient_id, type, quantity, unit_cost,
      reference_type, reference_id, order_id, notes, created_at
    )
    SELECT
      r.ingredient_id,
      'order_consumption',
      (r.quantity_required * oi.quantity),
      i.average_cost_per_unit,
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
      AND (oi.kitchen_status IS DISTINCT FROM 'cancelled');
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

-- ─── 3. AUTO NO-SHOW RPC (for cron job) ───
-- Marks expired confirmed reservations as no_show
-- Configurable timeout via p_minutes_past parameter
CREATE OR REPLACE FUNCTION process_expired_reservations(
  p_minutes_past INTEGER DEFAULT 30
) RETURNS TABLE(
  reservation_id UUID,
  guest_name TEXT,
  table_number INTEGER
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  WITH expired AS (
    UPDATE reservations r
    SET status = 'no_show'
    WHERE r.status = 'confirmed'
      AND (r.date < CURRENT_DATE
        OR (r.date = CURRENT_DATE
          AND (r.time::TIME) < (CURRENT_TIME - (p_minutes_past || ' minutes')::INTERVAL)::TIME
        )
      )
    RETURNING r.id, r.name, r.table_number
  ),
  released AS (
    UPDATE table_floors tf
    SET
      status = 'empty',
      reservation_id = NULL,
      reservation_name = NULL,
      reservation_phone = NULL,
      reservation_time = NULL,
      guest_count = NULL
    FROM expired e
    WHERE tf.table_number = e.table_number
  )
  INSERT INTO notifications (type, title, body, data, created_at)
  SELECT
    'reservation',
    'Rezervasiyanın vaxtı keçdi',
    e.guest_name || ' — no_show',
    jsonb_build_object('reservation_id', e.reservation_id, 'table_number', e.table_number),
    now()
  FROM expired e;

  RETURN QUERY SELECT e.reservation_id, e.guest_name, e.table_number FROM expired e;
END;
$$;

-- ─── 4. KITCHEN SCHEDULE AUTO-PUSH ───
-- Called by cron: releases pre-orders to kitchen X minutes before reservation
CREATE OR REPLACE FUNCTION process_due_kitchen_schedules()
RETURNS TABLE(
  schedule_id UUID,
  reservation_id UUID,
  table_number INTEGER
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  WITH due AS (
    UPDATE kitchen_schedule ks
    SET status = 'started'
    WHERE ks.status = 'pending'
      AND ks.scheduled_at <= now()
    RETURNING ks.id, ks.reservation_id, ks.table_number
  ),
  updated_reservations AS (
    UPDATE reservations r
    SET kitchen_scheduled_at = now()
    FROM due d
    WHERE r.id = d.reservation_id
  ),
  -- Update any draft order (with kitchen_status = 'reserved') to 'pending'
  updated_orders AS (
    UPDATE orders o
    SET
      kitchen_status = 'pending',
      kitchen_accepted_at = now()
    FROM due d
    WHERE o.reservation_id = d.reservation_id
      AND o.kitchen_status = 'reserved'
  ),
  updated_items AS (
    UPDATE order_items oi
    SET kitchen_status = 'pending'
    FROM due d
    JOIN orders o ON o.reservation_id = d.reservation_id
    WHERE oi.order_id = o.id
      AND oi.kitchen_status = 'reserved'
  )
  INSERT INTO notifications (type, title, body, data, created_at)
  SELECT
    'kitchen',
    'Mətbəxə hazırlıq göndərildi',
    'Masa ' || d.table_number || ' — hazırlığa başlanıldı',
    jsonb_build_object('schedule_id', d.id, 'reservation_id', d.reservation_id, 'table_number', d.table_number),
    now()
  FROM due d;

  RETURN QUERY SELECT d.id, d.reservation_id, d.table_number FROM due d;
END;
$$;

-- ─── 5. Add financial columns to orders (if not exist) ───
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cogs NUMERIC(12,2) DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS profit NUMERIC(12,2) DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(12,2) DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS reservation_id UUID;

-- ─── 6. Add index on orders.paid_at for stats queries ───
CREATE INDEX IF NOT EXISTS idx_orders_paid_at ON orders(paid_at);
CREATE INDEX IF NOT EXISTS idx_orders_reservation_id ON orders(reservation_id);

-- ─── 7. Update stock trigger to use average cost ───
CREATE OR REPLACE FUNCTION deduct_stock_on_consumption()
RETURNS trigger AS $$
BEGIN
  IF NEW.type = 'order_consumption' THEN
    UPDATE ingredients
    SET
      current_stock = GREATEST(0, (COALESCE(current_stock, 0) - NEW.quantity)),
      updated_at = now()
    WHERE id = NEW.ingredient_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_inventory_logs_after_insert ON inventory_logs;
CREATE TRIGGER trg_inventory_logs_after_insert
  AFTER INSERT ON inventory_logs
  FOR EACH ROW
  EXECUTE FUNCTION deduct_stock_on_consumption();
