-- =====================================================
-- P5: INVENTORY TRIGGER — Auto-decrement stock on sale
-- =====================================================
-- When an order_consumption log is inserted into
-- inventory_logs, automatically decrement the
-- ingredient's current_stock.

-- 1. Ensure inventory_logs has order_id column
ALTER TABLE inventory_logs ADD COLUMN IF NOT EXISTS order_id uuid;

-- 2. Create the trigger function
CREATE OR REPLACE FUNCTION deduct_stock_on_consumption()
RETURNS trigger AS $$
BEGIN
  IF NEW.type = 'order_consumption' THEN
    UPDATE ingredients
    SET current_stock = GREATEST(0, (COALESCE(current_stock, 0) - NEW.quantity))
    WHERE id = NEW.ingredient_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Create the trigger (drop first to handle re-runs)
DROP TRIGGER IF EXISTS trg_inventory_logs_after_insert ON inventory_logs;
CREATE TRIGGER trg_inventory_logs_after_insert
  AFTER INSERT ON inventory_logs
  FOR EACH ROW
  EXECUTE FUNCTION deduct_stock_on_consumption();

-- =====================================================
-- INDEX for inventory_logs lookups
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_inventory_logs_type ON inventory_logs (type);
CREATE INDEX IF NOT EXISTS idx_inventory_logs_order_id ON inventory_logs (order_id);
