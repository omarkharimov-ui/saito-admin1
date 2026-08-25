-- ============================================================================
-- FIX 6/8: P11 — Stock Counts tables + RLS
-- ============================================================================
CREATE TABLE IF NOT EXISTS stock_counts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  count_number TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'in_progress', 'completed', 'cancelled')),
  counted_by UUID,
  notes TEXT,
  total_variance NUMERIC(12,2) DEFAULT 0,
  counted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS stock_count_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_count_id UUID NOT NULL REFERENCES stock_counts(id) ON DELETE CASCADE,
  ingredient_id UUID NOT NULL REFERENCES ingredients(id) ON DELETE RESTRICT,
  system_qty NUMERIC(12,3) NOT NULL,
  actual_qty NUMERIC(12,3) NOT NULL,
  variance NUMERIC(12,3) NOT NULL DEFAULT 0,
  unit_cost NUMERIC(12,4),
  variance_cost NUMERIC(12,2) DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stock_counts_status ON stock_counts(status);
CREATE INDEX IF NOT EXISTS idx_stock_count_items_count ON stock_count_items(stock_count_id);
CREATE INDEX IF NOT EXISTS idx_stock_count_items_ingredient ON stock_count_items(ingredient_id);

ALTER TABLE stock_counts ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_count_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS stock_counts_select ON stock_counts;
CREATE POLICY stock_counts_select ON stock_counts FOR SELECT USING (true);
DROP POLICY IF EXISTS stock_counts_insert ON stock_counts;
CREATE POLICY stock_counts_insert ON stock_counts FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS stock_counts_update ON stock_counts;
CREATE POLICY stock_counts_update ON stock_counts FOR UPDATE USING (true);
DROP POLICY IF EXISTS stock_counts_delete ON stock_counts;
CREATE POLICY stock_counts_delete ON stock_counts FOR DELETE USING (true);

DROP POLICY IF EXISTS stock_count_items_select ON stock_count_items;
CREATE POLICY stock_count_items_select ON stock_count_items FOR SELECT USING (true);
DROP POLICY IF EXISTS stock_count_items_insert ON stock_count_items;
CREATE POLICY stock_count_items_insert ON stock_count_items FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS stock_count_items_update ON stock_count_items;
CREATE POLICY stock_count_items_update ON stock_count_items FOR UPDATE USING (true);
DROP POLICY IF EXISTS stock_count_items_delete ON stock_count_items;
CREATE POLICY stock_count_items_delete ON stock_count_items FOR DELETE USING (true);
