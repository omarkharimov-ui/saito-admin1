-- ============================================================================
-- DEPRECATION: Old audit tables
-- 
-- audit_log (singular) and audit_logs (plural) are deprecated.
-- All new writes go through log_audit() -> audit_logs_canonical.
-- DO NOT DROP these tables until all historical data is migrated.
-- ============================================================================

-- Add comments to mark as deprecated
COMMENT ON TABLE public.audit_log IS 'DEPRECATED: Use audit_logs_canonical. Migrated via log_audit() RPC.';
COMMENT ON TABLE public.audit_logs IS 'DEPRECATED: Use audit_logs_canonical. Migrated via log_audit() RPC.';

-- Prevent new INSERTs via RLS (service_role still has access for migration reads)
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Create policy that blocks all new inserts (reads still allowed for migration)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'audit_log' AND policyname = 'audit_log_deprecated_no_insert') THEN
    CREATE POLICY audit_log_deprecated_no_insert ON public.audit_log FOR INSERT WITH CHECK (false);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'audit_logs' AND policyname = 'audit_logs_deprecated_no_insert') THEN
    CREATE POLICY audit_logs_deprecated_no_insert ON public.audit_logs FOR INSERT WITH CHECK (false);
  END IF;
END $$;
