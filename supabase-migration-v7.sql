-- ────────────────────────────────────────────────────────────────────────────
-- Migration v7: Procurement Reviews & Discrepancy Alerts (Phase 4 — Complete)
-- ────────────────────────────────────────────────────────────────────────────

-- Procurement Review Queue (unmatched invoice line items)
DROP TABLE IF EXISTS procurement_reviews CASCADE;
CREATE TABLE procurement_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id UUID REFERENCES purchase_orders(id) ON DELETE SET NULL,
  invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  quantity NUMERIC(12,3) DEFAULT 0,
  unit TEXT DEFAULT 'gram',
  unit_cost NUMERIC(12,4) DEFAULT 0,
  suggested_ingredient_id UUID REFERENCES ingredients(id) ON DELETE SET NULL,
  match_confidence NUMERIC(4,2),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'mapped')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Discrepancy Alerts
DROP TABLE IF EXISTS discrepancy_alerts CASCADE;
CREATE TABLE discrepancy_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL
    CHECK (type IN ('invoice_amount', 'received_qty', 'stock_vs_sales', 'recipe_vs_actual', 'supplier_price', 'waste_vs_norm', 'margin_drop')),
  severity TEXT NOT NULL DEFAULT 'medium'
    CHECK (severity IN ('critical', 'high', 'medium', 'low')),
  title TEXT NOT NULL,
  description TEXT,
  source_id TEXT,
  source_table TEXT,
  value NUMERIC(12,2) DEFAULT 0,
  expected_value NUMERIC(12,2) DEFAULT 0,
  variance_pct NUMERIC(6,2) DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'acknowledged', 'resolved')),
  created_at TIMESTAMPTZ DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX idx_procurement_reviews_status ON procurement_reviews(status);
CREATE INDEX idx_procurement_reviews_po ON procurement_reviews(purchase_order_id);
CREATE INDEX idx_discrepancy_alerts_type ON discrepancy_alerts(type);
CREATE INDEX idx_discrepancy_alerts_severity ON discrepancy_alerts(severity);
CREATE INDEX idx_discrepancy_alerts_status ON discrepancy_alerts(status);
CREATE INDEX idx_discrepancy_alerts_created ON discrepancy_alerts(created_at DESC);

-- RLS
ALTER TABLE procurement_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE discrepancy_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated full access procurement_reviews"
  ON procurement_reviews FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated full access discrepancy_alerts"
  ON discrepancy_alerts FOR ALL TO authenticated USING (true) WITH CHECK (true);
