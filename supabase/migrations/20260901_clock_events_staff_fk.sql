-- Phase 1: Fix clock_events FK to reference staff(id)
-- Forensic result: 0 existing rows, safe to modify FK

-- Step 1: Verify no existing data with invalid references
DO $$
DECLARE invalid_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO invalid_count FROM clock_events ce
  WHERE NOT EXISTS (SELECT 1 FROM staff st WHERE st.id = ce.staff_id);
  
  IF invalid_count > 0 THEN
    RAISE EXCEPTION 'Phase 1 ABORTED: % clock_events reference non-existent staff IDs', invalid_count;
  END IF;
END $$;

-- Step 2: Drop old FK if exists
ALTER TABLE clock_events DROP CONSTRAINT IF EXISTS clock_events_staff_id_fkey;

-- Step 3: Add new FK (RESTRICT - preserve historical clock records)
-- Staff cannot be hard-deleted if clock events exist
ALTER TABLE clock_events ADD CONSTRAINT clock_events_staff_id_fkey
  FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE RESTRICT;

-- Step 4: Add index
CREATE INDEX IF NOT EXISTS idx_clock_events_staff_id ON clock_events(staff_id);
