-- 2026-09-25 (owner: "toggle olsun ayarlarda, isteyərlərsə açırlar, istəməzlərsə bağlı"):
-- waitlist feature master switch. Default TRUE (feature stays live; a
-- restaurant that does not use the queue turns it off in Settings).
alter table public.settings add column if not exists waitlist_enabled boolean not null default true;
