-- 20260924030000_fix_active_table_index_final_states.sql
-- 2026-09-24 (owner: "masa 97/98-də tək terminaldan, tək klikdə 409 — valla;
-- 901-də isə heç problem yoxdur"): ROOT CAUSE — index/code drift.
--
-- idx_orders_active_table (global "one active order per table_number") only
-- treated (paid, cancelled, closed) as final, but the app code treats SIX
-- states as final (FINAL_ORDER_STATUSES, src/lib/pos-tables.ts):
--   cancelled, closed, paid, refunded, partially_refunded, voided
--
-- Consequence: any order left in refunded / partially_refunded / voided kept
-- blocking its table_number FOREVER. The create-path lookup (NOT_FINAL)
-- correctly skipped it, then the CREATE violated the stale global unique
-- index → 409 → misreported to the cashier as
-- "Sifariş eyni anda başqa terminaldan dəyişdirildi" (no other terminal
-- involved at all). Affected tables found live on 09-24: 98, 401, 991, 996
-- (refunded) and 1 (partially_refunded) — all from 09-21 refund tests.
--
-- Fix: rebuild the index with the full 6-state final set (same set the floor
-- view / sync_table_order_aggregates already use). The new active set is a
-- STRICT SUBSET of the old one, so the index always builds (no new
-- duplicates possible). No data rows are modified.

DROP INDEX IF EXISTS public.idx_orders_active_table;

CREATE UNIQUE INDEX idx_orders_active_table
  ON public.orders USING btree (table_number)
  WHERE (status <> ALL (ARRAY[
      'paid'::varchar, 'cancelled'::varchar, 'closed'::varchar,
      'refunded'::varchar, 'partially_refunded'::varchar, 'voided'::varchar
    ]))
    AND (is_split IS DISTINCT FROM true)
    AND (merged_into IS NULL);
