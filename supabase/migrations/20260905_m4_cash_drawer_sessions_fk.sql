-- =====================================================================
-- M4 — CASH DRAWER SESSIONS IDENTITY FK FIX
-- Purpose: Change cash_drawer_sessions.opened_by/closed_by from
--          auth.users(id) to staff(id) to match canonical identity model.
-- Precondition: All opened_by/closed_by must be NULL or valid staff.id
-- =====================================================================

-- Step 1: Precondition check - verify no orphaned actor references
DO $$
DECLARE
  v_invalid_opened_by INTEGER;
  v_invalid_closed_by INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_invalid_opened_by
  FROM cash_drawer_sessions
  WHERE opened_by IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM staff st WHERE st.id = opened_by);

  SELECT COUNT(*) INTO v_invalid_closed_by
  FROM cash_drawer_sessions
  WHERE closed_by IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM staff st WHERE st.id = closed_by);

  IF v_invalid_opened_by > 0 OR v_invalid_closed_by > 0 THEN
    RAISE EXCEPTION 'M4 ABORTED: % invalid opened_by, % invalid closed_by references',
      v_invalid_opened_by, v_invalid_closed_by;
  END IF;
  
  RAISE NOTICE 'M4: Precondition check passed (0 invalid actor references)';
END $$;

-- Step 2: Drop old FKs
ALTER TABLE cash_drawer_sessions
  DROP CONSTRAINT IF EXISTS cash_drawer_sessions_opened_by_fkey;

ALTER TABLE cash_drawer_sessions
  DROP CONSTRAINT IF EXISTS cash_drawer_sessions_closed_by_fkey;

-- Step 3: Add new FKs referencing staff(id)
ALTER TABLE cash_drawer_sessions
  ADD CONSTRAINT cash_drawer_sessions_opened_by_fkey
  FOREIGN KEY (opened_by) REFERENCES staff(id) ON DELETE SET NULL;

ALTER TABLE cash_drawer_sessions
  ADD CONSTRAINT cash_drawer_sessions_closed_by_fkey
  FOREIGN KEY (closed_by) REFERENCES staff(id) ON DELETE SET NULL;

-- Step 4: Add index for opened_by if not exists
CREATE INDEX IF NOT EXISTS idx_cash_drawer_sessions_opened_by
  ON cash_drawer_sessions(opened_by);

-- Step 5: Verification
DO $$
DECLARE
  v_constraint_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_constraint_count
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
  WHERE tc.table_name = 'cash_drawer_sessions'
    AND tc.constraint_type = 'FOREIGN KEY'
    AND kcu.column_name IN ('opened_by', 'closed_by');
  
  IF v_constraint_count < 2 THEN
    RAISE EXCEPTION 'M4 VERIFICATION FAILED: Expected 2 staff FK constraints, found %', v_constraint_count;
  END IF;
  
  RAISE NOTICE 'M4: Verification passed - cash_drawer_sessions FKs updated';
END $$;
