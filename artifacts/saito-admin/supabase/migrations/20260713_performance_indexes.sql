-- ============================================================================
-- Performance & image fixes
-- ============================================================================

-- 1. Composite index for kitchen/orders queries
CREATE INDEX IF NOT EXISTS idx_orders_table_number_status_kitchen
  ON orders(table_number, status, kitchen_status)
  WHERE table_number > 0;

-- 2. Composite index for POS tables API (filters by status, needs kitchen_status)
CREATE INDEX IF NOT EXISTS idx_orders_status_kitchen
  ON orders(status, kitchen_status)
  WHERE status NOT IN ('paid', 'cancelled', 'closed');

-- 3. Cover order_items join for kitchen queries
CREATE INDEX IF NOT EXISTS idx_order_items_order_kitchen
  ON order_items(order_id, kitchen_status)
  WHERE kitchen_status IS DISTINCT FROM 'cancelled';
