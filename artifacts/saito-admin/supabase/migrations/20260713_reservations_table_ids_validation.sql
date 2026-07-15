-- ============================================================================
-- Add validation for reservations.table_ids JSONB column
-- ============================================================================

-- Ensure table_ids is always an array when present
-- This migration adds a check constraint to validate JSONB structure

ALTER TABLE reservations DROP CONSTRAINT IF EXISTS reservations_table_ids_check;

ALTER TABLE reservations
  ADD CONSTRAINT reservations_table_ids_check
  CHECK (
    table_ids IS NULL 
    OR 
    jsonb_typeof(table_ids) = 'array'
  );

-- Backfill any invalid table_ids to NULL
UPDATE reservations 
SET table_ids = NULL 
WHERE table_ids IS NOT NULL AND jsonb_typeof(table_ids) != 'array';

-- Add index for better performance on table_ids queries
CREATE INDEX IF NOT EXISTS idx_reservations_table_ids ON reservations USING GIN (table_ids);
