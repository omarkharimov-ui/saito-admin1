-- ═══════════════════════════════════════════════════════════════
-- MIGRATION v3 — All new features (Phases 3–9)
-- Run this in Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════

-- 1. ORDERS — order_type
ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_type text DEFAULT 'dine_in';

-- 2. CUSTOMERS table + customer_id on orders
CREATE TABLE IF NOT EXISTS customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone text,
  total_visits integer DEFAULT 1,
  total_spent numeric DEFAULT 0,
  last_order_at timestamptz,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES customers(id);

-- 3. CLOCK_EVENTS table
CREATE TABLE IF NOT EXISTS clock_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid REFERENCES staff(id) NOT NULL,
  clock_in timestamptz NOT NULL DEFAULT now(),
  clock_out timestamptz
);

-- 4. ORDER_ITEMS — course column
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS course text DEFAULT 'main';

-- 5. ORDERS — guest_count & tip_amount
ALTER TABLE orders ADD COLUMN IF NOT EXISTS guest_count integer DEFAULT 1;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tip_amount numeric DEFAULT 0;

-- 6. TABLE_FLOORS — floor/zone assignments per table
CREATE TABLE IF NOT EXISTS table_floors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_number integer NOT NULL UNIQUE,
  floor_name text NOT NULL DEFAULT '1-ci Mərtəbə',
  sort_order integer DEFAULT 0
);

-- 7. Seed default floor assignments (if you have 15 tables, floors 1–2)
INSERT INTO table_floors (table_number, floor_name, sort_order)
SELECT i, '1-ci Mərtəbə', 0
FROM generate_series(1, 8) AS i
WHERE NOT EXISTS (SELECT 1 FROM table_floors WHERE table_number = i);

INSERT INTO table_floors (table_number, floor_name, sort_order)
SELECT i, '2-ci Mərtəbə', 1
FROM generate_series(9, 15) AS i
WHERE NOT EXISTS (SELECT 1 FROM table_floors WHERE table_number = i);

SELECT 'migration v3 completed' AS status;
