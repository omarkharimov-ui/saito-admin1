-- 2026-09-25 (owner, decision): Device health — terminal statusları
-- (POS / KDS / BDS / Expo / Admin) online/offline, heartbeat ilə.
-- Hər cihaz hər 30s POST /api/devices/heartbeat atır; server last_seen_at
-- upsert edir. Status = last_seen_at ≤ 45s → online.
create table if not exists public.device_heartbeats (
  id           bigint generated always as identity primary key,
  location_id  uuid references public.locations(id) on delete cascade,
  device_name  text not null,
  device_type  text not null default 'other'
               check (device_type in ('pos','kds','bds','expo','admin','other')),
  last_seen_at timestamptz not null default now(),
  meta         jsonb,
  unique (location_id, device_name)
);

create index if not exists idx_device_hb_seen on public.device_heartbeats (last_seen_at desc);
comment on table public.device_heartbeats is
  'Terminal heartbeat registry — device health UI (Settings → Cihazlar + dashboard). Online = last_seen_at within 45s.';
