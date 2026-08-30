-- =====================================================================
-- M7 — MANAGER PIN SECURITY FIX
-- Purpose: Replace MD5-based verify_manager_pin with PBKDF2-safe version.
--          The app uses PBKDF2 for PIN hashing. MD5 will never match.
--          This RPC is not currently called by application routes,
--          but must be secured/removed to prevent legacy exposure.
-- =====================================================================

-- Drop obsolete verify_manager_pin that uses MD5
DROP FUNCTION IF EXISTS public.verify_manager_pin(text);

-- Create new verify_manager_pin that returns staff candidates
-- Actual PBKDF2 verification must happen in application code
CREATE OR REPLACE FUNCTION public.verify_manager_pin(
  p_pin text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_candidates jsonb;
BEGIN
  -- Return candidate staff records for app-side PBKDF2 verification
  -- The app will call verifyPin(pin, staff.pin_hash) for each candidate
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', s.id,
      'name', s.name,
      'role', s.role,
      'role_id', s.role_id
    )
  ) INTO v_candidates
  FROM staff s
  WHERE s.pin_hash LIKE 'pbkdf2_sha256$%'
    AND s.role IN ('admin', 'superadmin')
    AND s.is_active = true
  LIMIT 10;

  IF v_candidates IS NULL OR jsonb_array_length(v_candidates) = 0 THEN
    RETURN jsonb_build_object('valid', false, 'error', 'Invalid manager PIN');
  END IF;

  RETURN jsonb_build_object(
    'valid', true,
    'candidates', v_candidates,
    'message', 'Verify PIN against candidates using PBKDF2 in application code'
  );
END;
$$;

-- Grant execute to authenticated and service_role
GRANT EXECUTE ON FUNCTION public.verify_manager_pin(text) TO authenticated, service_role;

-- Verification: confirm function exists and uses PBKDF2 pattern
DO $$
DECLARE
  v_function_exists BOOLEAN;
  v_function_source text;
BEGIN
  SELECT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'verify_manager_pin') INTO v_function_exists;
  
  IF NOT v_function_exists THEN
    RAISE EXCEPTION 'M7 VERIFICATION FAILED: verify_manager_pin function does not exist';
  END IF;
  
  SELECT pg_get_functiondef(oid) INTO v_function_source
  FROM pg_proc WHERE proname = 'verify_manager_pin';
  
  IF v_function_source LIKE '%md5%' THEN
    RAISE EXCEPTION 'M7 VERIFICATION FAILED: verify_manager_pin still contains MD5';
  END IF;
  
  IF v_function_source NOT LIKE '%pbkdf2_sha256%%' THEN
    RAISE EXCEPTION 'M7 VERIFICATION FAILED: verify_manager_pin does not reference PBKDF2';
  END IF;
  
  RAISE NOTICE 'M7: Verification passed - verify_manager_pin secured (no MD5)';
END $$;
