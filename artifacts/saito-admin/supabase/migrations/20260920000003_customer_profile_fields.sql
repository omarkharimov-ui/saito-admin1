-- ============================================================================
-- CP-1 (2026-09-20) — customer profile fields (map §6 gap: "birthday /
-- email / notes / tags YOXDU" per W-A3 inspect).
-- Additive only: three nullable columns on the frozen customers table —
-- no existing behavior touched (frozen W-A1/A2/A3 contracts untouched).
-- Rollback: DROP COLUMN customers.birthday, .email, .notes.
-- ============================================================================

BEGIN;

ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS birthday date;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS notes text;

COMMENT ON COLUMN public.customers.birthday IS 'CP-1 (2026-09-20): birth date (date, no time).';
COMMENT ON COLUMN public.customers.email IS 'CP-1 (2026-09-20): marketing/contact email (Wave C will use it).';
COMMENT ON COLUMN public.customers.notes IS 'CP-1 (2026-09-20): free-form staff notes.';

COMMIT;
