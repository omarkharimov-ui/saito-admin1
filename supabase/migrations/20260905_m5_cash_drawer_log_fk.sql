-- =====================================================================
-- M5 — CASH DRAWER LOG IDENTITY FK FIX
-- Purpose: Change cash_drawer_log.created_by from auth.users(id)
--          to staff(id) to match canonical identity model.
-- Precondition: All created_by must be NULL or valid staff.id
-- Note: cash_drawer_logs (plural) is unused and has 0 rows.
--       It will be reviewed separately for cleanup.
-- =====================================================================

-- Step 1: Precondition check - verify no orphaned actor references
DO $$
DECLARE
  v_invalid_created_by INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_invalid_created_by
  FROM cash_drawer_log
  WHERE created_by IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM staff st WHERE st.id = created_by);

  IF v_invalid_created_by > 0 THEN
    RAISE EXCEPTION 'M5 ABORTED: % invalid created_by references in cash_drawer_log',
      v_invalid_created_by;
  END IF;
  
  RAISE NOTICE 'M5: Precondition check passed (0 invalid actor references)';
END $$;

-- Step 2: Drop old FK
ALTER TABLE cash_drawer_log
  DROP CONSTRAINT IF EXISTS cash_drawer_log_created_by_fkey;

-- Step 3: Add new FK referencing staff(id)
ALTER TABLE cash_drawer_log
  ADD CONSTRAINT cash_drawer_log_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES staff(id) ON DELETE SET NULL;

-- Step 4: Add index for created_by if not exists
CREATE INDEX IF NOT EXISTS idx_cash_drawer_log_created_by
  ON cash_drawer_log(created_by);

-- Step 5: Verification
DO $$
DECLARE
  v_constraint_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_constraint_count
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
  WHERE tc.table_name = 'cash_drawer_log'
    AND tc.constraint_type = 'FOREIGN KEY'
    AND kcu.column_name = 'created_by';
  
  IF v_constraint_count < 1 THEN
    RAISE EXCEPTION 'M5 VERIFICATION FAILED: Expected 1 staff FK constraint, found %', v_constraint_count;
  END IF;
  
  RAISE NOTICE 'M5: Verification passed - cash_drawer_log.created_by FK updated';
END $$;
