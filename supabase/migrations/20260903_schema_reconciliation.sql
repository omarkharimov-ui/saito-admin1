-- =====================================================================
-- SAITO ADMIN 1 — SCHEMA RECONCILIATION
-- Purpose: Align existing production tables with expected schema
--          WITHOUT dropping/recreating tables or losing data.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) shifts — add missing updated_at column
-- ---------------------------------------------------------------------
-- Production currently has: id, staff_id, report_date, opened_at,
-- closed_at, starting_cash, expected_cash, actual_cash, difference,
-- notes, created_at
-- We add updated_at for RPC/audit consistency.

ALTER TABLE public.shifts
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- ---------------------------------------------------------------------
-- 2) clock_events — add missing created_at column
-- ---------------------------------------------------------------------
-- Production currently has: id, staff_id, clock_in, clock_out
-- Table is empty, but we keep it and add created_at for audit flow.

ALTER TABLE public.clock_events
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

-- ---------------------------------------------------------------------
-- 3) cash_drawer_log — add shift_id column (nullable)
-- ---------------------------------------------------------------------
-- Production currently has: id, session_id, type, amount,
-- description, order_id, created_by, created_at
-- We add shift_id WITHOUT backfilling; existing rows keep NULL.

ALTER TABLE public.cash_drawer_log
  ADD COLUMN IF NOT EXISTS shift_id uuid;

-- Add FK only if column was just added or already exists without FK.
-- We use a DO block to avoid duplicate FK errors.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints tc
    JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_name = tc.constraint_name
    WHERE tc.table_name = 'cash_drawer_log'
      AND tc.constraint_type = 'FOREIGN KEY'
      AND ccu.column_name = 'shift_id'
      AND ccu.table_name = 'shifts'
  ) THEN
    ALTER TABLE public.cash_drawer_log
      ADD CONSTRAINT cash_drawer_log_shift_id_fkey
      FOREIGN KEY (shift_id) REFERENCES public.shifts(id)
      ON DELETE RESTRICT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_cash_drawer_log_shift_id
  ON public.cash_drawer_log(shift_id);

-- ---------------------------------------------------------------------
-- 4) permissions — add category column if missing
-- ---------------------------------------------------------------------
ALTER TABLE public.permissions
  ADD COLUMN IF NOT EXISTS category text;

-- ---------------------------------------------------------------------
-- 5) Verification notices
-- ---------------------------------------------------------------------
DO $$
DECLARE
  v_shifts_updated_at boolean;
  v_clock_created_at boolean;
  v_cash_shift_id boolean;
  v_perm_category boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'shifts' AND column_name = 'updated_at'
  ) INTO v_shifts_updated_at;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'clock_events' AND column_name = 'created_at'
  ) INTO v_clock_created_at;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'cash_drawer_log' AND column_name = 'shift_id'
  ) INTO v_cash_shift_id;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'permissions' AND column_name = 'category'
  ) INTO v_perm_category;

  RAISE NOTICE 'Schema reconciliation: shifts.updated_at=%, clock_events.created_at=%, cash_drawer_log.shift_id=%, permissions.category=%',
    v_shifts_updated_at, v_clock_created_at, v_cash_shift_id, v_perm_category;
END $$;
