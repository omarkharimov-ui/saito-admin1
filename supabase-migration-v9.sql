-- Migration v9: ingredient-supplier connection + supplier stats persistence

-- 1. Add supplier_id to ingredients
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ingredients_supplier ON ingredients(supplier_id);

-- 2. Add supplier score columns (not null means we can write them)
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS on_time_delivery_rate DECIMAL(5,2);
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS avg_price_stability  DECIMAL(5,2);
