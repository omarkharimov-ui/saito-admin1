-- 2026-09-25 (owner redesign, Part 1): partner (aggregator) orders are
-- kitchen + cashier management — the customer already set address/zone/courier
-- in the partner app. The card therefore shows the courier ARRIVAL ETA as a
-- chip next to the native partner logo (top-right) instead of re-presenting
-- address/zone as primary data.
-- courier_eta is display text supplied by the partner API (e.g. "12–15 dəq");
-- until webhooks land it is set manually / simulated by the test-order flow.
alter table public.orders add column if not exists courier_eta text;
