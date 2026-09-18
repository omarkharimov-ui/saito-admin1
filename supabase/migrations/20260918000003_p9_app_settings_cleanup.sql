-- =============================================================================
-- P-9 M3 — app_settings dead typed columns (ratified D-3)
-- PROVEN (M0 E2, 2026-09-17): pg_depend NO_DEPENDENTS on all 4 columns; app code
-- reads receipts/cash-close config from the `settings` table via settings-svc,
-- never from app_settings typed columns. The kv use (geo config) is untouched.
-- Rollback: re-add the 4 nullable columns (they held no data; table has 0 kv rows).
-- =============================================================================
ALTER TABLE public.app_settings
  DROP COLUMN IF EXISTS receipt_staff_name,
  DROP COLUMN IF EXISTS receipt_payment_method,
  DROP COLUMN IF EXISTS cash_close_variance_threshold,
  DROP COLUMN IF EXISTS cash_close_manager_required;
