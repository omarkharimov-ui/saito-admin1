-- ============================================================================
-- P7 PAYMENT CAPABILITY
-- State machine enforcement + campaign tracking + audit support
-- ============================================================================

-- ─── 1. Fix existing 'paid' status → 'empty' ───
UPDATE table_floors SET status = 'empty' WHERE status = 'paid';

-- ─── 2. table_floors state machine CHECK ───
ALTER TABLE table_floors DROP CONSTRAINT IF EXISTS table_floors_status_check;
ALTER TABLE table_floors
  ADD CONSTRAINT table_floors_status_check
  CHECK (status IN ('empty', 'reserved', 'occupied', 'merged', 'payment_pending', 'cleaning'));

-- ─── 3. Index on table_floors.reservation_id for FK performance ───
DROP INDEX IF EXISTS idx_table_floors_reservation;
CREATE INDEX IF NOT EXISTS idx_table_floors_reservation ON table_floors(reservation_id);

-- ─── 4. campaign_usage tracking ───
CREATE TABLE IF NOT EXISTS campaign_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  discount_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  discount_type TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_campaign_usage_order ON campaign_usage(order_id);
CREATE INDEX IF NOT EXISTS idx_campaign_usage_campaign ON campaign_usage(campaign_id);

-- ─── 5. inventory_status VIEW (computed stock health) ───
CREATE OR REPLACE VIEW inventory_status AS
SELECT
  i.id,
  i.name,
  i.unit,
  i.current_stock,
  i.theoretical_stock,
  i.critical_limit,
  i.average_cost_per_unit,
  i.purchase_price,
  i.cold_waste_percentage,
  i.supplier_id,
  i.updated_at,
  CASE
    WHEN i.current_stock <= 0 THEN 'out_of_stock'
    WHEN i.current_stock <= i.critical_limit THEN 'critical'
    ELSE 'normal'
  END AS status,
  CASE
    WHEN i.critical_limit > 0 THEN ROUND((i.current_stock / i.critical_limit) * 100, 1)
    ELSE 100.0
  END AS stock_ratio
FROM ingredients i;

-- ─── 6. current_stock VIEW (alias for compatibility) ───
CREATE OR REPLACE VIEW current_stock AS
SELECT * FROM ingredients;

-- ─── 7. Stock non-negative trigger ───
CREATE OR REPLACE FUNCTION prevent_negative_stock()
RETURNS trigger AS $$
BEGIN
  IF NEW.current_stock < 0 THEN
    NEW.current_stock := 0;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_negative_stock ON ingredients;
CREATE TRIGGER trg_prevent_negative_stock
  BEFORE UPDATE OF current_stock ON ingredients
  FOR EACH ROW
  EXECUTE FUNCTION prevent_negative_stock();
