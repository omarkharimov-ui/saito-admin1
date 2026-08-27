-- =====================================================================
-- SAITO ADMIN 1 — PERMISSION SSOT FIX
-- Applied: 2026-08-27
-- Purpose: Fix has_permission RPC to use role_id instead of legacy
--          free-text role column, and add superadmin role support
-- =====================================================================

-- Drop and recreate has_permission with proper role_id-based check
CREATE OR REPLACE FUNCTION public.has_permission(p_staff_id uuid, p_permission text)
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
       AND rp.permission_key = p_permission
  );
$$;

GRANT EXECUTE ON FUNCTION public.has_permission(uuid, text) TO authenticated, service_role;
