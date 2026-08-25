-- =====================================================
-- P1: CORE DINNER WORKFLOW — Missing Columns & Fixes
-- =====================================================
-- This migration ensures all columns used by the code
-- exist in the database.

-- 1. TABLE_FLOORS — Add operational columns
ALTER TABLE table_floors ADD COLUMN IF NOT EXISTS status text DEFAULT 'empty';
ALTER TABLE table_floors ADD COLUMN IF NOT EXISTS reservation_id uuid;
ALTER TABLE table_floors ADD COLUMN IF NOT EXISTS reservation_name text;
ALTER TABLE table_floors ADD COLUMN IF NOT EXISTS reservation_phone text;
ALTER TABLE table_floors ADD COLUMN IF NOT EXISTS reservation_time text;
ALTER TABLE table_floors ADD COLUMN IF NOT EXISTS guest_count integer DEFAULT 0;
ALTER TABLE table_floors ADD COLUMN IF NOT EXISTS merged_into_table integer;

-- 2. RESERVATIONS — Add POS/order integration columns
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS customer_name text;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS table_ids jsonb DEFAULT '[]'::jsonb;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS pre_order_items jsonb DEFAULT '[]'::jsonb;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS pre_order_total numeric(10,2) DEFAULT 0;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS kitchen_scheduled_at timestamptz;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS table_number integer;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS checked_in_at timestamptz;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS completed_at timestamptz;

-- 3. ORDERS — Add lifecycle columns
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS paid_at timestamptz;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS closed_at timestamptz;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS version integer DEFAULT 1;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS merged_into uuid;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS checkin_at timestamptz;

-- 4. ORDER_ITEMS — Add modifier/tracking columns
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS modifiers jsonb DEFAULT '[]'::jsonb;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS special_notes text;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS kitchen_status text;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS is_ready_product boolean DEFAULT false;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS direct_ingredient_id uuid;

-- 5. PRODUCTS — Add columns used by POS
ALTER TABLE products ADD COLUMN IF NOT EXISTS name_az text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS name_en text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS name_ru text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS description_az text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS description_en text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS description_ru text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS ingredients_az text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS ingredients_en text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS ingredients_ru text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_ready_product boolean DEFAULT false;
ALTER TABLE products ADD COLUMN IF NOT EXISTS direct_ingredient_id uuid;

-- 6. SETTINGS — Add commonly referenced columns
ALTER TABLE settings ADD COLUMN IF NOT EXISTS restaurant_name text;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS address text;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS timezone text DEFAULT 'Asia/Baku';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS order_delay_minutes integer DEFAULT 20;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS receipt_title text;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS receipt_currency text DEFAULT '₼';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS receipt_service_fee_pct numeric(4,1) DEFAULT 10;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS receipt_show_service_fee boolean DEFAULT true;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS receipt_footer_text text;

-- =====================================================
-- INDEXES for performance
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_table_floors_table_number ON table_floors (table_number);
CREATE INDEX IF NOT EXISTS idx_table_floors_status ON table_floors (status);
CREATE INDEX IF NOT EXISTS idx_orders_table_number ON orders (table_number);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders (status);
CREATE INDEX IF NOT EXISTS idx_orders_kitchen_status ON orders (kitchen_status);
CREATE INDEX IF NOT EXISTS idx_reservations_date ON reservations (date);
CREATE INDEX IF NOT EXISTS idx_reservations_status ON reservations (status);
