-- ═══════════════════════════════════════════════════════════════
-- SAITO ADMIN — Stock Management Schema
-- Supabase SQL Editor-a yapışdırın
-- ═══════════════════════════════════════════════════════════════

-- 1. INGREDIENTS cədvəli
CREATE TABLE IF NOT EXISTS ingredients (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  unit        TEXT NOT NULL CHECK (unit IN ('kq', 'ədəd', 'litr', 'qram')),
  min_limit   NUMERIC(10, 2) NOT NULL DEFAULT 5.00,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. STOCK_TRANSACTIONS cədvəli
CREATE TYPE IF NOT EXISTS stock_transaction_type AS ENUM ('manual_entry', 'sale', 'waste');

CREATE TABLE IF NOT EXISTS stock_transactions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ingredient_id  UUID NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
  quantity       NUMERIC(10, 2) NOT NULL, -- müsbət = giriş, mənfi = çıxış
  type           stock_transaction_type NOT NULL DEFAULT 'manual_entry',
  description    TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stock_transactions_ingredient
  ON stock_transactions(ingredient_id);

-- 3. CURRENT_STOCK VIEW — anlıq stok
CREATE OR REPLACE VIEW current_stock AS
SELECT
  i.id              AS ingredient_id,
  i.name,
  i.unit,
  i.min_limit,
  i.created_at,
  COALESCE(SUM(t.quantity), 0) AS total_stock,
  CASE
    WHEN COALESCE(SUM(t.quantity), 0) <= i.min_limit THEN true
    ELSE false
  END AS is_low_stock
FROM ingredients i
LEFT JOIN stock_transactions t ON t.ingredient_id = i.id
GROUP BY i.id, i.name, i.unit, i.min_limit, i.created_at
ORDER BY i.name;

-- RLS (Row Level Security) — service_role tam icazəli
ALTER TABLE ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_ingredients" ON ingredients
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "service_role_transactions" ON stock_transactions
  FOR ALL USING (true) WITH CHECK (true);

-- Test məlumatları (istəyə görə)
-- INSERT INTO ingredients (name, unit, min_limit) VALUES
--   ('Düyü', 'kq', 10),
--   ('Somon', 'kq', 3),
--   ('Avokado', 'ədəd', 20),
--   ('Soya sousu', 'litr', 2),
--   ('Nori vərəqi', 'ədəd', 50);
