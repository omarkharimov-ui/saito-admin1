-- 2026-09-25 (owner: "waitlist duzelt" — Q4 decision: sadə UI versiya):
-- The waitlist API routes (/api/waitlist, /api/waitlist/seat) existed but
-- referenced a `waitlist` table that was NEVER created — every call 500'd.
-- This creates the table the routes expect (name/phone/guests/status/
-- seated_at) so the queue finally works.
create table if not exists public.waitlist (
  id          uuid primary key default gen_random_uuid(),
  location_id uuid references public.locations(id) on delete set null,
  name        text not null,
  phone       text,
  guests      integer not null default 1 check (guests between 1 and 99),
  status      text not null default 'waiting'
              check (status in ('waiting','seated','cancelled','no_show')),
  notes       text,
  created_at  timestamptz not null default now(),
  seated_at   timestamptz,
  updated_at  timestamptz not null default now()
);

create index if not exists idx_waitlist_status on public.waitlist (status, created_at);
comment on table public.waitlist is
  'Guest queue (waitlist). POS dine-in "Növbə" panel: add entry → seat to an empty table via /api/waitlist/seat. SMS notify = future (Settings → Bildirişlər phase).';
