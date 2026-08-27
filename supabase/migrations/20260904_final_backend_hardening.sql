-- FINAL BACKEND HARDENING: canonical staff identity, FK integrity, orphan protection
-- This migration MUST be applied after all previous migrations.

BEGIN;

-- 1. Migrate admin_users to staff (canonical identity)
-- Only migrate if the ID does not already exist in staff
INSERT INTO staff (id, name, role, role_id, pin_hash, is_active, created_at)
SELECT
  au.id,
  COALESCE(NULLIF(au.role, ''), 'Admin') AS name,
  au.role,
  r.id AS role_id,
  au.pin_hash,
  au.is_active,
  au.created_at
FROM admin_users au
LEFT JOIN roles r ON r.name = au.role
WHERE NOT EXISTS (SELECT 1 FROM staff s WHERE s.id = au.id)
  AND au.pin_hash IS NOT NULL;

-- 2. Add FK constraint on shifts.staff_id if not exists
-- This prevents future orphan shifts when staff is deleted
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_name = 'shifts'
      AND kcu.column_name = 'staff_id'
  ) THEN
    ALTER TABLE public.shifts
      ADD CONSTRAINT shifts_staff_id_fkey
      FOREIGN KEY (staff_id) REFERENCES public.staff(id)
      ON DELETE RESTRICT;
  END IF;
END $$;

-- 3. Add FK constraint on clock_events.staff_id if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_name = 'clock_events'
      AND kcu.column_name = 'staff_id'
  ) THEN
    ALTER TABLE public.clock_events
      ADD CONSTRAINT clock_events_staff_id_fkey
      FOREIGN KEY (staff_id) REFERENCES public.staff(id)
      ON DELETE RESTRICT;
  END IF;
END $$;

-- 4. Add FK constraint on cash_drawer_log.created_by if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_name = 'cash_drawer_log'
      AND kcu.column_name = 'created_by'
  ) THEN
    ALTER TABLE public.cash_drawer_log
      ADD CONSTRAINT cash_drawer_log_created_by_fkey
      FOREIGN KEY (created_by) REFERENCES public.staff(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- 5. Ensure sessions.user_id FK exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_name = 'sessions'
      AND kcu.column_name = 'user_id'
  ) THEN
    ALTER TABLE public.sessions
      ADD CONSTRAINT sessions_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES public.staff(id)
      ON DELETE CASCADE;
  END IF;
END $$;

COMMIT;
