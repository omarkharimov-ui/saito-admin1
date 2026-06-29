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

VALUES 
  ('Admin', 'superadmin', 'pbkdf2_sha256$260000$dummy'),
  ('Kassir', 'cashier', 'pbkdf2_sha256$260000$dummy')
ON CONFLICT DO NOTHING;

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
