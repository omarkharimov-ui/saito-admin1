-- =====================================================================
-- M11 — SETTINGS PASSWORD MIGRATION TO RBAC
-- Purpose: Replace plaintext password authentication with RBAC
--          permissions for kitchen and settings access.
-- Precondition: kitchen-auth and change-settings-password routes
--               must be updated to use permission checks.
-- =====================================================================

-- Step 1: Create RBAC permissions for kitchen and settings access
INSERT INTO public.permissions (key, description, category)
VALUES 
  ('kitchen.auth', 'Kitchen terminal access', 'kitchen'),
  ('settings.admin', 'Admin settings management', 'settings')
ON CONFLICT (key) DO NOTHING;

-- Step 2: Assign kitchen.auth to kitchen and superadmin roles
INSERT INTO public.role_permissions (role_id, permission_key)
SELECT r.id, 'kitchen.auth'
FROM roles r
WHERE r.name IN ('kitchen', 'superadmin')
  AND NOT EXISTS (
    SELECT 1 FROM role_permissions rp 
    WHERE rp.role_id = r.id AND rp.permission_key = 'kitchen.auth'
  );

-- Step 3: Assign settings.admin to admin and superadmin roles
INSERT INTO public.role_permissions (role_id, permission_key)
SELECT r.id, 'settings.admin'
FROM roles r
WHERE r.name IN ('admin', 'superadmin')
  AND NOT EXISTS (
    SELECT 1 FROM role_permissions rp 
    WHERE rp.role_id = r.id AND rp.permission_key = 'settings.admin'
  );

-- Step 4: Verification
DO $$
DECLARE
  v_kitchen_auth_count INTEGER;
  v_settings_admin_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_kitchen_auth_count
  FROM role_permissions rp
  JOIN roles r ON r.id = rp.role_id
  WHERE rp.permission_key = 'kitchen.auth' AND r.name = 'kitchen';
  
  SELECT COUNT(*) INTO v_settings_admin_count
  FROM role_permissions rp
  JOIN roles r ON r.id = rp.role_id
  WHERE rp.permission_key = 'settings.admin' AND r.name IN ('admin', 'superadmin');
  
  IF v_kitchen_auth_count < 1 THEN
    RAISE WARNING 'M11: kitchen.auth permission not assigned to kitchen role';
  ELSE
    RAISE NOTICE 'M11: kitchen.auth assigned to kitchen role';
  END IF;
  
  IF v_settings_admin_count < 2 THEN
    RAISE WARNING 'M11: settings.admin permission not assigned to all admin roles';
  ELSE
    RAISE NOTICE 'M11: settings.admin assigned to admin and superadmin roles';
  END IF;
END $$;

-- NOTE: Column drops (admin_password, superadmin_password, kitchen_password)
-- will be handled in a follow-up migration after verifying the new
-- permission-based auth flows work correctly in production.
