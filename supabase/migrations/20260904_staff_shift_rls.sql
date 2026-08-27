-- =====================================================================
-- SAITO ADMIN 1 — STAFF SHIFT RLS
-- Purpose: Enable Row Level Security on staff-related operational tables.
--          Runs AFTER schema reconciliation and security foundation.
--          DOES NOT break existing server-side API flows.
-- =====================================================================

-- ---------------------------------------------------------------------
-- shifts
-- ---------------------------------------------------------------------
ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS shifts_select ON public.shifts;
CREATE POLICY shifts_select ON public.shifts
  FOR SELECT USING (auth.role() IN ('authenticated', 'service_role'));

DROP POLICY IF EXISTS shifts_service_full ON public.shifts;
CREATE POLICY shifts_service_full ON public.shifts
  TO service_role
  USING (true) WITH CHECK (true);

GRANT SELECT ON public.shifts TO authenticated, service_role;
GRANT INSERT, UPDATE, DELETE ON public.shifts TO service_role;

-- ---------------------------------------------------------------------
-- clock_events
-- ---------------------------------------------------------------------
ALTER TABLE public.clock_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS clock_events_select ON public.clock_events;
CREATE POLICY clock_events_select ON public.clock_events
  FOR SELECT USING (auth.role() IN ('authenticated', 'service_role'));

DROP POLICY IF EXISTS clock_events_service_full ON public.clock_events;
CREATE POLICY clock_events_service_full ON public.clock_events
  TO service_role
  USING (true) WITH CHECK (true);

GRANT SELECT ON public.clock_events TO authenticated, service_role;
GRANT INSERT, UPDATE, DELETE ON public.clock_events TO service_role;

-- ---------------------------------------------------------------------
-- cash_drawer_log
-- ---------------------------------------------------------------------
ALTER TABLE public.cash_drawer_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cash_drawer_log_select ON public.cash_drawer_log;
CREATE POLICY cash_drawer_log_select ON public.cash_drawer_log
  FOR SELECT USING (auth.role() IN ('authenticated', 'service_role'));

DROP POLICY IF EXISTS cash_drawer_log_service_full ON public.cash_drawer_log;
CREATE POLICY cash_drawer_log_service_full ON public.cash_drawer_log
  TO service_role
  USING (true) WITH CHECK (true);

GRANT SELECT ON public.cash_drawer_log TO authenticated, service_role;
GRANT INSERT, UPDATE, DELETE ON public.cash_drawer_log TO service_role;

-- ---------------------------------------------------------------------
-- Verification
-- ---------------------------------------------------------------------
DO $$
DECLARE
  v_table text;
  v_rls_enabled boolean;
  v_policy_count integer;
BEGIN
  FOR v_table IN VALUES ('shifts'), ('clock_events'), ('cash_drawer_log')
  LOOP
    SELECT relrowsecurity INTO v_rls_enabled
      FROM pg_class
     WHERE relname = v_table
       AND relnamespace = 'public'::regnamespace;

    SELECT COUNT(*) INTO v_policy_count
      FROM pg_policies
     WHERE tablename = v_table
       AND schemaname = 'public';

    RAISE NOTICE 'RLS %: enabled=%, policies=%', v_table, v_rls_enabled, v_policy_count;
  END LOOP;
END $$;
