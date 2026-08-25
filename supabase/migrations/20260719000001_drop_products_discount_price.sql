-- ============================================================================
-- Drop products.discount_price — finalize Single Source of Truth cleanup.
--
-- Audited and confirmed zero live dependencies on public.products.discount_price:
--   * 0 RPCs/functions reference it (pg_proc prosrc scan)
--   * 0 triggers on products reference it
--   * 0 views / materialized views reference it
--   * 0 RLS policies reference it
--   * 0 application reads/writes it (frontend only uses product_variants.discount_price,
--     a separate table/column, which is intentionally kept)
--   * The only remaining object was the legacy index idx_products_discount, dropped below.
--
-- The campaign engine (campaign_rules + campaign_targets + auto_apply_campaigns)
-- is the sole source of product pricing. This column has been deprecated since
-- 20260704_p10_pricing_engine.sql and was never read by any production path.
-- ============================================================================

-- Remove the leftover legacy index first (depends on the column).
DROP INDEX IF EXISTS idx_products_discount;

-- Drop the deprecated column.
ALTER TABLE products DROP COLUMN IF EXISTS discount_price;
