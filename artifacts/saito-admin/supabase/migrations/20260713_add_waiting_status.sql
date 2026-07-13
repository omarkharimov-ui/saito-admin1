-- ============================================================================
-- Add waiting status to table_floors for reservation arrival flow
-- ============================================================================

ALTER TABLE table_floors DROP CONSTRAINT IF EXISTS table_floors_status_check;
ALTER TABLE table_floors
  ADD CONSTRAINT table_floors_status_check
  CHECK (status IN ('empty', 'reserved', 'occupied', 'waiting'));

-- Backfill any invalid statuses to empty
UPDATE table_floors SET status = 'empty' WHERE status IS NULL OR status NOT IN ('empty', 'reserved', 'occupied', 'waiting');
