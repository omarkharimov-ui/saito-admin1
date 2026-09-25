-- ============================================================================
-- 2026-09-25 — Device identity PHASE 0 (owner: "native app istiqaməti", Faза 0)
--
-- 1) device_heartbeats:
--    - device_id: stabil, müştəri tərəfindən yaradılmış UUID (web: localStorage,
--      wrap faza: Keychain/KeyStore — ID dəyişmir, yalnız storage)
--    - first_seen_at: cihazın ilk görülməsi (YENİ badge / anti-paylaşma)
--    - blocked / blocked_at: UNPAIR — cihaz bloklanır, heartbeat 403 qaytarır
--    - unique (location_id, device_id): upsert target (NULL-lar collide etmir)
--    - Legacy NULL-device_id sətirləri silinir (ephemeral heartbeat rekordları,
--      deploy-dan sonra hər cihaz device_id ilə yenidən qeydiyyat olunur)
--
-- 2) device_commands: remote command növbəsi (indiki: 'reload')
--    - Insert = service role (admin API route)
--    - Select = authenticated (staff) → Supabase Realtime postgres_changes
--      ilə cihazın özünə çatır (filter: device_id=eq.<id>)
-- ============================================================================

alter table public.device_heartbeats
  add column if not exists device_id   text,
  add column if not exists first_seen_at timestamptz not null default now(),
  add column if not exists blocked     boolean not null default false,
  add column if not exists blocked_at  timestamptz;

alter table public.device_heartbeats
  add constraint device_heartbeats_loc_device_key unique (location_id, device_id);

delete from public.device_heartbeats where device_id is null;

create table if not exists public.device_commands (
  id         uuid primary key default gen_random_uuid(),
  device_id  text not null,
  command    text not null check (command in ('reload')),
  payload    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.device_commands enable row level security;

-- Cihaz öz komandalarını oxuya bilir (realtime); heç bir yazı icazəsi yoxdur.
create policy "device_commands_select_auth"
  on public.device_commands for select
  to authenticated
  using (true);
