-- ============================================================
-- Reservations ⇄ POS production hardening
-- 1. reservations.customer_id (auto-link guest by phone)
-- 2. idx_orders_active_table must exclude split bills (is_split)
-- ============================================================

-- 1. Link a customer to each reservation (nullable, safe for existing rows)
ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS customer_id uuid
  REFERENCES customers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_reservations_customer_id
  ON reservations(customer_id);

-- 2. Rebuild the active-order uniqueness index so that splitting a bill
--    (is_split = true) does NOT collide with the original table's order.
DROP INDEX IF EXISTS idx_orders_active_table;
CREATE UNIQUE INDEX idx_orders_active_table
  ON public.orders USING btree (table_number)
  WHERE ((status <> ALL (ARRAY['paid'::text, 'cancelled'::text, 'closed'::text]))
         AND (merged_into IS NULL)
         AND (is_split IS DISTINCT FROM true));
