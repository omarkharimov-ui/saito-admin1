-- ============================================================
-- RLS Fix: Add missing write policies for browsers with anon key
-- ============================================================

-- 1. customers: staff can insert
DROP POLICY IF EXISTS customers_insert_staff ON customers;
CREATE POLICY customers_insert_staff ON customers
  FOR INSERT TO authenticated
  WITH CHECK (is_admin_staff());

-- 2. product_variants: allow admin/cashier to write (not just superadmin)
DROP POLICY IF EXISTS product_variants_write_staff ON product_variants;
CREATE POLICY product_variants_write_staff ON product_variants
  FOR ALL TO authenticated
  USING (is_admin_staff())
  WITH CHECK (is_admin_staff());

-- 3. product_modifiers: allow admin/cashier to write
DROP POLICY IF EXISTS product_modifiers_write_staff ON product_modifiers;
CREATE POLICY product_modifiers_write_staff ON product_modifiers
  FOR ALL TO authenticated
  USING (is_admin_staff())
  WITH CHECK (is_admin_staff());

-- 4. combos: allow admin/cashier to write
DROP POLICY IF EXISTS combos_write_staff ON combos;
CREATE POLICY combos_write_staff ON combos
  FOR ALL TO authenticated
  USING (is_admin_staff())
  WITH CHECK (is_admin_staff());

-- 5. settings: allow admin/cashier to write (keep superadmin too)
DROP POLICY IF EXISTS settings_write_staff ON settings;
CREATE POLICY settings_write_staff ON settings
  FOR ALL TO authenticated
  USING (is_admin_staff())
  WITH CHECK (is_admin_staff());

-- 6. campaigns: allow admin/cashier to write
DROP POLICY IF EXISTS campaigns_write_staff ON campaigns;
CREATE POLICY campaigns_write_staff ON campaigns
  FOR ALL TO authenticated
  USING (is_admin_staff())
  WITH CHECK (is_admin_staff());

-- 7. Restrict public INSERT/UPDATE/DELETE on operation_logs
ALTER TABLE operation_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS operation_logs_select ON operation_logs;
CREATE POLICY operation_logs_select ON operation_logs
  FOR SELECT TO authenticated
  USING (true);
DROP POLICY IF EXISTS operation_logs_insert ON operation_logs;
CREATE POLICY operation_logs_insert ON operation_logs
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- 8. Enable RLS on remaining unprotected tables
ALTER TABLE dining_groups ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS dining_groups_all_staff ON dining_groups;
CREATE POLICY dining_groups_all_staff ON dining_groups
  FOR ALL TO authenticated
  USING (is_admin_staff())
  WITH CHECK (is_admin_staff());

ALTER TABLE kitchen_schedule ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS kitchen_schedule_select ON kitchen_schedule;
CREATE POLICY kitchen_schedule_select ON kitchen_schedule
  FOR SELECT TO authenticated
  USING (true);
DROP POLICY IF EXISTS kitchen_schedule_write ON kitchen_schedule;
CREATE POLICY kitchen_schedule_write ON kitchen_schedule
  FOR ALL TO authenticated
  USING (is_admin_staff())
  WITH CHECK (is_admin_staff());

ALTER TABLE notification_read_state ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS notification_read_state_policy ON notification_read_state;
CREATE POLICY notification_read_state_policy ON notification_read_state
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

ALTER TABLE reservations_archive ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS reservations_archive_select ON reservations_archive;
CREATE POLICY reservations_archive_select ON reservations_archive
  FOR SELECT TO authenticated
  USING (true);
DROP POLICY IF EXISTS reservations_archive_insert ON reservations_archive;
CREATE POLICY reservations_archive_insert ON reservations_archive
  FOR INSERT TO authenticated
  WITH CHECK (is_admin_staff());

ALTER TABLE waste_standards ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS waste_standards_all ON waste_standards;
CREATE POLICY waste_standards_all ON waste_standards
  FOR ALL TO authenticated
  USING (is_admin_staff())
  WITH CHECK (is_admin_staff());
