-- Phase 3: Permission SSOT Foundation Audit
-- Purpose: Verify permission matrix integrity and prepare for DB-driven authorization
-- Run this AFTER Phase 1 migrations (20260901_* files)

-- ============================================
-- STEP 1: Verify FK constraints exist
-- ============================================
DO $$
DECLARE
  fk_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO fk_count
  FROM information_schema.table_constraints tc
  WHERE tc.constraint_type = 'FOREIGN KEY'
    AND tc.table_name IN ('sessions', 'clock_events', 'staff')
    AND tc.constraint_name IN (
      'sessions_user_id_fkey',
      'clock_events_staff_id_fkey',
      'staff_role_id_fkey'
    );
  
  IF fk_count < 3 THEN
    RAISE WARNING 'Missing FK constraints: expected 3, found %', fk_count;
  ELSE
    RAISE NOTICE 'FK constraints verified: % found', fk_count;
  END IF;
END $$;

-- ============================================
-- STEP 2: Verify staff -> role mapping
-- ============================================
DO $$
DECLARE
  orphan_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO orphan_count FROM staff WHERE role_id IS NULL;
  
  IF orphan_count > 0 THEN
    RAISE EXCEPTION 'DATA ISSUE: % staff without role_id', orphan_count;
  END IF;
  
  RAISE NOTICE 'Staff role mapping: OK';
END $$;

-- ============================================
-- STEP 3: Verify session -> staff integrity
-- ============================================
DO $$
DECLARE
  orphan_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO orphan_count FROM sessions s
  WHERE NOT EXISTS (SELECT 1 FROM staff st WHERE st.id = s.user_id);
  
  IF orphan_count > 0 THEN
    RAISE EXCEPTION 'DATA ISSUE: % orphan sessions', orphan_count;
  END IF;
  
  RAISE NOTICE 'Session integrity: OK';
END $$;

-- ============================================
-- STEP 4: Verify role_permissions coverage
-- ============================================
DO $$
DECLARE
  role_count INTEGER;
  perm_count INTEGER;
  mapping_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO role_count FROM roles WHERE is_system = false;
  SELECT COUNT(*) INTO perm_count FROM permissions;
  SELECT COUNT(*) INTO mapping_count FROM role_permissions;
  
  RAISE NOTICE 'Roles: %, Permissions: %, Mappings: %', role_count, perm_count, mapping_count;
  
  IF mapping_count = 0 THEN
    RAISE WARNING 'No role_permissions mappings found';
  END IF;
END $$;

-- ============================================
-- STEP 5: Add missing indexes for auth performance
-- ============================================
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_staff_role_id ON staff(role_id);
CREATE INDEX IF NOT EXISTS idx_clock_events_staff_id ON clock_events(staff_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_staff_id ON audit_logs(staff_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_operation_logs_created_at ON operation_logs(created_at);

-- ============================================
-- STEP 6: Add permission category if missing
-- ============================================
ALTER TABLE permissions ADD COLUMN IF NOT EXISTS category TEXT;

-- ============================================
-- STEP 7: Verification queries (results in migration log)
-- ============================================
-- Staff with roles
-- SELECT s.id, s.name, r.name AS role FROM staff s JOIN roles r ON r.id = s.role_id WHERE s.is_active = true;

-- Active sessions
-- SELECT COUNT(*) AS active_sessions FROM sessions WHERE revoked_at IS NULL;

-- Role permission coverage
-- SELECT r.name AS role, COUNT(rp.permission_key) AS perms FROM roles r LEFT JOIN role_permissions rp ON rp.role_id = r.id GROUP BY r.name;

-- ============================================
-- AUDIT COMPLETE
-- ============================================
-- Next: Phase 3 requiresPermission() RPC implementation
-- and route migration from requireAuth(['admin']) to requirePermission()
