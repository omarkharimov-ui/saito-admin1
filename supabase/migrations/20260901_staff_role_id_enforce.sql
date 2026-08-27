-- Phase 1: Staff role_id canonical enforcement
-- Data already backfilled: all 3 staff have valid role_id
-- This migration adds NOT NULL constraint and validates integrity

-- Step 1: Verify all active staff have role_id
DO $$
DECLARE null_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO null_count FROM staff WHERE is_active = true AND role_id IS NULL;
  
  IF null_count > 0 THEN
    RAISE EXCEPTION 'Phase 1 ABORTED: % active staff have NULL role_id', null_count;
  END IF;
  
  RAISE NOTICE 'Phase 1: All active staff have role_id assigned';
END $$;

-- Step 2: Verify all role_id values reference valid roles
DO $$
DECLAREinvalid_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO invalid_count FROM staff s
  WHERE s.role_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM roles r WHERE r.id = s.role_id);
  
  IF invalid_count > 0 THEN
    RAISE EXCEPTION 'Phase 1 ABORTED: % staff have invalid role_id references', invalid_count;
  END IF;
  
  RAISE NOTICE 'Phase 1: All role_id values reference valid roles';
END $$;

-- Step 3: Add NOT NULL constraint
ALTER TABLE staff ALTER COLUMN role_id SET NOT NULL;

-- Step 4: Add FK constraint
ALTER TABLE staff ADD CONSTRAINT staff_role_id_fkey
  FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE RESTRICT;

-- Step 5: Add index
CREATE INDEX IF NOT EXISTS idx_staff_role_id ON staff(role_id);
