-- Pre-order data columns for reservations.
-- The app already writes pre_order_items / pre_order_total on reserve
-- (see api/reservations/reserve-table and api/reservations/pre-order), but
-- the live schema was missing them, so any pre-order reserve PATCH failed.

ALTER TABLE public.reservations
  ADD COLUMN IF NOT EXISTS pre_order_items jsonb,
  ADD COLUMN IF NOT EXISTS pre_order_total numeric;
