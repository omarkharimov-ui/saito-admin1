-- ═══════════════════════════════════════════════════════════════════════════════
-- SUPPLIER & PURCHASE ORDER SYSTEM
-- Migration v5 — Phase 1 of procurement intelligence
-- Drop first so CREATE TABLE works fresh (no production data yet)
-- ═══════════════════════════════════════════════════════════════════════════════

DROP TABLE IF EXISTS purchase_order_items;
DROP TABLE IF EXISTS purchase_orders;
DROP TABLE IF EXISTS suppliers;

-- ─── Suppliers ───────────────────────────────────────────────────────────────
CREATE TABLE suppliers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  contact_person  TEXT,
  phone           TEXT,
  email           TEXT,
  address         TEXT,
  tax_id          TEXT,
  notes           TEXT,
  status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  score           INTEGER,
  total_orders    INTEGER NOT NULL DEFAULT 0,
  on_time_delivery_rate DECIMAL(5,2),
  avg_price_stability   DECIMAL(5,2),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_suppliers_status ON suppliers(status);
CREATE INDEX idx_suppliers_name  ON suppliers(name);

-- ─── Purchase Orders ─────────────────────────────────────────────────────────
CREATE TABLE purchase_orders (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id     UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  order_number    TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'partial', 'received', 'cancelled')),
  total_amount    DECIMAL(10,2) NOT NULL DEFAULT 0,
  notes           TEXT,
  ordered_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  received_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_purchase_orders_supplier ON purchase_orders(supplier_id);
CREATE INDEX idx_purchase_orders_status   ON purchase_orders(status);
CREATE INDEX idx_purchase_orders_number   ON purchase_orders(order_number);

-- ─── Purchase Order Items ────────────────────────────────────────────────────
CREATE TABLE purchase_order_items (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id   UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  ingredient_id       UUID REFERENCES ingredients(id) ON DELETE SET NULL,
  product_name        TEXT NOT NULL,
  quantity            DECIMAL(10,2) NOT NULL,
  unit                TEXT NOT NULL,
  unit_cost           DECIMAL(10,2) NOT NULL,
  total_cost          DECIMAL(10,2) NOT NULL,
  received_quantity   DECIMAL(10,2) NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_po_items_purchase_order ON purchase_order_items(purchase_order_id);
CREATE INDEX idx_po_items_ingredient     ON purchase_order_items(ingredient_id);

-- ─── Auto-update `updated_at` trigger ──────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS trg_suppliers_updated_at ON suppliers;
CREATE TRIGGER trg_suppliers_updated_at
  BEFORE UPDATE ON suppliers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_purchase_orders_updated_at ON purchase_orders;
CREATE TRIGGER trg_purchase_orders_updated_at
  BEFORE UPDATE ON purchase_orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─── Row-Level Security (RLS) ─────────────────────────────────────────────
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_order_items ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated operations (single-user admin)
CREATE POLICY suppliers_all ON suppliers FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY purchase_orders_all ON purchase_orders FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY purchase_order_items_all ON purchase_order_items FOR ALL USING (true) WITH CHECK (true);
