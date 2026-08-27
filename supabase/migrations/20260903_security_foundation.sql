-- =====================================================================
-- SAITO ADMIN 1 — SECURITY FOUNDATION
-- Purpose: Establish canonical permission check and superadmin role.
--          Does NOT touch UI. Does NOT drop existing data.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) has_permission RPC
-- ---------------------------------------------------------------------
-- Canonical authorization source:
--   staff.id -> staff.role_id -> roles.id -> role_permissions -> permissions.key
--
-- Rules:
--   - staff must exist
--   - staff.is_active = true
--   - staff.role_id IS NOT NULL
--   - role must exist
--   - permission_key must exist in role_permissions
--
-- No legacy staff.role TEXT bypass.

CREATE OR REPLACE FUNCTION public.has_permission(
  p_staff_id uuid,
  p_permission text
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM staff s
      JOIN roles r ON r.id = s.role_id
      JOIN role_permissions rp ON rp.role_id = r.id
     WHERE s.id = p_staff_id
       AND s.is_active = true
       AND s.role_id IS NOT NULL
       AND rp.permission_key = p_permission
  );
$$;

GRANT EXECUTE ON FUNCTION public.has_permission(uuid, text)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 2) superadmin role (system role) if missing
-- ---------------------------------------------------------------------
INSERT INTO public.roles (name, is_system)
VALUES ('superadmin', true)
ON CONFLICT (name) DO NOTHING;

-- ---------------------------------------------------------------------
-- 3) Grant all existing permissions to superadmin
-- ---------------------------------------------------------------------
INSERT INTO public.role_permissions (role_id, permission_key)
SELECT r.id, p.key
  FROM public.roles r
  CROSS JOIN public.permissions p
 WHERE r.name = 'superadmin'
   AND NOT EXISTS (
     SELECT 1
       FROM public.role_permissions rp
      WHERE rp.role_id = r.id
        AND rp.permission_key = p.key
   )
ON CONFLICT (role_id, permission_key) DO NOTHING;

-- ---------------------------------------------------------------------
-- 4) Verification
-- ---------------------------------------------------------------------
DO $$
DECLARE
  v_superadmin_exists boolean;
  v_superadmin_perms integer;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.roles WHERE name = 'superadmin'
  ) INTO v_superadmin_exists;

  SELECT COUNT(*)
    INTO v_superadmin_perms
    FROM public.role_permissions rp
    JOIN public.roles r ON r.id = rp.role_id
   WHERE r.name = 'superadmin';

  RAISE NOTICE 'Security foundation: superadmin_exists=%, superadmin_permissions=%',
    v_superadmin_exists, v_superadmin_perms;
END $$;
