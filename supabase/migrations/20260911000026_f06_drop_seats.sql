-- ============================================================================
-- 20260911000026 — F-06 (frozen): drop dead `seats` table + its 2 fns
--
-- USER-FROZEN: canonical model = `guest_count INT`. Per-seat assignment does
-- not exist in the product model; the half-built seats table was DEAD:
--   0 rows · 0 FKs · 0 triggers · 0 TS refs · 0 DB fn callers · 0 REST refs
--   (0-caller sweep verified 2026-09-11, logged in commit).
-- If per-seat dining becomes a real product requirement, it will be built as
-- a NEW foundation decision — not resurrecting this dead model.
-- ============================================================================
DROP FUNCTION IF EXISTS public.upsert_seats(integer, jsonb);
DROP FUNCTION IF EXISTS public.get_seat_totals(uuid);
DROP TABLE IF EXISTS public.seats;
