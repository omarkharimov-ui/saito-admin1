-- ============================================================================
-- FIX 4/8: P11 — Add inventory_logs extra columns
-- ============================================================================
ALTER TABLE inventory_logs ADD COLUMN IF NOT EXISTS reference_type TEXT;
ALTER TABLE inventory_logs ADD COLUMN IF NOT EXISTS reference_id UUID;
ALTER TABLE inventory_logs ADD COLUMN IF NOT EXISTS unit_cost NUMERIC(12,4);
ALTER TABLE inventory_logs ADD COLUMN IF NOT EXISTS notes TEXT;

CREATE INDEX IF NOT EXISTS idx_inventory_logs_type ON inventory_logs(type);
CREATE INDEX IF NOT EXISTS idx_inventory_logs_ingredient ON inventory_logs(ingredient_id);
CREATE INDEX IF NOT EXISTS idx_inventory_logs_reference ON inventory_logs(reference_type, reference_id)
  WHERE reference_type IS NOT NULL;
