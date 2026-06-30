-- ============================================================
-- SAITO ADMIN1 v2 — SADƏ, TƏMİZ, İŞLƏK
-- ============================================================
-- Supabase → SQL Editor → Run (hamısını kopyala)
-- ============================================================

-- 1. table_floors
CREATE TABLE IF NOT EXISTS table_floors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_number INTEGER NOT NULL UNIQUE,
  floor_name TEXT DEFAULT 'asagı',
  sort_order INTEGER DEFAULT 0,
  status TEXT DEFAULT 'empty',
  guest_count INTEGER,
  reservation_id UUID,
  reservation_name TEXT,
  reservation_phone TEXT,
  reservation_time TEXT,
  total_amount NUMERIC DEFAULT 0,
  order_count INTEGER DEFAULT 0,
  order_ids TEXT[] DEFAULT '{}',
  opened_at TIMESTAMPTZ,
  has_pending BOOLEAN DEFAULT false,
  oldest_pending_at TIMESTAMPTZ,
  last_activity_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. orders
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_number INTEGER NOT NULL,
  status TEXT DEFAULT 'new',
  kitchen_status TEXT DEFAULT 'pending',
  order_type TEXT DEFAULT 'dine_in',
  payment_method TEXT,
  paid_amount NUMERIC DEFAULT 0,
  cash_amount NUMERIC DEFAULT 0,
  card_amount NUMERIC DEFAULT 0,
  tip_amount NUMERIC DEFAULT 0,
  total_amount NUMERIC DEFAULT 0,
  total_items INTEGER DEFAULT 0,
  guest_count INTEGER DEFAULT 1,
  customer_note TEXT,
  special_request TEXT,
  reservation_id UUID,
  merged_into UUID,
  is_draft BOOLEAN DEFAULT false,
  is_split BOOLEAN DEFAULT false,
  version INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  cancelled_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ
);

-- 3. order_items
CREATE TABLE IF NOT EXISTS order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id UUID NOT NULL,
  variant_id UUID,
  product_name TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price NUMERIC NOT NULL DEFAULT 0,
  total_price NUMERIC NOT NULL DEFAULT 0,
  modifiers TEXT DEFAULT '[]',
  special_notes TEXT DEFAULT '',
  kitchen_status TEXT DEFAULT 'pending',
  prepared_quantity INTEGER DEFAULT 0,
  served_quantity INTEGER DEFAULT 0,
  image_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. reservations
CREATE TABLE IF NOT EXISTS reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  guests INTEGER DEFAULT 2,
  date DATE NOT NULL,
  time TEXT NOT NULL,
  note TEXT,
  status TEXT DEFAULT 'pending',
  table_number INTEGER,
  table_ids TEXT[] DEFAULT '{}',
  pre_order_items JSONB DEFAULT '[]'::jsonb,
  pre_order_total NUMERIC DEFAULT 0,
  kitchen_scheduled_at TIMESTAMPTZ,
  checked_in_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. products
CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  name_az TEXT,
  name_en TEXT,
  name_ru TEXT,
  translations JSONB DEFAULT '{}'::jsonb,
  price NUMERIC NOT NULL DEFAULT 0,
  category_id UUID,
  image_url TEXT,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  is_ready_product BOOLEAN DEFAULT false,
  has_active_recipe BOOLEAN DEFAULT false,
  direct_ingredient_id UUID,
  modifiers JSONB DEFAULT '[]'::jsonb,
  views_count INTEGER DEFAULT 0,
  sold_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. categories
CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  name_az TEXT,
  name_en TEXT,
  name_ru TEXT,
  translations JSONB DEFAULT '{}'::jsonb,
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. recipes
CREATE TABLE IF NOT EXISTS recipes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_item_id UUID NOT NULL,
  ingredient_id UUID NOT NULL,
  quantity_required NUMERIC NOT NULL DEFAULT 0,
  unit TEXT DEFAULT 'g',
  is_optional BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. ingredients
CREATE TABLE IF NOT EXISTS ingredients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  name_az TEXT,
  name_en TEXT,
  name_ru TEXT,
  translations JSONB DEFAULT '{}'::jsonb,
  current_stock NUMERIC DEFAULT 0,
  unit TEXT DEFAULT 'g',
  min_stock_threshold NUMERIC DEFAULT 0,
  average_cost_per_unit NUMERIC DEFAULT 0,
  category TEXT,
  supplier_id UUID,
  last_restocked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. inventory_logs
CREATE TABLE IF NOT EXISTS inventory_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL,
  ingredient_id UUID NOT NULL,
  order_id UUID,
  quantity NUMERIC NOT NULL,
  cost_per_unit NUMERIC DEFAULT 0,
  reason TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE inventory_logs ADD COLUMN IF NOT EXISTS unit_cost NUMERIC DEFAULT 0;
ALTER TABLE inventory_logs ADD COLUMN IF NOT EXISTS cost_per_unit NUMERIC DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_inventory_logs_type ON inventory_logs(type);
CREATE INDEX IF NOT EXISTS idx_inventory_logs_order_id ON inventory_logs(order_id);
CREATE INDEX IF NOT EXISTS idx_inventory_logs_ingredient ON inventory_logs(ingredient_id);

-- 10. cancelled_orders
CREATE TABLE IF NOT EXISTS cancelled_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID,
  table_number INTEGER NOT NULL,
  reason TEXT NOT NULL,
  reason_text TEXT,
  total_amount NUMERIC DEFAULT 0,
  items JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 11. audit_logs
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action TEXT NOT NULL,
  order_id UUID,
  item_id UUID,
  user_id UUID,
  old_amount NUMERIC,
  new_amount NUMERIC,
  discount_type TEXT,
  discount_value NUMERIC,
  reason TEXT,
  approved_by UUID,
  snapshot JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_order ON audit_logs(order_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at);

-- 12. daily_reports
CREATE TABLE IF NOT EXISTS daily_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_date DATE NOT NULL DEFAULT CURRENT_DATE,
  total_revenue NUMERIC DEFAULT 0,
  total_orders INTEGER DEFAULT 0,
  aov NUMERIC DEFAULT 0,
  items_sold INTEGER DEFAULT 0,
  cash_total NUMERIC DEFAULT 0,
  card_total NUMERIC DEFAULT 0,
  tips_total NUMERIC DEFAULT 0,
  discounts_total NUMERIC DEFAULT 0,
  voids_count INTEGER DEFAULT 0,
  voids_amount NUMERIC DEFAULT 0,
  tax_collected NUMERIC DEFAULT 0,
  starting_cash NUMERIC DEFAULT 0,
  expected_cash NUMERIC DEFAULT 0,
  actual_cash NUMERIC DEFAULT 0,
  cash_difference NUMERIC DEFAULT 0,
  cogs NUMERIC DEFAULT 0,
  labor_cost NUMERIC DEFAULT 0,
  raw_data JSONB DEFAULT '{}'::jsonb,
  closed_at TIMESTAMPTZ,
  closed_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_reports_date ON daily_reports(report_date);

-- 13. settings
CREATE TABLE IF NOT EXISTS settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  qr_table_count INTEGER DEFAULT 10,
  opening_hours TEXT DEFAULT '09:00-23:00',
  restaurant_name TEXT DEFAULT 'Restoran',
  address TEXT,
  city TEXT DEFAULT 'Bakı',
  phone TEXT,
  email TEXT,
  tax_rate NUMERIC DEFAULT 18,
  currency TEXT DEFAULT 'AZN',
  logo_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 14. staff
CREATE TABLE IF NOT EXISTS staff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  pin_hash TEXT,
  role TEXT DEFAULT 'cashier',
  is_active BOOLEAN DEFAULT true,
  phone TEXT,
  email TEXT,
  hourly_rate NUMERIC DEFAULT 5,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 15. clock_events
CREATE TABLE IF NOT EXISTS clock_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL,
  clock_in TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  clock_out TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 16. suppliers
CREATE TABLE IF NOT EXISTS suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  contact_name TEXT,
  email TEXT,
  phone TEXT,
  address TEXT,
  tax_id TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 17. purchase_orders
CREATE TABLE IF NOT EXISTS purchase_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID,
  status TEXT DEFAULT 'pending',
  total_amount NUMERIC DEFAULT 0,
  expected_delivery DATE,
  received_at TIMESTAMPTZ,
  note TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 18. invoices
CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number TEXT NOT NULL,
  supplier_id UUID,
  purchase_order_id UUID,
  total_amount NUMERIC DEFAULT 0,
  tax_amount NUMERIC DEFAULT 0,
  status TEXT DEFAULT 'pending',
  payment_due_date DATE,
  paid_at TIMESTAMPTZ,
  ocr_data JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 19. product_variants
CREATE TABLE IF NOT EXISTS product_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL,
  name TEXT NOT NULL,
  price NUMERIC NOT NULL DEFAULT 0,
  discount_price NUMERIC,
  image_url TEXT,
  is_default BOOLEAN DEFAULT false,
  variant_type TEXT DEFAULT 'olcu',
  description TEXT,
  ingredients TEXT,
  is_special BOOLEAN DEFAULT false,
  is_spicy BOOLEAN DEFAULT false,
  parent_variant_id UUID,
  translations JSONB DEFAULT '{}'::jsonb,
  views_count INTEGER DEFAULT 0,
  is_in_stock BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_product_variants_product ON product_variants(product_id);

-- 20. product_modifiers
CREATE TABLE IF NOT EXISTS product_modifiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL,
  name TEXT NOT NULL,
  name_az TEXT,
  name_en TEXT,
  name_ru TEXT,
  price NUMERIC DEFAULT 0,
  is_required BOOLEAN DEFAULT false,
  options JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_product_modifiers_product ON product_modifiers(product_id);

-- 21. combos
CREATE TABLE IF NOT EXISTS combos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  name_az TEXT,
  name_en TEXT,
  name_ru TEXT,
  description TEXT,
  description_az TEXT,
  description_en TEXT,
  description_ru TEXT,
  price NUMERIC NOT NULL DEFAULT 0,
  image_url TEXT,
  is_in_stock BOOLEAN DEFAULT true,
  is_active BOOLEAN DEFAULT true,
  translations JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 22. combo_items
CREATE TABLE IF NOT EXISTS combo_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  combo_id UUID NOT NULL REFERENCES combos(id) ON DELETE CASCADE,
  product_id UUID NOT NULL,
  variant_id UUID,
  quantity INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_combo_items_combo ON combo_items(combo_id);

-- 23. campaigns
CREATE TABLE IF NOT EXISTS campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT,
  description TEXT,
  type TEXT,
  target_type TEXT,
  target_id UUID,
  discount_value NUMERIC DEFAULT 0,
  start_time TIMESTAMPTZ,
  end_time TIMESTAMPTZ,
  end_date DATE,
  status TEXT DEFAULT 'active',
  image_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(status);
CREATE INDEX IF NOT EXISTS idx_campaigns_type ON campaigns(type);

-- 24. waste_standards
CREATE TABLE IF NOT EXISTS waste_standards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  keyword TEXT NOT NULL,
  keyword_en TEXT,
  waste_percentage NUMERIC NOT NULL DEFAULT 0,
  note TEXT,
  category TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 25. discrepancy_alerts
CREATE TABLE IF NOT EXISTS discrepancy_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL,
  severity TEXT DEFAULT 'medium',
  title TEXT NOT NULL,
  description TEXT,
  source_id TEXT,
  source_table TEXT,
  value NUMERIC DEFAULT 0,
  expected_value NUMERIC DEFAULT 0,
  variance_pct NUMERIC DEFAULT 0,
  status TEXT DEFAULT 'open',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_discrepancy_alerts_status ON discrepancy_alerts(status);
CREATE INDEX IF NOT EXISTS idx_discrepancy_alerts_type ON discrepancy_alerts(type);

-- 26. recipe_headers
CREATE TABLE IF NOT EXISTS recipe_headers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_item_id UUID NOT NULL,
  instructions TEXT,
  portions INTEGER DEFAULT 1,
  prep_time INTEGER DEFAULT 0,
  cook_time INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recipe_headers_menu ON recipe_headers(menu_item_id);

-- 27. sessions
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id UUID NOT NULL,
  role TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

-- 28. admin_users
CREATE TABLE IF NOT EXISTS admin_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role TEXT NOT NULL DEFAULT 'cashier',
  is_active BOOLEAN DEFAULT true,
  pin TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_users_pin ON admin_users(pin);


-- Ensure existing tables have all required columns
ALTER TABLE table_floors ADD COLUMN IF NOT EXISTS merged_into_table INTEGER;
ALTER TABLE table_floors ADD COLUMN IF NOT EXISTS merged_orders JSONB DEFAULT '[]'::jsonb;
ALTER TABLE table_floors ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE table_floors ADD COLUMN IF NOT EXISTS has_pending BOOLEAN DEFAULT false;
ALTER TABLE table_floors ADD COLUMN IF NOT EXISTS oldest_pending_at TIMESTAMPTZ;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS kitchen_status TEXT DEFAULT 'pending';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS is_draft BOOLEAN DEFAULT false;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS merged_into UUID;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS reservation_id UUID;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS kitchen_ready_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS special_request TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS created_by UUID;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS assigned_to UUID;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS priority INTEGER DEFAULT 0;

ALTER TABLE order_items ADD COLUMN IF NOT EXISTS kitchen_status TEXT DEFAULT 'pending';
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS prepared_quantity INTEGER DEFAULT 0;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS served_quantity INTEGER DEFAULT 0;

ALTER TABLE reservations ADD COLUMN IF NOT EXISTS pre_order_items JSONB DEFAULT '[]'::jsonb;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS pre_order_total NUMERIC DEFAULT 0;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS kitchen_scheduled_at TIMESTAMPTZ;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS checked_in_at TIMESTAMPTZ;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

ALTER TABLE products ADD COLUMN IF NOT EXISTS is_ready_product BOOLEAN DEFAULT false;
ALTER TABLE products ADD COLUMN IF NOT EXISTS has_active_recipe BOOLEAN DEFAULT false;
ALTER TABLE products ADD COLUMN IF NOT EXISTS direct_ingredient_id UUID;
ALTER TABLE products ADD COLUMN IF NOT EXISTS modifiers JSONB DEFAULT '[]'::jsonb;
ALTER TABLE products ADD COLUMN IF NOT EXISTS views_count INTEGER DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS sold_count INTEGER DEFAULT 0;

ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS min_stock_threshold NUMERIC DEFAULT 0;
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS average_cost_per_unit NUMERIC DEFAULT 0;
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS last_restocked_at TIMESTAMPTZ;

ALTER TABLE settings ADD COLUMN IF NOT EXISTS tax_rate NUMERIC DEFAULT 18;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'AZN';

ALTER TABLE staff ADD COLUMN IF NOT EXISTS pin_hash TEXT;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'cashier';
ALTER TABLE staff ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS hourly_rate NUMERIC DEFAULT 5;

-- ============================================================
-- Default data
-- ============================================================

INSERT INTO settings (restaurant_name, qr_table_count, opening_hours, tax_rate)
SELECT 'Restoran', 20, '09:00-23:00', 18
WHERE NOT EXISTS (SELECT 1 FROM settings LIMIT 1);

INSERT INTO staff (name, role, pin_hash, full_name, is_active, hourly_rate, created_at)
SELECT 'Admin', 'superadmin', 'pbkdf2_sha256$260000$dummy', 'Admin', true, 5, NOW()
WHERE NOT EXISTS (SELECT 1 FROM staff LIMIT 1);

INSERT INTO staff (name, role, pin_hash, full_name, is_active, hourly_rate, created_at)
VALUES 
  ('Admin', 'superadmin', 'pbkdf2_sha256$260000$dummy', 'Admin', true, 5, NOW()),
  ('Kassir', 'cashier', 'pbkdf2_sha256$260000$dummy', 'Kassir', true, 5, NOW())
ON CONFLICT DO NOTHING;

-- ============================================================
-- STOCK AUTOMATION TRIGGER
-- Avtomatik stock azaltma / artırma
-- ============================================================

CREATE OR REPLACE FUNCTION update_ingredient_stock()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.type = 'stock_in' THEN
    UPDATE ingredients SET current_stock = current_stock + NEW.quantity WHERE id = NEW.ingredient_id;
  ELSIF NEW.type = 'order_consumption' THEN
    UPDATE ingredients SET current_stock = current_stock - NEW.quantity WHERE id = NEW.ingredient_id;
  ELSIF NEW.type IN ('waste', 'adjustment') THEN
    UPDATE ingredients SET current_stock = current_stock - ABS(NEW.quantity) WHERE id = NEW.ingredient_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_ingredient_stock ON inventory_logs;
CREATE TRIGGER trg_update_ingredient_stock
  AFTER INSERT ON inventory_logs
  FOR EACH ROW EXECUTE FUNCTION update_ingredient_stock();

-- ============================================================
-- REALTIME: enable in Supabase Dashboard → Database → Replication
-- Tables: orders, order_items, table_floors, reservations, inventory_logs
-- ============================================================

-- FIX: insert staff using the correct column name that already exists
INSERT INTO staff (name, role, pin_hash, full_name, is_active, hourly_rate, created_at)
VALUES 
  ('Admin', 'superadmin', 'pbkdf2_sha256$260000$dummy', 'Admin', true, 5, NOW()),
  ('Kassir', 'cashier', 'pbkdf2_sha256$260000$dummy', 'Kassir', true, 5, NOW())
ON CONFLICT DO NOTHING;
