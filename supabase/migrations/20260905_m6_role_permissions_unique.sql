-- =====================================================================
-- M6 — ROLE PERMISSIONS UNIQUE CONSTRAINT
-- Purpose: Add UNIQUE(role_id, permission_key) to prevent duplicate
--          role-permission mappings.
-- Precondition: No duplicate (role_id, permission_key) pairs exist
-- =====================================================================

-- Step 1: Precondition check - verify no duplicates
DO $$
DECLARE
  v_duplicate_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_duplicate_count
  FROM role_permissions
  GROUP BY role_id, permission_key
  HAVING COUNT(*) > 1;

  IF v_duplicate_count > 0 THEN
    RAISE EXCEPTION 'M6 ABORTED: % duplicate role_permission mappings found', v_duplicate_count;
  END IF;
  
  RAISE NOTICE 'M6: Precondition check passed (0 duplicates)';
END $$;

-- Step 2: Add UNIQUE constraint
ALTER TABLE role_permissions
  ADD CONSTRAINT role_permissions_role_id_permission_key_key
  UNIQUE (role_id, permission_key);

-- Step 3: Verification
DO $$
DECLARE
  v_constraint_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_constraint_count
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
  WHERE tc.table_name = 'role_permissions'
    AND tc.constraint_type = 'UNIQUE'
    AND kcu.column_name = 'role_id';
  
  IF v_constraint_count < 1 THEN
    RAISE EXCEPTION 'M6 VERIFICATION FAILED: UNIQUE constraint not found on role_permissions';
  END IF;
  
  RAISE NOTICE 'M6: Verification passed - UNIQUE(role_id, permission_key) added';
END $$;
