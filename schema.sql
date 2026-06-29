-- ============================================================
-- SAITO ADMIN1 — Restaurant POS Complete Schema
-- ============================================================
-- Bu SQL'i Supabase Dashboard → SQL Editor-da işə sal.
-- ============================================================


-- ── 1. TABLE_FLOORS ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS table_floors (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_number    INTEGER NOT NULL UNIQUE,
  floor_name      TEXT DEFAULT 'asagı',
  sort_order      INTEGER DEFAULT 0,
  status          TEXT DEFAULT 'empty',
  guest_count     INTEGER,
  reservation_id  UUID,
  reservation_name  TEXT,
  reservation_phone TEXT,
  reservation_time  TEXT,
  total_amount    NUMERIC DEFAULT 0,
  order_count     INTEGER DEFAULT 0,
  order_ids       TEXT[],
  opened_at       TIMESTAMPTZ,
  has_pending     BOOLEAN DEFAULT false,
  oldest_pending_at TIMESTAMPTZ,
  merged_into_table INTEGER,
  merged_orders   JSONB DEFAULT '[]'::jsonb,
  last_activity_at TIMESTAMPTZ DEFAULT NOW(),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);


-- ── 2. ORDERS ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS orders (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_number      INTEGER NOT NULL,
  status            TEXT DEFAULT 'new',
  kitchen_status    TEXT DEFAULT 'pending',
  order_type        TEXT DEFAULT 'dine_in',
  payment_method    TEXT,
  paid_amount       NUMERIC DEFAULT 0,
  cash_amount       NUMERIC DEFAULT 0,
  card_amount       NUMERIC DEFAULT 0,
  tip_amount        NUMERIC DEFAULT 0,
  total_amount      NUMERIC DEFAULT 0,
  total_items       INTEGER DEFAULT 0,
  guest_count       INTEGER DEFAULT 1,
  customer_note     TEXT,
  special_request   TEXT,
  reservation_id    UUID,
  merged_into       UUID,
  is_draft          BOOLEAN DEFAULT false,
  is_split          BOOLEAN DEFAULT false,
  is_rush           BOOLEAN DEFAULT false,
  version           INTEGER DEFAULT 1,
  created_by        UUID,
  assigned_to       UUID,
  priority          INTEGER DEFAULT 0,
  kitchen_ready_at  TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW(),
  cancelled_at      TIMESTAMPTZ,
  paid_at           TIMESTAMPTZ
);


-- ── 3. ORDER_ITEMS ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS order_items (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id          UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id        UUID NOT NULL,
  variant_id        UUID,
  product_name      TEXT NOT NULL,
  quantity          INTEGER NOT NULL DEFAULT 1,
  unit_price        NUMERIC NOT NULL DEFAULT 0,
  total_price       NUMERIC NOT NULL DEFAULT 0,
  modifiers         TEXT DEFAULT '[]',
  special_notes     TEXT DEFAULT '',
  kitchen_status    TEXT DEFAULT 'pending',
  prepared_quantity INTEGER DEFAULT 0,
  served_quantity   INTEGER DEFAULT 0,
  image_url         TEXT,
  legacy_id         UUID,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);


-- ── 4. RESERVATIONS ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reservations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name              TEXT NOT NULL,
  phone             TEXT NOT NULL,
  guests            INTEGER DEFAULT 2,
  date              DATE NOT NULL,
  time              TEXT NOT NULL,
  note              TEXT,
  status            TEXT DEFAULT 'pending',
  table_number      INTEGER,
  table_ids         TEXT[] DEFAULT '{}',
  pre_order_items   JSONB DEFAULT '[]'::jsonb,
  pre_order_total   NUMERIC DEFAULT 0,
  kitchen_scheduled_at TIMESTAMPTZ,
  checked_in_at     TIMESTAMPTZ,
  completed_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);


-- ── 5. PRODUCTS ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS products (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                 TEXT NOT NULL,
  name_az              TEXT,
  name_en              TEXT,
  name_ru              TEXT,
  translations         JSONB DEFAULT '{}'::jsonb,
  price                NUMERIC NOT NULL DEFAULT 0,
  category_id          UUID,
  image_url            TEXT,
  description          TEXT,
  is_active            BOOLEAN DEFAULT true,
  is_ready_product     BOOLEAN DEFAULT false,
  has_active_recipe    BOOLEAN DEFAULT false,
  direct_ingredient_id UUID,
  modifiers            JSONB DEFAULT '[]'::jsonb,
  views_count          INTEGER DEFAULT 0,
  sold_count           INTEGER DEFAULT 0,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);


-- ── 6. CATEGORIES ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS categories (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  name_az      TEXT,
  name_en      TEXT,
  name_ru      TEXT,
  translations JSONB DEFAULT '{}'::jsonb,
  sort_order   INTEGER DEFAULT 0,
  is_active    BOOLEAN DEFAULT true,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);


-- ── 7. RECIPES ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS recipes (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_item_id     UUID NOT NULL,
  ingredient_id    UUID NOT NULL,
  quantity_required NUMERIC NOT NULL DEFAULT 0,
  unit             TEXT DEFAULT 'g',
  is_optional      BOOLEAN DEFAULT false,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);


-- ── 8. INGREDIENTS ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ingredients (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                 TEXT NOT NULL,
  name_az              TEXT,
  name_en              TEXT,
  name_ru              TEXT,
  translations         JSONB DEFAULT '{}'::jsonb,
  current_stock        NUMERIC DEFAULT 0,
  unit                 TEXT DEFAULT 'g',
  min_stock_threshold  NUMERIC DEFAULT 0,
  average_cost_per_unit NUMERIC DEFAULT 0,
  category             TEXT,
  supplier_id          UUID,
  last_restocked_at    TIMESTAMPTZ,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);


-- ── 9. INVENTORY_LOGS ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inventory_logs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type             TEXT NOT NULL,
  ingredient_id    UUID NOT NULL,
  order_id         UUID,
  quantity         NUMERIC NOT NULL,
  cost_per_unit    NUMERIC DEFAULT 0,
  reason           TEXT,
  created_by       UUID,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inventory_logs_type ON inventory_logs(type);
CREATE INDEX IF NOT EXISTS idx_inventory_logs_order_id ON inventory_logs(order_id);
CREATE INDEX IF NOT EXISTS idx_inventory_logs_ingredient ON inventory_logs(ingredient_id);


-- ── 10. CANCELLED_ORDERS ────────────────────────────────────
CREATE TABLE IF NOT EXISTS cancelled_orders (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id     UUID,
  table_number INTEGER NOT NULL,
  reason       TEXT NOT NULL,
  reason_text  TEXT,
  total_amount NUMERIC DEFAULT 0,
  items        JSONB DEFAULT '[]'::jsonb,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);


-- ── 11. AUDIT_LOGS ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_logs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action       TEXT NOT NULL,
  order_id     UUID,
  item_id      UUID,
  user_id      UUID,
  old_amount   NUMERIC,
  new_amount   NUMERIC,
  discount_type TEXT,
  discount_value NUMERIC,
  reason       TEXT,
  approved_by  UUID,
  snapshot     JSONB DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_order ON audit_logs(order_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at);


-- ── 12. DAILY_REPORTS (Z-Report) ────────────────────────────
CREATE TABLE IF NOT EXISTS daily_reports (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_date     DATE NOT NULL DEFAULT CURRENT_DATE,
  total_revenue   NUMERIC DEFAULT 0,
  total_orders    INTEGER DEFAULT 0,
  aov             NUMERIC DEFAULT 0,
  items_sold      INTEGER DEFAULT 0,
  cash_total      NUMERIC DEFAULT 0,
  card_total      NUMERIC DEFAULT 0,
  tips_total      NUMERIC DEFAULT 0,
  discounts_total NUMERIC DEFAULT 0,
  voids_count     INTEGER DEFAULT 0,
  voids_amount    NUMERIC DEFAULT 0,
  tax_collected   NUMERIC DEFAULT 0,
  starting_cash   NUMERIC DEFAULT 0,
  expected_cash   NUMERIC DEFAULT 0,
  actual_cash     NUMERIC DEFAULT 0,
  cash_difference NUMERIC DEFAULT 0,
  cogs            NUMERIC DEFAULT 0,
  labor_cost      NUMERIC DEFAULT 0,
  raw_data        JSONB DEFAULT '{}'::jsonb,
  closed_at       TIMESTAMPTZ,
  closed_by       UUID,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_reports_date ON daily_reports(report_date);


-- ── 13. SETTINGS ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS settings (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  qr_table_count INTEGER DEFAULT 10,
  opening_hours  TEXT DEFAULT '09:00-23:00',
  restaurant_name TEXT DEFAULT 'Restoran',
  address        TEXT,
  city           TEXT DEFAULT 'Bakı',
  phone          TEXT,
  email          TEXT,
  tax_rate       NUMERIC DEFAULT 18,
  currency       TEXT DEFAULT 'AZN',
  logo_url       TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);


-- ── 14. STAFF ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS staff (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name     TEXT NOT NULL,
  pin_hash      TEXT,
  role          TEXT DEFAULT 'cashier',
  is_active     BOOLEAN DEFAULT true,
  phone         TEXT,
  email         TEXT,
  hourly_rate   NUMERIC DEFAULT 5,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);


-- ── 15. CLOCK_EVENTS ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS clock_events (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id   UUID NOT NULL,
  clock_in   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  clock_out  TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);


-- ── 16. SUPPLIERS ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS suppliers (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  contact_name TEXT,
  email        TEXT,
  phone        TEXT,
  address      TEXT,
  tax_id       TEXT,
  is_active    BOOLEAN DEFAULT true,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);


-- ── 17. PURCHASE_ORDERS ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS purchase_orders (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id     UUID,
  status          TEXT DEFAULT 'pending',
  total_amount    NUMERIC DEFAULT 0,
  expected_delivery DATE,
  received_at     TIMESTAMPTZ,
  note            TEXT,
  created_by      UUID,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);


-- ── 18. INVOICES ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS invoices (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number  TEXT NOT NULL,
  supplier_id     UUID,
  purchase_order_id UUID,
  total_amount    NUMERIC DEFAULT 0,
  tax_amount      NUMERIC DEFAULT 0,
  status          TEXT DEFAULT 'pending',
  payment_due_date DATE,
  paid_at         TIMESTAMPTZ,
  ocr_data        JSONB DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);


-- ============================================================
-- ROW LEVEL SECURITY — Policies
-- ============================================================
-- Qayda: service_role (backend) tam giriş, authenticated istifadəçilər rol əsaslı, public minimal
-- ============================================================

-- table_floors
ALTER TABLE table_floors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_full_table_floors" ON table_floors FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "auth_read_table_floors" ON table_floors FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_modify_table_floors" ON table_floors FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM staff WHERE staff.id = auth.uid()::uuid AND staff.role IN ('superadmin','admin','cashier'))
);

-- orders
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_full_orders" ON orders FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "auth_read_orders" ON orders FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_modify_orders" ON orders FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM staff WHERE staff.id = auth.uid()::uuid AND staff.role IN ('superadmin','admin','cashier','kitchen'))
);

-- order_items
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_full_order_items" ON order_items FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "auth_read_order_items" ON order_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_modify_order_items" ON order_items FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM staff WHERE staff.id = auth.uid()::uuid AND staff.role IN ('superadmin','admin','cashier','kitchen'))
);

-- reservations
ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_full_reservations" ON reservations FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "auth_read_reservations" ON reservations FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_modify_reservations" ON reservations FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM staff WHERE staff.id = auth.uid()::uuid AND staff.role IN ('superadmin','admin','cashier'))
);
CREATE POLICY "public_create_reservation" ON reservations FOR INSERT TO public WITH CHECK (true);

-- products
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_full_products" ON products FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "auth_read_products" ON products FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_modify_products" ON products FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM staff WHERE staff.id = auth.uid()::uuid AND staff.role IN ('superadmin','admin'))
);

-- categories
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_full_categories" ON categories FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "auth_read_categories" ON categories FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_modify_categories" ON categories FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM staff WHERE staff.id = auth.uid()::uuid AND staff.role IN ('superadmin','admin'))
);

-- recipes
ALTER TABLE recipes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_full_recipes" ON recipes FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "auth_read_recipes" ON recipes FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_modify_recipes" ON recipes FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM staff WHERE staff.id = auth.uid()::uuid AND staff.role IN ('superadmin','admin'))
);

-- ingredients
ALTER TABLE ingredients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_full_ingredients" ON ingredients FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "auth_read_ingredients" ON ingredients FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_modify_ingredients" ON ingredients FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM staff WHERE staff.id = auth.uid()::uuid AND staff.role IN ('superadmin','admin'))
);

-- inventory_logs
ALTER TABLE inventory_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_full_inventory_logs" ON inventory_logs FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "auth_read_inventory_logs" ON inventory_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_modify_inventory_logs" ON inventory_logs FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM staff WHERE staff.id = auth.uid()::uuid AND staff.role IN ('superadmin','admin'))
);

-- cancelled_orders
ALTER TABLE cancelled_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_full_cancelled_orders" ON cancelled_orders FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "auth_read_cancelled_orders" ON cancelled_orders FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_modify_cancelled_orders" ON cancelled_orders FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM staff WHERE staff.id = auth.uid()::uuid AND staff.role IN ('superadmin','admin','cashier','kitchen'))
);

-- audit_logs
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_full_audit_logs" ON audit_logs FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "auth_read_audit_logs" ON audit_logs FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM staff WHERE staff.id = auth.uid()::uuid AND staff.role IN ('superadmin','admin'))
);

-- daily_reports
ALTER TABLE daily_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_full_daily_reports" ON daily_reports FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "auth_read_daily_reports" ON daily_reports FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM staff WHERE staff.id = auth.uid()::uuid AND staff.role IN ('superadmin','admin'))
);

-- settings
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_full_settings" ON settings FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "auth_read_settings" ON settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_modify_settings" ON settings FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM staff WHERE staff.id = auth.uid()::uuid AND staff.role IN ('superadmin','admin'))
);

-- staff
ALTER TABLE staff ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_full_staff" ON staff FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "auth_read_staff" ON staff FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM staff s2 WHERE s2.id = auth.uid()::uuid AND s2.role IN ('superadmin','admin'))
);
CREATE POLICY "auth_modify_staff" ON staff FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM staff WHERE staff.id = auth.uid()::uuid AND staff.role = 'superadmin')
);

-- clock_events
ALTER TABLE clock_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_full_clock_events" ON clock_events FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "auth_read_clock_events" ON clock_events FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_modify_clock_events" ON clock_events FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM staff WHERE staff.id = auth.uid()::uuid AND staff.role IN ('superadmin','admin'))
);

-- suppliers
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_full_suppliers" ON suppliers FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "auth_read_suppliers" ON suppliers FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_modify_suppliers" ON suppliers FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM staff WHERE staff.id = auth.uid()::uuid AND staff.role IN ('superadmin','admin'))
);

-- purchase_orders
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_full_purchase_orders" ON purchase_orders FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "auth_read_purchase_orders" ON purchase_orders FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_modify_purchase_orders" ON purchase_orders FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM staff WHERE staff.id = auth.uid()::uuid AND staff.role IN ('superadmin','admin'))
);

-- invoices
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_full_invoices" ON invoices FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "auth_read_invoices" ON invoices FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_modify_invoices" ON invoices FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM staff WHERE staff.id = auth.uid()::uuid AND staff.role IN ('superadmin','admin'))
);


-- ============================================================
-- DEFAULt DATA — ilkin quruluş
-- ============================================================

-- Default settings
INSERT INTO settings (restaurant_name, qr_table_count, opening_hours, currency, tax_rate)
VALUES ('Restoran', 20, '09:00-23:00', 'AZN', 18)
ON CONFLICT DO NOTHING;

-- Default staff
INSERT INTO staff (full_name, role, pin_hash)
VALUES 
  ('Admin', 'superadmin', 'pbkdf2_sha256$260000$dummy'),
  ('Kassir', 'cashier', 'pbkdf2_sha256$260000$dummy')
ON CONFLICT DO NOTHING;


-- ============================================================
-- REALTIME SUBSCRIPTIONS (Supabase Dashboard-dan aktivləşdir)
-- ============================================================
-- Supabase Dashboard → Database → Replication
-- Aşağıdakı cədvəlləri aktivləşdir:
--   orders, order_items, table_floors, reservations, inventory_logs
-- ============================================================
