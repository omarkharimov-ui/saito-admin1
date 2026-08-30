-- =====================================================================
-- M8 — REMOVE LEGACY ADMIN FUNCTIONS
-- Purpose: Drop auth-dependent admin role functions that rely on
--          auth.uid() and admin_users, which are not part of the
--          canonical identity model.
-- Precondition: All RLS policies using these functions must be
--               replaced BEFORE this migration runs.
-- =====================================================================

-- Step 1: Precondition check - verify no RLS policies depend on these functions
DO $$
DECLARE
  v_policy_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_policy_count
  FROM pg_policies
  WHERE policyname IN (
    'admin_users_delete_superadmin',
    'admin_users_insert_bootstrap',
    'admin_users_insert_superadmin',
    'admin_users_select_bootstrap',
    'admin_users_update_superadmin',
    'auth_modify_staff',
    'auth_read_staff',
    'staff_all_superadmin',
    'auth_modify_shifts',
    'auth_read_shifts',
    'auth_modify_clock_events',
    'auth_read_clock_events',
    'settings_select_admin',
    'settings_select_kitchen',
    'settings_write_staff',
    'settings_write_superadmin',
    'auth_modify_settings'
  )
  AND schemaname = 'public';

  IF v_policy_count > 0 THEN
    RAISE EXCEPTION 'M8 ABORTED: % legacy RLS policies still exist. Run M9 (RLS cleanup) first.', v_policy_count;
  END IF;
  
  RAISE NOTICE 'M8: Precondition check passed (0 legacy policies)';
END $$;

-- Step 2: Drop legacy functions
DROP FUNCTION IF EXISTS public.current_admin_role();
DROP FUNCTION IF EXISTS public.current_admin_role_by_email();
DROP FUNCTION IF EXISTS public.effective_admin_role();
DROP FUNCTION IF EXISTS public.is_admin_staff();
DROP FUNCTION IF EXISTS public.is_superadmin();
DROP FUNCTION IF EXISTS public.is_kitchen_staff();

-- Step 3: Verification
DO $$
DECLARE
  v_remaining_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_remaining_count
  FROM pg_proc
  WHERE proname IN (
    'current_admin_role',
    'current_admin_role_by_email',
    'effective_admin_role',
    'is_admin_staff',
    'is_superadmin',
    'is_kitchen_staff'
  )
  AND pronamespace = 'public'::regnamespace;

  IF v_remaining_count > 0 THEN
    RAISE EXCEPTION 'M8 VERIFICATION FAILED: % legacy functions still exist', v_remaining_count;
  END IF;
  
  RAISE NOTICE 'M8: Verification passed - all legacy admin functions removed';
END $$;
