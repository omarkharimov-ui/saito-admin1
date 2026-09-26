-- ══════════════════════════════════════════════════════════════════════════
-- 2026-09-26 (owner): email infrastructure — "settingsden business mail
-- daxil edib, rezerv səhifəsindən mail göndərmək olsun, UI-də buttonlar".
--
--   reservations.email        → guest e-mail (optional; confirm/reminder recipients)
--   settings.email_settings   → { from, host, port, user, pass, enabled, updated_at }
--                                (pass stored server-side, masked in UI)
--   email_logs                → every send attempt (to/template/status/error)
-- ══════════════════════════════════════════════════════════════════════════

alter table public.reservations
  add column if not exists email text;

comment on column public.reservations.email is
  'Guest e-mail for reservation confirm/reminder e-mails (optional).';

alter table public.settings
  add column if not exists email_settings jsonb;

comment on column public.settings.email_settings is
  'SMTP e-mail config: {from, host, port, user, pass, enabled, updated_at}. Password is never returned by /api/partners GET (masked flag only).';

create table if not exists public.email_logs (
  id             text primary key default (encode(gen_random_bytes(16), 'hex')),
  to_addr        text not null,
  template       text not null,            -- 'test' | 'confirm' | 'remind'
  reservation_id text,
  status         text not null,            -- 'sent' | 'failed'
  error          text,
  meta           jsonb,
  created_at     timestamptz not null default now()
);

comment on table public.email_logs is
  'Audit trail for every e-mail send attempt (reservation confirm/reminder/test).';

alter table public.email_logs enable row level security;
drop policy if exists "email_logs_service_all" on public.email_logs;
create policy "email_logs_service_all" on public.email_logs
  for all to service_role using (true) with check (true);
drop policy if exists "email_logs_auth_read" on public.email_logs;
create policy "email_logs_auth_read" on public.email_logs
  for select to authenticated using (true);

grant select, insert on public.email_logs to service_role;
grant select on public.email_logs to authenticated;
