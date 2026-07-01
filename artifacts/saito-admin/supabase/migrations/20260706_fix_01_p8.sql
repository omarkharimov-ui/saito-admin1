-- ============================================================================
-- FIX 1/8: P8 — Reservations + Table Floors + Audit Logs
-- ============================================================================

-- 1a: Add missing reservation status values to CHECK constraint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.check_constraints cc ON tc.constraint_name = cc.constraint_name
    WHERE tc.table_name = 'reservations'
      AND cc.check_clause LIKE '%checked_in%'
  ) THEN
    ALTER TABLE reservations DROP CONSTRAINT IF EXISTS reservations_status_check;
    ALTER TABLE reservations ADD CONSTRAINT reservations_status_check
      CHECK (status IN ('pending','confirmed','checked_in','completed','cancelled','no_show','expired','archived'));
  END IF;
END $$;

-- 1b: Add FK table_floors.reservation_id → reservations.id
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'table_floors' AND column_name = 'reservation_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'table_floors' AND constraint_type = 'FOREIGN KEY'
      AND constraint_name LIKE '%reservation%'
  ) THEN
    ALTER TABLE table_floors ADD CONSTRAINT fk_table_floors_reservation
      FOREIGN KEY (reservation_id) REFERENCES reservations(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 1c: Fix table_floors.status CHECK — add all statuses used by frontend
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.check_constraints cc ON tc.constraint_name = cc.constraint_name
    WHERE tc.table_name = 'table_floors'
      AND cc.check_clause LIKE '%payment_pending%'
  ) THEN
    ALTER TABLE table_floors DROP CONSTRAINT IF EXISTS table_floors_status_check;
    ALTER TABLE table_floors ADD CONSTRAINT table_floors_status_check
      CHECK (status IN ('empty','occupied','reserved','paid','payment_pending','cleaning','merged','cancelled'));
  END IF;
END $$;

-- 1d: Fix audit_logs — add all columns from P8 (table exists but columns may be missing)
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS table_name TEXT;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS record_id TEXT;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS action TEXT NOT NULL DEFAULT 'unknown';
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS old_data JSONB;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS new_data JSONB;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS performed_by UUID;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS ip_address TEXT;

CREATE INDEX IF NOT EXISTS idx_audit_logs_table_name ON audit_logs(table_name);
CREATE INDEX IF NOT EXISTS idx_audit_logs_record_id ON audit_logs(record_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS audit_logs_select ON audit_logs;
CREATE POLICY audit_logs_select ON audit_logs FOR SELECT USING (true);
DROP POLICY IF EXISTS audit_logs_insert ON audit_logs;
CREATE POLICY audit_logs_insert ON audit_logs FOR INSERT WITH CHECK (true);
