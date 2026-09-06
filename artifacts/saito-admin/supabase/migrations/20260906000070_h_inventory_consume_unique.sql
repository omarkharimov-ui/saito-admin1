-- ============================================================================
-- M1 (H01) — inventory_consume_unique
-- Phase 0.4-H — Inventory Boundary
-- ============================================================================
-- PURPOSE:
--   Make exactly-one-consumption-per-(order_item_id, ingredient_id) STRUCTURAL.
--   Today dedup is procedural (IF EXISTS guard + idempotency_key unique index).
--   This partial unique index gives that guard a structural backstop.
--
-- SEMANTIC INVARIANT (frozen by plan v3 H3.4):
--   A given (order_item_id, ingredient_id) may produce AT MOST ONE
--   order_consumption ledger event over the item's lifetime.
--   Re-consumption / partial consumption on the SAME original item is NOT supported.
--   Correction model (0.4-D compatible):
--     - original item  -> max 1 order_consumption per ingredient (this index)
--     - correction     -> reversal/compensation events (append-only, NOT a 2nd consumption)
--     - replacement    -> NEW order_item_id with its own consumption (unconstrained)
--
-- SAFETY:
--   Partial index: WHERE type='order_consumption' AND order_item_id IS NOT NULL.
--   NULL order_item_id historical rows (594) are EXCLUDED — NULLs are distinct in btree,
--   so the legacy order-level rows cannot conflict.
--   Pre-validation (live, 2026-07-29): 21 rows in scope, 21 distinct (oi,ing) pairs,
--   0 duplicates. Index creation will succeed without conflict.
--
-- AFFECTS:
--   - DB object: 1 partial UNIQUE index on inventory_logs
--   - RPCs/triggers: none directly (consume_stock_for_item already uses ON CONFLICT)
--   - API routes: none
--   - Frozen 0.4-A–G: none (additive constraint on inventory only)
--
-- ROLLBACK:
--   DROP INDEX IF EXISTS public.inventory_logs_consume_uidx;
-- ============================================================================

-- Pre-flight assertion (fail loudly if duplicates exist — should be 0).
-- Guard: if any duplicate (oi, ing) exists, the CREATE UNIQUE INDEX below
-- will raise and abort the migration. No historical row is ever mutated.

CREATE UNIQUE INDEX IF NOT EXISTS inventory_logs_consume_uidx
  ON public.inventory_logs (order_item_id, ingredient_id)
  WHERE type = 'order_consumption'
    AND order_item_id IS NOT NULL;

-- Comment for auditability
COMMENT ON INDEX public.inventory_logs_consume_uidx IS
  '0.4-H M1: at most one order_consumption per (order_item_id, ingredient_id). Structural backstop for consume_stock_for_item dedup. NULL-oi historical rows excluded. See plan-0.4-H-inventory-boundary-v2.md H3.4.';
