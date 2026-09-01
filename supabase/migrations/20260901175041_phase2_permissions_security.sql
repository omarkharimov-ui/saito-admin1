-- =============================================
-- PHASE 2: Toast Gap Closure - Security & Permissions
-- =============================================

-- =============================================
-- 1. JOB-BASED PERMISSION FILTER
-- =============================================

-- Add active_role_id to shifts to track which role staff clocked in as
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS active_role_id UUID;

CREATE INDEX IF NOT EXISTS idx_shifts_active_role ON shifts(active_role_id);

-- =============================================
-- 2. BREAK ADHERENCE ENHANCEMENT
-- =============================================

-- Enhance existing break_rules table with role-based filtering
ALTER TABLE break_rules ADD COLUMN IF NOT EXISTS role_id UUID;
ALTER TABLE break_rules ADD COLUMN IF NOT EXISTS min_hours_worked DECIMAL(5,2);
ALTER TABLE break_rules ADD COLUMN IF NOT EXISTS max_hours_worked DECIMAL(5,2);

-- Create unique constraint for role-based break rules
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'break_rules_role_break_type_key') THEN
    ALTER TABLE break_rules ADD CONSTRAINT break_rules_role_break_type_key UNIQUE (role_id, break_type);
  END IF;
END $$;

-- Migrate existing data: create role-based entries from name-based rules
INSERT INTO break_rules (name, role_id, break_type, min_hours_worked, break_duration_minutes, is_paid, is_active, work_duration_minutes)
SELECT 'Meal Break - ' || r.name, r.id, 'meal', 5, 30, false, true, 300 FROM roles r WHERE r.name IN ('waiter', 'kitchen', 'bartender', 'cashier')
ON CONFLICT (role_id, break_type) DO NOTHING;

INSERT INTO break_rules (name, role_id, break_type, min_hours_worked, break_duration_minutes, is_paid, is_active, work_duration_minutes)
SELECT 'Rest Break - ' || r.name, r.id, 'rest', 2, 15, true, true, 120 FROM roles r WHERE r.name IN ('waiter', 'kitchen', 'bartender', 'cashier')
ON CONFLICT (role_id, break_type) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_break_rules_role ON break_rules(role_id);

-- =============================================
-- 3. MULTI-LOCATION PERMISSION OVERRIDES
-- =============================================

-- Location-specific permission overrides
CREATE TABLE IF NOT EXISTS location_permission_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id UUID NOT NULL,
  permission_id UUID NOT NULL,
  is_granted BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(location_id, permission_id)
);

CREATE INDEX IF NOT EXISTS idx_location_permission_overrides_location ON location_permission_overrides(location_id);
CREATE INDEX IF NOT EXISTS idx_location_permission_overrides_permission ON location_permission_overrides(permission_id);

-- =============================================
-- 4. EFFECTIVE PERMISSIONS RPC (Job-Based)
-- =============================================

CREATE OR REPLACE FUNCTION get_effective_permissions_v2(
  p_staff_id UUID,
  p_location_id UUID DEFAULT NULL,
  p_active_role_id UUID DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  WITH staff_base_perms AS (
    SELECT DISTINCT rp.permission_id
    FROM staff s
    JOIN roles r ON r.id = s.role_id
    JOIN role_permissions rp ON rp.role_id = r.id
    WHERE s.id = p_staff_id AND rp.is_granted = true
    UNION
    SELECT DISTINCT spo.permission_id
    FROM staff_permission_overrides spo
    WHERE spo.staff_id = p_staff_id AND spo.is_granted = true
  ),
  active_role_perms AS (
    SELECT DISTINCT rp.permission_id
    FROM roles r
    JOIN role_permissions rp ON rp.role_id = r.id
    WHERE r.id = p_active_role_id AND rp.is_granted = true
  ),
  location_overrides AS (
    SELECT DISTINCT permission_id, is_granted
    FROM location_permission_overrides
    WHERE location_id = p_location_id
  ),
  effective AS (
    SELECT DISTINCT p.id, p.code, p.name, p.key
    FROM permissions p
    WHERE p.id IN (
      SELECT permission_id FROM active_role_perms
      UNION
      SELECT permission_id FROM staff_base_perms
      WHERE permission_id NOT IN (SELECT permission_id FROM active_role_perms)
    )
    AND p.id NOT IN (
      SELECT permission_id FROM location_overrides WHERE is_granted = false
    )
  )
  SELECT json_agg(e.*) INTO result FROM effective e;

  RETURN COALESCE(result, '[]'::json);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- 5. UPDATE EXISTING PERMISSION CHECK RPC
-- =============================================

CREATE OR REPLACE FUNCTION has_permission_v2(
  p_staff_id UUID,
  p_permission_code VARCHAR,
  p_active_role_id UUID DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
  v_has_permission BOOLEAN := false;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM get_effective_permissions_v2(
      p_staff_id,
      NULL,
      p_active_role_id
    ) ep
    WHERE ep.code = p_permission_code
  ) INTO v_has_permission;

  RETURN v_has_permission;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- GRANTS
-- =============================================

GRANT EXECUTE ON FUNCTION get_effective_permissions_v2 TO authenticated;
GRANT EXECUTE ON FUNCTION has_permission_v2 TO authenticated;
