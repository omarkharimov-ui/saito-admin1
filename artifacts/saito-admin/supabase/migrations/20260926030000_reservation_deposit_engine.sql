-- ══════════════════════════════════════════════════════════════════════════
-- 2026-09-26 (owner, Task 49): reservation deposit engine (VIP/depozit/limit)
--
-- is_vip already existed but nothing could WRITE it (no UI field). This adds
-- the missing deposit column so the reservation engine covers:
--   VIP      → reservations.is_vip (existing) — badge on POS sheet + page
--   DEPOSIT  → reservations.deposit_amount (NEW) — table hold money taken at
--              booking; staff marks it at check-in, it is credited against
--              the bill at payment (cashier sees the amount on the sheet)
--   LIMITS   → conflict guard already in /api/reservations (same tables,
--              ±2h); deposit acts as the financial hold limit.
-- ══════════════════════════════════════════════════════════════════════════

alter table public.reservations
  add column if not exists deposit_amount numeric
  constraint reservations_deposit_amount_nonneg check (deposit_amount >= 0);

comment on column public.reservations.deposit_amount is
  'Table-hold deposit (₼) taken at booking for VIP/large reservations; credited to the bill at payment. NULL/0 = no deposit.';
