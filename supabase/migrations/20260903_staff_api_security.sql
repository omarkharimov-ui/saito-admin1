-- =====================================================================
-- SAITO ADMIN 1 — STAFF API SECURITY FIXES
-- Applied: 2026-08-27
-- Purpose: Fix critical security vulnerabilities in staff/auth APIs
-- =====================================================================

-- ---------------------------------------------------------------------
-- PART A — Drop plaintext PIN from admin_users (CRITICAL)
-- ---------------------------------------------------------------------
-- The admin_users table still stores plaintext PINs. This migration
-- drops the plaintext column and migrates existing data to hashed format.

-- Step 1: Migrate any remaining plaintext pins to hashed format
DO $$
DECLARE
  plain_count INTEGER;
  migrated_count INTEGER := 0;
BEGIN
  SELECT COUNT(*) INTO plain_count FROM admin_users WHERE pin IS NOT NULL AND pin_hash IS NULL;

  IF plain_count > 0 THEN
    RAISE NOTICE 'Migrating % plaintext PINs to hashed format...', plain_count;

    FOR rec IN
      SELECT id, pin FROM admin_users WHERE pin IS NOT NULL AND pin_hash IS NULL
    LOOP
      UPDATE admin_users
      SET pin_hash = crypt(rec.pin, gen_salt('bf', 10))
      WHERE id = rec.id;
      migrated_count := migrated_count + 1;
    END LOOP;

    RAISE NOTICE 'Migrated % plaintext PINs', migrated_count;
  ELSE
    RAISE NOTICE 'No plaintext PINs to migrate';
  END IF;
END $$;

-- Step 2: Drop plaintext PIN column
ALTER TABLE admin_users DROP COLUMN IF EXISTS pin;
DROP INDEX IF EXISTS admin_users_pin_key;

-- ---------------------------------------------------------------------
-- PART B — Add superadmin role if missing
-- ---------------------------------------------------------------------
INSERT INTO public.roles (name, is_system) VALUES ('superadmin', true)
ON CONFLICT (name) DO NOTHING;

-- ---------------------------------------------------------------------
-- PART C — Grant permissions to superadmin role
-- ---------------------------------------------------------------------
INSERT INTO public.role_permissions (role_id, permission_key)
SELECT r.id, p.key
  FROM roles r, permissions p
 WHERE r.name = 'superadmin'
   AND p.key NOT IN (
     SELECT rp.permission_key
       FROM role_permissions rp
       JOIN roles r2 ON r2.id = rp.role_id
      WHERE r2.name = 'superadmin'
   )
ON CONFLICT (role_id, permission_key) DO NOTHING;

-- ---------------------------------------------------------------------
-- PART D — Add indexes for auth performance
-- ---------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_sessions_revoked_at ON sessions(revoked_at) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_staff_is_active ON staff(is_active) WHERE is_active = true;
