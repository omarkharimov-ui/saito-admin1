-- Remove the redundant/conflicting partial unique index on orders(table_number).
-- `idx_orders_unique_active_per_table` (from 20260708_production_safety.sql) and
-- `idx_orders_active_table` (from fix_18 / fix_20) both enforce "one active order
-- per table" but overlap for non-split orders, and the former does NOT exclude
-- split orders — so creating a split/merged active order on a table with an
-- existing active order raised a unique violation (500), breaking reservation
-- sync, pre-orders and bill splits. `idx_orders_active_table` already covers the
-- intent (one active non-split order per table), so the duplicate is dropped.
DROP INDEX IF EXISTS idx_orders_unique_active_per_table;
