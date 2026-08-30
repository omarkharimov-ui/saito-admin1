-- =====================================================================
-- M17 — REMOVE UNUSED PIN-BASED RPCS
-- Purpose: Drop void_item_with_pin, comp_item_with_pin, reopen_order_with_pin
--          These are unused by the application and rely on the old
--          verify_manager_pin architecture.
-- Precondition: Verify no application code calls these functions.
-- =====================================================================

-- Step 1: Precondition check
DO $$
DECLARE
  v_void_calls INTEGER;
  v_comp_calls INTEGER;
  v_reopen_calls INTEGER;
BEGIN
  -- Check if any database objects still reference these functions
  -- We can't easily check application code from SQL, but we can check
  -- for other DB functions/procedures that call them
  
  SELECT COUNT(*) INTO v_void_calls
  FROM pg_depend d
  JOIN pg_proc p ON d.refobjid = p.oid
  WHERE p.proname IN ('void_item_with_pin', 'comp_item_with_pin', 'reopen_order_with_pin');
  
  IF v_void_calls > 0 THEN
    RAISE WARNING 'M17: These functions may still be referenced by other DB objects';
  END IF;
  
  RAISE NOTICE 'M17: Dropping unused PIN-based RPCs';
END $$;

-- Step 2: Drop the functions
DROP FUNCTION IF EXISTS public.void_item_with_pin(uuid, text, text, uuid);
DROP FUNCTION IF EXISTS public.comp_item_with_pin(uuid, text, text, uuid);
DROP FUNCTION IF EXISTS public.reopen_order_with_pin(uuid, text, uuid);

-- Step 3: Verification
DO $$
DECLARE
  v_remaining INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_remaining
  FROM pg_proc
  WHERE proname IN ('void_item_with_pin', 'comp_item_with_pin', 'reopen_order_with_pin')
    AND pronamespace = 'public'::regnamespace;
  
  IF v_remaining > 0 THEN
    RAISE EXCEPTION 'M17 VERIFICATION FAILED: % PIN-based RPCs still exist', v_remaining;
  END IF;
  
  RAISE NOTICE 'M17: Verification passed - unused PIN-based RPCs removed';
END $$;
