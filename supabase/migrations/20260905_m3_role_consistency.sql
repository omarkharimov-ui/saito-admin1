-- =====================================================================
-- M3 — ROLE CONSISTENCY BACKFILL
-- Purpose: Sync staff.role TEXT with roles.name for existing records
--          before dropping staff.role column in M10.
-- Precondition: M2 verification passed (all staff have valid role_id)
-- =====================================================================

-- Step 1: Backfill staff.role from roles.name where mismatched or empty
UPDATE staff s
SET role = r.name
FROM roles r
WHERE r.id = s.role_id
  AND (s.role IS NULL OR s.role = '' OR s.role <> r.name);

-- Step 2: Verification - ensure zero mismatches remain
DO $$
DECLARE
  v_mismatch_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_mismatch_count
  FROM staff s
  LEFT JOIN roles r ON r.id = s.role_id
  WHERE s.role <> COALESCE(r.name, '');
  
  IF v_mismatch_count > 0 THEN
    RAISE EXCEPTION 'M3 VERIFICATION FAILED: % staff records still have mismatched role after backfill', v_mismatch_count;
  END IF;
  
  RAISE NOTICE 'M3: Verification passed - staff.role synced with roles.name';
END $$;
