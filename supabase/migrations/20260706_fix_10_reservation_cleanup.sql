-- ============================================================
-- FIX 10/10: Reservation cancellation bug + schema cleanup
-- ============================================================

-- 1. Fix table_floors CHECK to include 'expired'
ALTER TABLE table_floors DROP CONSTRAINT IF EXISTS table_floors_status_check;
ALTER TABLE table_floors ADD CONSTRAINT table_floors_status_check
  CHECK (status IN ('empty', 'reserved', 'occupied', 'merged', 'payment_pending', 'cleaning', 'expired'));

-- 2. Cleanup orphan draft orders when reservation is cancelled/no_show/expired
CREATE OR REPLACE FUNCTION cleanup_reservation_draft_orders()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status IN ('cancelled', 'no_show', 'expired') THEN
    UPDATE orders
    SET status = 'cancelled', cancelled_at = now()
    WHERE reservation_id = NEW.id
      AND status NOT IN ('paid', 'cancelled')
      AND is_draft = true;

    UPDATE table_floors
    SET status = 'empty',
        reservation_id = NULL,
        reservation_name = NULL,
        reservation_phone = NULL,
        reservation_time = NULL,
        guest_count = NULL
    WHERE reservation_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_cleanup_reservation_draft_orders ON reservations;
CREATE TRIGGER trg_cleanup_reservation_draft_orders
  AFTER UPDATE OF status ON reservations
  FOR EACH ROW EXECUTE FUNCTION cleanup_reservation_draft_orders();

-- 3. Unify audit_log / audit_logs: keep audit_logs as canonical
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'audit_log') THEN
    -- Migrate data if audit_logs exists
    IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'audit_logs') THEN
      INSERT INTO audit_logs (id, table_name, record_id, action, old_data, new_data, performed_by, ip_address, created_at)
      SELECT id, table_name, record_id, action, old_data, new_data, performed_by, ip_address, created_at
      FROM audit_log
      ON CONFLICT (id) DO NOTHING;
    END IF;
    DROP TABLE IF EXISTS audit_log CASCADE;
  END IF;
END $$;

-- 4. Enable RLS on core tables (safe because all app traffic uses service_role via Next.js)
ALTER TABLE table_floors ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingredients ENABLE ROW LEVEL SECURITY;

-- Service role policies (allow all because API uses service_role key)
DROP POLICY IF EXISTS "service_role_full_table_floors" ON table_floors;
CREATE POLICY "service_role_full_table_floors" ON table_floors FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_role_full_orders" ON orders;
CREATE POLICY "service_role_full_orders" ON orders FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_role_full_order_items" ON order_items;
CREATE POLICY "service_role_full_order_items" ON order_items FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_role_full_reservations" ON reservations;
CREATE POLICY "service_role_full_reservations" ON reservations FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_role_full_inventory_logs" ON inventory_logs;
CREATE POLICY "service_role_full_inventory_logs" ON inventory_logs FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_role_full_ingredients" ON ingredients;
CREATE POLICY "service_role_full_ingredients" ON ingredients FOR ALL USING (true) WITH CHECK (true);
