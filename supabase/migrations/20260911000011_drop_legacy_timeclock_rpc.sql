-- ============================================================================
-- 20260911000011 — S-02 STEP 3/3: DROP legacy caller-identity time-clock RPCs
--
-- All 6 legacy uuid-identity functions are replaced by the *_token variants
-- (migration 20260911000010). Pre-DROP sweep (2026-09-11) verified:
--   - 0 source callers (artifacts/saito-admin/src, *_token excluded)
--   - 0 DB fn callers
-- Removing them closes the last caller-controlled-identity path for
-- clock in/out/break (S-02 / contract §4 "caller-supplied identity").
-- ============================================================================
DROP FUNCTION IF EXISTS public.clock_in(uuid, text, text);
DROP FUNCTION IF EXISTS public.clock_out(uuid, text, text);
DROP FUNCTION IF EXISTS public.start_break(uuid, text);
DROP FUNCTION IF EXISTS public.end_break(uuid);
DROP FUNCTION IF EXISTS public.clock_in_atomic(uuid, text, uuid);
DROP FUNCTION IF EXISTS public.clock_out_atomic(uuid, text, uuid);

-- Verify only the token variants remain
DO $$
DECLARE
  v_left int;
BEGIN
  SELECT count(*) INTO v_left FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname IN ('clock_in','clock_out','start_break','end_break','clock_in_atomic','clock_out_atomic');
  IF v_left > 0 THEN
    RAISE EXCEPTION 'DROP incomplete: % legacy time-clock fn(s) remain', v_left;
  END IF;
END;
$$;
