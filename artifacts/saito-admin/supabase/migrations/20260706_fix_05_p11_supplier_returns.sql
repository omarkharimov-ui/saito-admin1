-- ============================================================================
-- FIX 5/8: P11 — Supplier Returns tables + RLS
-- ============================================================================
CREATE TABLE IF NOT EXISTS supplier_returns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  return_number TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'completed', 'cancelled')),
  total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  reason TEXT,
  returned_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS supplier_return_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_return_id UUID NOT NULL REFERENCES supplier_returns(id) ON DELETE CASCADE,
  ingredient_id UUID NOT NULL REFERENCES ingredients(id) ON DELETE RESTRICT,
  quantity NUMERIC(12,3) NOT NULL CHECK (quantity > 0),
  unit_cost NUMERIC(12,4) NOT NULL DEFAULT 0,
  total_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_supplier_returns_supplier ON supplier_returns(supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_returns_status ON supplier_returns(status);
CREATE INDEX IF NOT EXISTS idx_supplier_return_items_return ON supplier_return_items(supplier_return_id);

ALTER TABLE supplier_returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_return_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS supplier_returns_select ON supplier_returns;
CREATE POLICY supplier_returns_select ON supplier_returns FOR SELECT USING (true);
DROP POLICY IF EXISTS supplier_returns_insert ON supplier_returns;
CREATE POLICY supplier_returns_insert ON supplier_returns FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS supplier_returns_update ON supplier_returns;
CREATE POLICY supplier_returns_update ON supplier_returns FOR UPDATE USING (true);

DROP POLICY IF EXISTS supplier_return_items_select ON supplier_return_items;
CREATE POLICY supplier_return_items_select ON supplier_return_items FOR SELECT USING (true);
DROP POLICY IF EXISTS supplier_return_items_insert ON supplier_return_items;
CREATE POLICY supplier_return_items_insert ON supplier_return_items FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS supplier_return_items_update ON supplier_return_items;
CREATE POLICY supplier_return_items_update ON supplier_return_items FOR UPDATE USING (true);
