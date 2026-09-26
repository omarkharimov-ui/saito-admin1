-- ============================================================================
-- 2026-09-26 (owner, Task 55): delivery smart-surge engine (Wolt/Toast-class).
--
-- Owner: "hardcoded olmasin, çox dinamik olsun (wolt kimi yağış yağanda
-- qiyməti qaldır), address daxil edende km-yi hesablasın".
--
-- 1) locations.latitude/longitude — venue coordinates. Nullable +
--    self-bootstrapping: /api/geocode geocodes the venue ADDRESS (Nominatim)
--    on first use and persists the result here; manual override in
--    Ayarlar → Məkan (lat/lng fields). Used for address→km (haversine).
--
-- 2) settings: smart surge controls (NO hardcoded numbers in code — every
--    multiplier + window is operator-configured, same pattern as the
--    2026-09-26 delivery_fee_multiplier surge):
--      delivery_weather_surge_enabled/multiplier — rain auto-surge
--        (trigger: Open-Meteo current precipitation ≥ 0.5 mm or
--         weather_code ≥ 51 — evaluated server-side in the
--         /api/rpc/calculate_delivery_fee wrapper, 10-min cache)
--      delivery_peak_surge_enabled/multiplier + 2 hour windows — lunch +
--        dinner peak auto-surge (venue timezone, S-05)
--    The RPC's manual delivery_fee_multiplier still applies first (base ×
--    manual), then the smart surge = MAX(weather, peak) — no stacking.
-- ============================================================================

begin;

alter table public.locations
  add column if not exists latitude  double precision,
  add column if not exists longitude double precision;

alter table public.settings
  add column if not exists delivery_weather_surge_enabled    boolean default true,
  add column if not exists delivery_weather_surge_multiplier numeric default 1.5
    check (delivery_weather_surge_multiplier between 1 and 3),
  add column if not exists delivery_peak_surge_enabled       boolean default false,
  add column if not exists delivery_peak_surge_multiplier    numeric default 1.25
    check (delivery_peak_surge_multiplier between 1 and 3),
  add column if not exists delivery_peak_start_hour  integer default 12 check (delivery_peak_start_hour between 0 and 23),
  add column if not exists delivery_peak_end_hour    integer default 14 check (delivery_peak_end_hour between 1 and 24),
  add column if not exists delivery_peak2_start_hour integer default 18 check (delivery_peak2_start_hour between 0 and 23),
  add column if not exists delivery_peak2_end_hour   integer default 22 check (delivery_peak2_end_hour between 1 and 24);

update public.settings
set delivery_weather_surge_multiplier = 1.5
where delivery_weather_surge_multiplier is null;

commit;
