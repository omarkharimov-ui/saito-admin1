-- ============================================================================
-- Production hardening: CHECK constraints, indexes, and FK constraints
-- ============================================================================

-- 1. Add CHECK constraint for orders.kitchen_status
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_kitchen_status_check;
ALTER TABLE orders
  ADD CONSTRAINT orders_kitchen_status_check
  CHECK (kitchen_status IS NULL OR kitchen_status IN ('pending', 'preparing', 'ready', 'completed', 'cancelled', 'reserved', 'accepted'));

-- 2. Add 'waiting' to orders.status CHECK constraint
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders
  ADD CONSTRAINT orders_status_check
  CHECK (status IN ('pending', 'confirmed', 'waiting', 'checked_in', 'completed', 'cancelled', 'no_show', 'expired', 'archived', 'paid', 'closed'));

-- 3. Backfill any invalid kitchen_status values
UPDATE orders SET kitchen_status = NULL WHERE kitchen_status IS NOT NULL AND kitchen_status NOT IN ('pending', 'preparing', 'ready', 'completed', 'cancelled', 'reserved', 'accepted');

-- 4. Backfill any invalid order status values
UPDATE orders SET status = 'pending' WHERE status IS NULL OR status NOT IN ('pending', 'confirmed', 'waiting', 'checked_in', 'completed', 'cancelled', 'no_show', 'expired', 'archived', 'paid', 'closed');

-- 5. Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_orders_table_number ON orders(table_number);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_kitchen_status ON orders(kitchen_status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);

-- 6. Add FK constraint for orders.merged_into (if column exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'merged_into') THEN
    ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_merged_into_fkey;
    ALTER TABLE orders
      ADD CONSTRAINT orders_merged_into_fkey
      FOREIGN KEY (merged_into) REFERENCES orders(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 7. Backfill table_floors status to ensure consistency
UPDATE table_floors SET status = 'empty' WHERE status IS NULL OR status NOT IN ('empty', 'reserved', 'occupied', 'waiting');
