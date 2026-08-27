-- =====================================================================
-- SAITO ADMIN 1 — MISSING PRODUCTION TABLES MIGRATION
-- Applied: 2026-08-27
-- Purpose: Create migration files for tables that exist in production
--          but were created outside the migration system.
-- =====================================================================

-- ---------------------------------------------------------------------
-- PART A — SHIFTS TABLE
-- ---------------------------------------------------------------------
-- Track staff shift start/end with cash reconciliation data

CREATE TABLE IF NOT EXISTS public.shifts (
  id              uuid                     DEFAULT gen_random_uuid() NOT NULL,
  staff_id        uuid                     NOT NULL,
  opened_at       timestamptz              NOT NULL DEFAULT now(),
  closed_at       timestamptz,
  starting_cash   numeric(12,2)            DEFAULT 0,
  expected_cash   numeric(12,2)            DEFAULT 0,
  actual_cash     numeric(12,2),
  difference      numeric(12,2),
  notes           text,
  created_at      timestamptz              NOT NULL DEFAULT now(),
  updated_at      timestamptz              NOT NULL DEFAULT now()
);

ALTER TABLE public.shifts
  ADD CONSTRAINT shifts_pkey PRIMARY KEY (id);

ALTER TABLE public.shifts
  ADD CONSTRAINT shifts_staff_id_fkey
    FOREIGN KEY (staff_id) REFERENCES public.staff(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_shifts_staff_id ON public.shifts(staff_id);
CREATE INDEX IF NOT EXISTS idx_shifts_opened_at ON public.shifts(opened_at);
CREATE INDEX IF NOT EXISTS idx_shifts_closed_at ON public.shifts(closed_at) WHERE closed_at IS NOT NULL;

ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;

CREATE POLICY shifts_select ON public.shifts
  FOR SELECT USING (auth.role() IN ('authenticated', 'service_role'));

CREATE POLICY shifts_service_full ON public.shifts
  TO service_role
  USING (true) WITH CHECK (true);

GRANT SELECT ON public.shifts TO authenticated, service_role;
GRANT INSERT, UPDATE, DELETE ON public.shifts TO service_role;

-- ---------------------------------------------------------------------
-- PART B — CLOCK_EVENTS TABLE
-- ---------------------------------------------------------------------
-- Granular clock in/out events for attendance tracking

CREATE TABLE IF NOT EXISTS public.clock_events (
  id          uuid                     DEFAULT gen_random_uuid() NOT NULL,
  staff_id    uuid                     NOT NULL,
  clock_in    timestamptz              NOT NULL DEFAULT now(),
  clock_out   timestamptz,
  created_at  timestamptz              NOT NULL DEFAULT now()
);

ALTER TABLE public.clock_events
  ADD CONSTRAINT clock_events_pkey PRIMARY KEY (id);

ALTER TABLE public.clock_events
  ADD CONSTRAINT clock_events_staff_id_fkey
    FOREIGN KEY (staff_id) REFERENCES public.staff(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_clock_events_staff_id ON public.clock_events(staff_id);
CREATE INDEX IF NOT EXISTS idx_clock_events_clock_in ON public.clock_events(clock_in);
CREATE INDEX IF NOT EXISTS idx_clock_events_clock_out ON public.clock_events(clock_out) WHERE clock_out IS NOT NULL;

ALTER TABLE public.clock_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY clock_events_select ON public.clock_events
  FOR SELECT USING (auth.role() IN ('authenticated', 'service_role'));

CREATE POLICY clock_events_service_full ON public.clock_events
  TO service_role
  USING (true) WITH CHECK (true);

GRANT SELECT ON public.clock_events TO authenticated, service_role;
GRANT INSERT, UPDATE, DELETE ON public.clock_events TO service_role;
