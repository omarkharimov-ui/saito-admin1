-- ============================================================================
-- Fix 17: Enterprise-grade upgrades
-- ============================================================================
-- 1. parent_order_item_id — direct combo hierarchy FK
-- 2. served_at — timestamp when items were delivered to table
-- 3. order_payments — payment ledger for multi-method payments
-- 4. Kitchen status trigger — auto-sync orders.kitchen_status from items
-- 5. Audit enrichment — device_id, ip_address
-- 6. Order status constraint — full lifecycle (draft→closed)
-- 7. process_order_payment — inserts into order_payments ledger
-- ============================================================================

-- ─── 1. Fix order_items.kitchen_status default ───
ALTER TABLE order_items ALTER COLUMN kitchen_status SET DEFAULT 'pending';

-- ─── 2. parent_order_item_id — direct parent reference for combo ───
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS parent_order_item_id UUID REFERENCES order_items(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_order_items_parent ON order_items(parent_order_item_id);

-- ─── 3. served_at — timestamp when item was delivered ───
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS served_at TIMESTAMPTZ;

-- ─── 4. order_payments — payment ledger table ───
CREATE TABLE IF NOT EXISTS order_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  amount NUMERIC(12,2) NOT NULL,
  payment_method TEXT NOT NULL,
  reference TEXT,
  performed_by UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_payments_order ON order_payments(order_id);

-- Enable RLS on order_payments
ALTER TABLE order_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "order_payments_select" ON order_payments FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "order_payments_insert" ON order_payments FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- ─── 5. Audit enrichment ───
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS device_id TEXT;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS ip_address TEXT;

-- ─── 6. Kitchen status trigger — auto-sync orders.kitchen_status from items ───
CREATE OR REPLACE FUNCTION sync_order_kitchen_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_id UUID;
  v_new_status TEXT;
BEGIN
  -- Determine affected order
  IF TG_OP = 'DELETE' THEN
    v_order_id := OLD.order_id;
  ELSE
    v_order_id := NEW.order_id;
  END IF;

  -- Compute aggregate kitchen status from all non-cancelled items
  SELECT
    CASE
      WHEN COUNT(*) FILTER (WHERE kitchen_status IS DISTINCT FROM 'cancelled') = 0 THEN 'cancelled'
      WHEN COUNT(*) FILTER (WHERE kitchen_status IN ('pending', 'accepted')) > 0
           AND COUNT(*) FILTER (WHERE kitchen_status = 'ready') > 0 THEN 'partially_ready'
      WHEN COUNT(*) FILTER (WHERE kitchen_status = 'preparing') > 0 THEN 'preparing'
      WHEN COUNT(*) FILTER (WHERE kitchen_status = 'ready') > 0 THEN 'ready'
      WHEN COUNT(*) FILTER (WHERE kitchen_status = 'completed') > 0 THEN 'completed'
      WHEN COUNT(*) FILTER (WHERE kitchen_status = 'pending') > 0 THEN 'pending'
      ELSE 'cancelled'
    END INTO v_new_status
  FROM order_items
  WHERE order_id = v_order_id;

  -- Update the order (skip paid/cancelled/closed — immutable)
  UPDATE orders
  SET kitchen_status = v_new_status
  WHERE id = v_order_id
    AND status NOT IN ('paid', 'cancelled', 'closed');

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_order_kitchen_status ON order_items;
CREATE TRIGGER trg_sync_order_kitchen_status
  AFTER INSERT OR UPDATE OR DELETE ON order_items
  FOR EACH ROW
  EXECUTE FUNCTION sync_order_kitchen_status();

-- ─── 7. Update order status check constraint — full lifecycle ───
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check
  CHECK (status = ANY (ARRAY[
    'draft', 'new', 'confirmed',
    'in_kitchen', 'partially_ready', 'ready',
    'completed', 'paid', 'cancelled', 'closed'
  ]));

-- ─── 8. Update process_order_payment — add order_payments insert ───
-- Drop old 10-param overload (cleanup)
DROP FUNCTION IF EXISTS process_order_payment(UUID, TEXT, NUMERIC, NUMERIC, NUMERIC, NUMERIC, UUID, NUMERIC, TEXT, UUID);

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
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order RECORD;
  v_reservation_id UUID;
  v_table_number INTEGER;
  v_total_deductions NUMERIC := 0;
  v_notification_id UUID;
  v_prev_paid NUMERIC;
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
  v_prev_paid := COALESCE(v_order.paid_amount, 0);

  -- Step 2: Mark order as paid (add to existing paid_amount for split payments)
  UPDATE orders SET
    paid_amount = v_prev_paid + p_paid_amount,
    payment_method = CASE WHEN v_prev_paid > 0 THEN 'split' ELSE p_payment_method END,
    status = CASE WHEN v_prev_paid + p_paid_amount >= COALESCE(v_order.total_amount, 0)
                  THEN 'paid' ELSE 'confirmed' END,
    paid_at = CASE WHEN v_prev_paid + p_paid_amount >= COALESCE(v_order.total_amount, 0)
                   THEN now() ELSE NULL END,
    version = COALESCE(version, 0) + 1
  WHERE id = p_order_id;

  -- Step 2.5: Insert payment record into ledger
  INSERT INTO order_payments (order_id, amount, payment_method, performed_by, created_at)
  VALUES (p_order_id, p_paid_amount, p_payment_method, p_performed_by, now());

  -- If fully paid, mark child orders and do finalization
  IF v_prev_paid + p_paid_amount >= COALESCE(v_order.total_amount, 0) THEN
    -- Mark child orders (merged into this one) as paid
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
        reference_type, reference_id, order_id, order_item_id, item_quantity,
        notes, created_at
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
        oi.id,
        oi.quantity,
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
        oi.id,
        oi.quantity,
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
    WHERE merged_into_table = v_table_number;

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
        'total_paid', v_prev_paid + p_paid_amount,
        'discount_amount', p_discount_amount,
        'discount_type', p_discount_type,
        'cogs', v_total_deductions,
        'profit', (v_prev_paid + p_paid_amount) - v_total_deductions
      ),
      p_performed_by,
      now()
    );

    -- Step 12: Notification
    INSERT INTO notifications (type, title, body, data, created_at)
    VALUES (
      'payment',
      'Ödəniş qəbul edildi',
      CASE
        WHEN v_table_number IS NOT NULL THEN 'Masa ' || v_table_number || ' — ' || (v_prev_paid + p_paid_amount) || ' AZN'
        ELSE (v_prev_paid + p_paid_amount) || ' AZN ödəniş qəbul edildi'
      END,
      jsonb_build_object(
        'order_id', p_order_id,
        'table_number', v_table_number,
        'paid_amount', v_prev_paid + p_paid_amount,
        'payment_method', p_payment_method,
        'cogs', v_total_deductions
      ),
      now()
    )
    RETURNING id INTO v_notification_id;

    -- Step 13: Update order with financial metadata
    UPDATE orders SET
      cogs = v_total_deductions,
      profit = GREATEST(0, (v_prev_paid + p_paid_amount) - v_total_deductions),
      kitchen_status = 'completed'
    WHERE id = p_order_id;
  END IF;

  -- Return result
  RETURN jsonb_build_object(
    'success', true,
    'order_id', p_order_id,
    'table_number', v_table_number,
    'paid_amount', p_paid_amount,
    'total_paid', v_prev_paid + p_paid_amount,
    'fully_paid', v_prev_paid + p_paid_amount >= COALESCE(v_order.total_amount, 0),
    'cogs', v_total_deductions,
    'profit', GREATEST(0, (v_prev_paid + p_paid_amount) - v_total_deductions),
    'notification_id', v_notification_id
  );
END;
$$;
