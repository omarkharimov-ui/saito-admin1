-- =====================================================================
-- M18 — REMOVE DUPLICATE FUNCTION DEFINITIONS
-- Purpose: Drop legacy overloads that lack p_performed_by_terminal_id.
--          The canonical versions with terminal_id are kept.
-- Precondition: Verify no callers depend on the legacy signatures.
-- =====================================================================

-- Step 1: Drop legacy overloads
DROP FUNCTION IF EXISTS public.accept_kitchen_ticket_atomic(uuid, uuid);
DROP FUNCTION IF EXISTS public.mark_ready_atomic(uuid, uuid);
DROP FUNCTION IF EXISTS public.merge_tables_atomic(integer, integer[], uuid);

-- Step 2: Verification
DO $$
DECLARE
  v_accept_count INTEGER;
  v_mark_ready_count INTEGER;
  v_merge_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_accept_count
  FROM pg_proc
  WHERE proname = 'accept_kitchen_ticket_atomic'
    AND pronamespace = 'public'::regnamespace;
  
  SELECT COUNT(*) INTO v_mark_ready_count
  FROM pg_proc
  WHERE proname = 'mark_ready_atomic'
    AND pronamespace = 'public'::regnamespace;
  
  SELECT COUNT(*) INTO v_merge_count
  FROM pg_proc
  WHERE proname = 'merge_tables_atomic'
    AND pronamespace = 'public'::regnamespace;
  
  IF v_accept_count <> 1 THEN
    RAISE EXCEPTION 'M18 VERIFICATION FAILED: accept_kitchen_ticket_atomic should have exactly 1 definition, found %', v_accept_count;
  END IF;
  
  IF v_mark_ready_count <> 1 THEN
    RAISE EXCEPTION 'M18 VERIFICATION FAILED: mark_ready_atomic should have exactly 1 definition, found %', v_mark_ready_count;
  END IF;
  
  IF v_merge_count <> 1 THEN
    RAISE EXCEPTION 'M18 VERIFICATION FAILED: merge_tables_atomic should have exactly 1 definition, found %', v_merge_count;
  END IF;
  
  RAISE NOTICE 'M18: Verification passed - duplicate function definitions removed';
END $$;
