-- =====================================================================
-- SAITO ADMIN 1 — CASH_DRAWER_LOG TABLE MIGRATION
-- Applied: 2026-08-27
-- Purpose: Create migration file for cash_drawer_log table that exists
--          in production but was created outside the migration system.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.cash_drawer_log (
  id              uuid                     DEFAULT gen_random_uuid() NOT NULL,
  session_id      uuid                     NOT NULL,
  shift_id        uuid,
  type            text                     NOT NULL,
  amount          numeric(12,2)            NOT NULL DEFAULT 0,
  description     text,
  created_by      uuid,
  created_at      timestamptz              NOT NULL DEFAULT now()
);

ALTER TABLE public.cash_drawer_log
  ADD CONSTRAINT cash_drawer_log_pkey PRIMARY KEY (id);

ALTER TABLE public.cash_drawer_log
  ADD CONSTRAINT cash_drawer_log_session_id_fkey
    FOREIGN KEY (session_id) REFERENCES public.cash_drawer_sessions(id) ON DELETE CASCADE;

ALTER TABLE public.cash_drawer_log
  ADD CONSTRAINT cash_drawer_log_shift_id_fkey
    FOREIGN KEY (shift_id) REFERENCES public.shifts(id) ON DELETE SET NULL;

ALTER TABLE public.cash_drawer_log
  ADD CONSTRAINT cash_drawer_log_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES public.staff(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_cash_drawer_log_session_id ON public.cash_drawer_log(session_id);
CREATE INDEX IF NOT EXISTS idx_cash_drawer_log_shift_id ON public.cash_drawer_log(shift_id);
CREATE INDEX IF NOT EXISTS idx_cash_drawer_log_created_by ON public.cash_drawer_log(created_by);
CREATE INDEX IF NOT EXISTS idx_cash_drawer_log_created_at ON public.cash_drawer_log(created_at);

ALTER TABLE public.cash_drawer_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY cash_drawer_log_select ON public.cash_drawer_log
  FOR SELECT USING (auth.role() IN ('authenticated', 'service_role'));

CREATE POLICY cash_drawer_log_service_full ON public.cash_drawer_log
  TO service_role
  USING (true) WITH CHECK (true);

GRANT SELECT ON public.cash_drawer_log TO authenticated, service_role;
GRANT INSERT, UPDATE, DELETE ON public.cash_drawer_log TO service_role;
