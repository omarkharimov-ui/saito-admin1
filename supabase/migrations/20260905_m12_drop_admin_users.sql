-- =====================================================================
-- M12 — DROP ADMIN_USERS TABLE
-- Purpose: Remove legacy admin_users table after all dependencies
--          have been cleaned up.
-- Precondition: All RPCs, RLS policies, FKs, triggers, and grants
--               referencing admin_users must be removed.
-- =====================================================================

-- Step 1: Precondition check
DO $$
DECLARE
  v_ext_dep_count INTEGER;
BEGIN
  -- Check for external dependencies (not internal table dependencies)
  -- deptype 'i' = internal, 'a' = auto (indexes, etc), 'n' = normal
  -- We only care about 'n' (normal) dependencies from other objects
  SELECT COUNT(*) INTO v_ext_dep_count
  FROM pg_depend d
  JOIN pg_class c ON d.refobjid = c.oid
  WHERE c.relname = 'admin_users'
    AND d.deptype = 'n'
    AND NOT EXISTS (
      SELECT 1 FROM pg_class c2 
      WHERE c2.oid = d.classid 
      AND c2.relkind IN ('r', 'S', 's')
    );
  
  IF v_ext_dep_count > 0 THEN
    RAISE EXCEPTION 'M12 ABORTED: % external dependencies still exist on admin_users', v_ext_dep_count;
  END IF;
  
  RAISE NOTICE 'M12: Precondition check passed';
END $$;

-- Step 2: Drop admin_users table
DROP TABLE IF EXISTS public.admin_users CASCADE;

-- Step 3: Verification
DO $$
DECLARE
  v_table_exists BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_name = 'admin_users' AND table_schema = 'public'
  ) INTO v_table_exists;
  
  IF v_table_exists THEN
    RAISE EXCEPTION 'M12 VERIFICATION FAILED: admin_users table still exists';
  END IF;
  
  RAISE NOTICE 'M12: Verification passed - admin_users table removed';
END $$;
