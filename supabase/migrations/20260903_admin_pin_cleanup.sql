-- =====================================================================
-- SAITO ADMIN 1 — ADMIN PIN CLEANUP
-- Purpose: Remove plaintext PIN column from admin_users
-- SAFETY: Only drops column if ALL values are NULL.
--         If any plaintext PIN exists, migration ABORTS.
-- =====================================================================

-- ---------------------------------------------------------------------
-- STEP 1: Verify no plaintext PINs exist
-- ---------------------------------------------------------------------
DO $$
DECLARE
  plain_count integer;
BEGIN
  SELECT COUNT(*) INTO plain_count
    FROM public.admin_users
   WHERE pin IS NOT NULL;

  IF plain_count > 0 THEN
    RAISE EXCEPTION 'ABORT: admin_users contains % plaintext PIN(s). Migration stopped to prevent data loss.', plain_count;
  END IF;

  RAISE NOTICE 'Admin PIN cleanup: no plaintext PINs found, safe to proceed';
END $$;

-- ---------------------------------------------------------------------
-- STEP 2: Drop plaintext PIN column and index
-- ---------------------------------------------------------------------
ALTER TABLE public.admin_users
  DROP COLUMN IF EXISTS pin;

DROP INDEX IF EXISTS public.admin_users_pin_key;

-- ---------------------------------------------------------------------
-- STEP 3: Verification
-- ---------------------------------------------------------------------
DO $$
DECLARE
  col_count integer;
BEGIN
  SELECT COUNT(*) INTO col_count
    FROM information_schema.columns
   WHERE table_name = 'admin_users'
     AND column_name = 'pin';

  IF col_count = 0 THEN
    RAISE NOTICE 'Admin PIN cleanup: pin column successfully removed';
  ELSE
    RAISE WARNING 'Admin PIN cleanup: pin column still exists';
  END IF;
END $$;
