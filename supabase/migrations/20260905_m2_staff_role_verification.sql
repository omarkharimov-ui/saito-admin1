-- =====================================================================
-- M2 — STAFF ROLE VERIFICATION / BACKFILL CHECK
-- Purpose: Verify all staff have valid role_id and sync staff.role TEXT
--          with roles.name before dropping staff.role column later.
-- =====================================================================

-- Step 1: Verify no NULL role_ids
DO $$
DECLARE
  v_null_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_null_count FROM staff WHERE role_id IS NULL;
  IF v_null_count > 0 THEN
    RAISE EXCEPTION 'M2 ABORTED: % staff records have NULL role_id', v_null_count;
  END IF;
  RAISE NOTICE 'M2: NULL role_id check passed (0 NULLs)';
END $$;

-- Step 2: Verify all role_ids reference valid roles
DO $$
DECLARE
  v_invalid_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_invalid_count
  FROM staff s
  WHERE NOT EXISTS (SELECT 1 FROM roles r WHERE r.id = s.role_id);
  
  IF v_invalid_count > 0 THEN
    RAISE EXCEPTION 'M2 ABORTED: % staff records have invalid role_id', v_invalid_count;
  END IF;
  RAISE NOTICE 'M2: Invalid role_id check passed (0 invalid)';
END $$;

-- Step 3: Backfill staff.role TEXT from roles.name where mismatched
-- This ensures consistency before dropping staff.role column in M10
UPDATE staff s
SET role = r.name
FROM roles r
WHERE r.id = s.role_id
  AND (s.role IS NULL OR s.role = '' OR s.role <> r.name);

-- Step 4: Verification - ensure zero mismatches remain
DO $$
DECLARE
  v_mismatch_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_mismatch_count
  FROM staff s
  LEFT JOIN roles r ON r.id = s.role_id
  WHERE s.role <> COALESCE(r.name, '');
  
  IF v_mismatch_count > 0 THEN
    RAISE EXCEPTION 'M2 ABORTED: % staff records still have mismatched role after backfill', v_mismatch_count;
  END IF;
  
  RAISE NOTICE 'M2: Role consistency check passed (0 mismatches)';
END $$;

-- Step 5: Verify superadmin role exists
DO $$
DECLARE
  v_superadmin_exists BOOLEAN;
BEGIN
  SELECT EXISTS (SELECT 1 FROM roles WHERE name = 'superadmin') INTO v_superadmin_exists;
  IF NOT v_superadmin_exists THEN
    RAISE EXCEPTION 'M2 ABORTED: superadmin role does not exist';
  END IF;
  RAISE NOTICE 'M2: superadmin role exists';
END $$;
