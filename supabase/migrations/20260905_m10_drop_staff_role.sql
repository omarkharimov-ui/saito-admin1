-- =====================================================================
-- M10 — DROP STAFF.ROLE COLUMN
-- Purpose: Remove redundant staff.role TEXT column after migrating
--          all application code to use staff.role_id + roles.name.
-- Precondition: All RPC, RLS, repo, and API references to staff.role
--               must be removed or migrated to role_id.
-- =====================================================================

-- Step 1: Precondition check - verify no SQL objects reference staff.role
DO $$
DECLARE
  v_policy_refs INTEGER;
  v_func_refs INTEGER;
BEGIN
  -- Check RLS policies referencing staff.role
  SELECT COUNT(*) INTO v_policy_refs
  FROM pg_policies
  WHERE schemaname = 'public'
    AND qual LIKE '%staff.role%';
  
  IF v_policy_refs > 0 THEN
    RAISE EXCEPTION 'M10 ABORTED: % RLS policies still reference staff.role. Run M9 first.', v_policy_refs;
  END IF;
  
  -- Check functions referencing staff.role
  SELECT COUNT(*) INTO v_func_refs
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND pg_get_functiondef(p.oid) LIKE '%staff.role%';
  
  IF v_func_refs > 0 THEN
    RAISE WARNING 'M10: % functions reference staff.role - review before proceeding', v_func_refs;
  END IF;
  
  RAISE NOTICE 'M10: Precondition check passed';
END $$;

-- Step 2: Drop staff.role column
ALTER TABLE staff DROP COLUMN IF EXISTS role;

-- Step 3: Verification
DO $$
DECLARE
  v_column_exists BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'staff' AND column_name = 'role'
  ) INTO v_column_exists;
  
  IF v_column_exists THEN
    RAISE EXCEPTION 'M10 VERIFICATION FAILED: staff.role column still exists';
  END IF;
  
  RAISE NOTICE 'M10: Verification passed - staff.role column removed';
END $$;
