-- ============================================================================
-- P8 RESERVATION CAPABILITY
-- FK constraints, status CHECK, audit table, data integrity
-- ============================================================================

-- ─── 0. Fix orphan reservation_ids before adding FK ───
UPDATE table_floors
SET reservation_id = NULL
WHERE reservation_id IS NOT NULL
  AND reservation_id NOT IN (SELECT id FROM reservations);

-- ─── 1. FK from table_floors.reservation_id → reservations.id ───
ALTER TABLE table_floors DROP CONSTRAINT IF EXISTS fk_table_floors_reservation;
ALTER TABLE table_floors
  ADD CONSTRAINT fk_table_floors_reservation
  FOREIGN KEY (reservation_id)
  REFERENCES reservations(id)
  ON DELETE SET NULL;

-- ─── 2. reservations.status CHECK constraint ───
ALTER TABLE reservations DROP CONSTRAINT IF EXISTS reservations_status_check;
ALTER TABLE reservations
  ADD CONSTRAINT reservations_status_check
  CHECK (status IN ('pending', 'confirmed', 'checked_in', 'completed', 'cancelled', 'no_show', 'archived'));

-- ─── 3. Created/updated timestamps for reservations ───
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

CREATE OR REPLACE FUNCTION update_reservations_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_reservations_updated_at ON reservations;
CREATE TRIGGER trg_reservations_updated_at
  BEFORE UPDATE ON reservations
  FOR EACH ROW
  EXECUTE FUNCTION update_reservations_updated_at();

-- ─── 4. Indexes for reservation queries ───
CREATE INDEX IF NOT EXISTS idx_reservations_date_status ON reservations(date, status);
CREATE INDEX IF NOT EXISTS idx_reservations_phone ON reservations(phone);
CREATE INDEX IF NOT EXISTS idx_reservations_table_number ON reservations(table_number);

-- ─── 5. audit_log table (shared across capabilities) ───
CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name TEXT NOT NULL,
  record_id TEXT,
  action TEXT NOT NULL,
  old_data JSONB,
  new_data JSONB,
  performed_by UUID,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_table_name ON audit_log(table_name);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_log_record_id ON audit_log(record_id);

-- ─── 6. kitchen_schedule table (if not exists) ───
CREATE TABLE IF NOT EXISTS kitchen_schedule (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id UUID REFERENCES reservations(id) ON DELETE CASCADE,
  table_number INTEGER,
  scheduled_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'started', 'completed', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kitchen_schedule_reservation ON kitchen_schedule(reservation_id);
CREATE INDEX IF NOT EXISTS idx_kitchen_schedule_status ON kitchen_schedule(status);
CREATE INDEX IF NOT EXISTS idx_kitchen_schedule_scheduled_at ON kitchen_schedule(scheduled_at);
