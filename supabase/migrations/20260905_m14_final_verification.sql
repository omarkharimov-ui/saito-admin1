-- =====================================================================
-- M14 — FINAL VERIFICATION
-- Purpose: Verify all migrations completed successfully and the
--          canonical identity/RBAC model is correctly established.
-- =====================================================================

-- =========================================================================
-- 1. IDENTITY VERIFICATION
-- =========================================================================

-- 1.1 All sessions reference valid staff
SELECT 'sessions_invalid' AS check_name, COUNT(*) AS issues
FROM sessions s
WHERE NOT EXISTS (SELECT 1 FROM staff st WHERE st.id = s.user_id)
UNION ALL
-- 1.2 All staff have valid role_id
SELECT 'staff_invalid_role_id', COUNT(*)
FROM staff
WHERE role_id IS NULL
   OR NOT EXISTS (SELECT 1 FROM roles r WHERE r.id = role_id)
UNION ALL
-- 1.3 No orphan role_permissions
SELECT 'role_permissions_orphan', COUNT(*)
FROM role_permissions rp
WHERE NOT EXISTS (SELECT 1 FROM permissions p WHERE p.key = rp.permission_key)
UNION ALL
-- 1.4 No duplicate role_permissions
SELECT 'role_permissions_duplicate', COUNT(*)
FROM role_permissions
GROUP BY role_id, permission_key
HAVING COUNT(*) > 1
UNION ALL
-- 1.5 Verify staff.role column dropped (if M10 applied)
SELECT 'staff_role_column_exists', COUNT(*)
FROM information_schema.columns
WHERE table_name = 'staff' AND column_name = 'role'
UNION ALL
-- 1.6 Verify admin_users table dropped (if M12 applied)
SELECT 'admin_users_table_exists', COUNT(*)
FROM information_schema.tables
WHERE table_name = 'admin_users' AND table_schema = 'public'
UNION ALL
-- 1.7 Verify legacy functions dropped (if M8 applied)
SELECT 'legacy_functions_remaining', COUNT(*)
FROM pg_proc
WHERE proname IN ('current_admin_role', 'current_admin_role_by_email', 'effective_admin_role', 'is_admin_staff', 'is_superadmin', 'is_kitchen_staff')
  AND pronamespace = 'public'::regnamespace
UNION ALL
-- 1.8 Verify cash_drawer_sessions FKs reference staff
SELECT 'cash_drawer_sessions_bad_fk', COUNT(*)
FROM cash_drawer_sessions cs
WHERE opened_by IS NOT NULL AND NOT EXISTS (SELECT 1 FROM staff st WHERE st.id = cs.opened_by)
   OR closed_by IS NOT NULL AND NOT EXISTS (SELECT 1 FROM staff st WHERE st.id = cs.closed_by)
UNION ALL
-- 1.9 Verify cash_drawer_log FKs reference staff
SELECT 'cash_drawer_log_bad_fk', COUNT(*)
FROM cash_drawer_log cl
WHERE created_by IS NOT NULL AND NOT EXISTS (SELECT 1 FROM staff st WHERE st.id = cl.created_by)
UNION ALL
-- 1.10 Verify no anon grants on sensitive tables
SELECT 'anon_grants_sensitive', COUNT(*)
FROM information_schema.table_privileges
WHERE table_name IN ('staff', 'sessions', 'admin_users', 'cash_drawer_sessions', 'cash_drawer_log', 'clock_events', 'shifts', 'settings')
  AND grantee = 'anon';

-- =========================================================================
-- 2. RBAC VERIFICATION
-- =========================================================================

-- 2.1 Superadmin role exists
SELECT 'superadmin_role_exists' AS check_name, COUNT(*) AS issues
FROM roles WHERE name = 'superadmin'
UNION ALL
-- 2.2 Superadmin has all permissions
SELECT 'superadmin_missing_perms', COUNT(*)
FROM permissions p
WHERE NOT EXISTS (
  SELECT 1 FROM role_permissions rp
  JOIN roles r ON r.id = rp.role_id
  WHERE rp.permission_key = p.key AND r.name = 'superadmin'
)
UNION ALL
-- 2.3 New RBAC permissions exist
SELECT 'missing_rbac_permissions', COUNT(*)
FROM (VALUES ('kitchen.auth'), ('settings.admin')) AS expected(key)
WHERE NOT EXISTS (SELECT 1 FROM permissions p WHERE p.key = expected.key);

-- =========================================================================
-- 3. SECURITY VERIFICATION
-- =========================================================================

-- 3.1 No MD5 in verify_manager_pin
SELECT 'md5_in_verify_manager_pin', COUNT(*)
FROM pg_proc
WHERE proname = 'verify_manager_pin'
  AND pg_get_functiondef(oid) LIKE '%md5%'
UNION ALL
-- 3.2 No auth.uid() policies remaining
SELECT 'auth_uid_policies_remaining', COUNT(*)
FROM pg_policies
WHERE qual LIKE '%auth.uid()%'
  AND schemaname = 'public'
UNION ALL
-- 3.3 No legacy admin functions remaining
SELECT 'legacy_admin_functions_remaining', COUNT(*)
FROM pg_proc
WHERE proname IN ('current_admin_role', 'effective_admin_role', 'is_admin_staff', 'is_superadmin', 'is_kitchen_staff')
  AND pronamespace = 'public'::regnamespace;

-- =========================================================================
-- 4. SESSION SECURITY
-- =========================================================================

-- 4.1 Disabled staff should not have active sessions (informational)
SELECT 'disabled_staff_with_sessions' AS check_name, COUNT(*) AS issues
FROM sessions s
JOIN staff st ON st.id = s.user_id
WHERE st.is_active = false
  AND s.revoked_at IS NULL
  AND s.expires_at > now();

-- =========================================================================
-- 5. CASH DRAWER IDENTITY
-- =========================================================================

-- 5.1 Verify cash_drawer_sessions FKs
SELECT 
  'cash_drawer_sessions_fk_opened_by' AS constraint_name,
  COUNT(*) AS invalid_count
FROM cash_drawer_sessions
WHERE opened_by IS NOT NULL 
  AND NOT EXISTS (SELECT 1 FROM staff st WHERE st.id = opened_by)
UNION ALL
SELECT 
  'cash_drawer_sessions_fk_closed_by',
  COUNT(*)
FROM cash_drawer_sessions
WHERE closed_by IS NOT NULL 
  AND NOT EXISTS (SELECT 1 FROM staff st WHERE st.id = closed_by)
UNION ALL
-- 5.2 Verify cash_drawer_log FK
SELECT 
  'cash_drawer_log_fk_created_by',
  COUNT(*)
FROM cash_drawer_log
WHERE created_by IS NOT NULL 
  AND NOT EXISTS (SELECT 1 FROM staff st WHERE st.id = created_by);
