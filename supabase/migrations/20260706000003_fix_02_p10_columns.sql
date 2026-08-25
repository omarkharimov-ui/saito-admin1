-- ============================================================================
-- FIX 2/8: P10 — Add campaign pricing columns
-- ============================================================================
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS start_date DATE;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS priority INTEGER DEFAULT 0;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS min_purchase_amount NUMERIC(10,2) DEFAULT 0;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS min_items INTEGER DEFAULT 0;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS applicable_categories TEXT[] DEFAULT '{}';
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS applicable_products TEXT[] DEFAULT '{}';
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS combo_id UUID;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS max_discount_amount NUMERIC(10,2);
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS current_uses INTEGER DEFAULT 0;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS max_uses INTEGER DEFAULT 0;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS label TEXT;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS badge_color TEXT DEFAULT '#D4AF37';

-- Ensure combo_items table exists
CREATE TABLE IF NOT EXISTS combo_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  combo_id UUID NOT NULL REFERENCES combos(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE combo_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS combo_items_select ON combo_items;
CREATE POLICY combo_items_select ON combo_items FOR SELECT USING (true);
DROP POLICY IF EXISTS combo_items_insert ON combo_items;
CREATE POLICY combo_items_insert ON combo_items FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS combo_items_update ON combo_items;
CREATE POLICY combo_items_update ON combo_items FOR UPDATE USING (true);
DROP POLICY IF EXISTS combo_items_delete ON combo_items;
CREATE POLICY combo_items_delete ON combo_items FOR DELETE USING (true);
