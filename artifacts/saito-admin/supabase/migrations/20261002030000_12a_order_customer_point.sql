-- ============================================================================
-- 2026-10-02 (12a): PERSIST THE GEOCODED CUSTOMER POINT ON THE ORDER.
--
-- BUG: the POS geocodes the delivery address (mini-map route, KM, fee) but
-- kept the customer's lat/lng ONLY in CustomerPhasePanel local state — the
-- order row never stored it. The 12a courier app then had NO point to:
--   • drive the "Navigasiya (Google Maps)" deep link (always disabled),
--   • render the active-order dot on the admin "Kurye xəritəsi" live map.
--   (The courier routes selected orders.customer_lat/lng against a column
--   that did not exist — PostgREST PGRST204, swallowed by the ok-guard.)
--
-- FIX: two nullable numeric columns; the create path persists the point the
-- operator picked (suggest / geocode / manual pin). NULL = legacy orders /
-- address without a resolvable point (nav falls back to the typed address).
-- ============================================================================

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS customer_lat numeric(9,6),
  ADD COLUMN IF NOT EXISTS customer_lng numeric(9,6);

COMMENT ON COLUMN public.orders.customer_lat IS
  '12a: geocoded customer delivery point (lat) — courier nav + live dispatch map';
COMMENT ON COLUMN public.orders.customer_lng IS
  '12a: geocoded customer delivery point (lng) — courier nav + live dispatch map';
