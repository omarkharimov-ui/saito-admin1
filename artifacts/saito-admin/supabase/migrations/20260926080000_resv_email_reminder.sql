-- 2026-09-26 (owner): auto-reminder idempotency for reservation e-mails.
-- The daily pump (instrumentation.ts → /api/cron/resv-emails) marks each
-- reservation's last successful reminder so it is never double-sent.

alter table public.reservations
  add column if not exists last_reminder_at timestamptz;

comment on column public.reservations.last_reminder_at is
  'Last successful auto-reminder e-mail (daily pump, 2026-09-26).';
