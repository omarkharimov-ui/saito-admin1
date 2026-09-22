-- 20260922000003_station_backfill_snapshot.sql
-- BDS Work 2 (task #26): product-level station assignment.
--
-- AUDIT (2026-09-22, live DB jbxmlnsicbfkbsatnoej — read-only):
--   stations:      5 active rows (Main Kitchen, Bar, Grill, Prep, Service)
--                  → SSOT table already exists; NOT hardcoded in app.
--   products:      15/15 station_id NULL; kitchen_section: hot=11, bar=2, sushi=2.
--   order_items:   331/331 (90d) station_id NULL; legacy station varchar = 'all'.
--   FKs:           products.station_id → stations, order_items.station_id → stations.
--   Write paths:   POS /api/orders insert, QR insert, reservation pre-order insert,
--                  add_order_items RPC — ALL leave station_id NULL today.
--
-- CHANGES:
--   1. One-time backfill products.station_id from kitchen_section
--      (hot→Grill, bar→Bar, sushi/other/NULL→Main Kitchen).
--      Seed only — per-product station is managed in the admin UI afterwards.
--   2. BEFORE INSERT trigger on order_items: snapshot the product's station
--      onto each line. Single choke point covering every current/future
--      write path (no per-path patching).
--   3. Backfill existing order_items from products — UNLOCKED states only
--      (trg_item_money_lock freezes station_id once work starts; we honor
--      that and never use the bypass for a seed).

BEGIN;

-- 1) products.station_id from kitchen_section (idempotent: only NULLs)
UPDATE products p
SET station_id = s.id
FROM stations s
WHERE p.station_id IS NULL
  AND s.is_active
  AND s.name = CASE
    WHEN p.kitchen_section = 'hot' THEN 'Grill'
    WHEN p.kitchen_section = 'bar' THEN 'Bar'
    ELSE 'Main Kitchen'
  END;

-- 2) snapshot trigger: line.station_id := products.station_id at insert time
CREATE OR REPLACE FUNCTION set_order_item_station_snapshot() RETURNS trigger AS $$
BEGIN
  IF NEW.station_id IS NULL AND NEW.product_id IS NOT NULL THEN
    SELECT p.station_id INTO NEW.station_id
    FROM products p
    WHERE p.id = NEW.product_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_order_items_station_snapshot ON order_items;
CREATE TRIGGER trg_order_items_station_snapshot
BEFORE INSERT ON order_items
FOR EACH ROW EXECUTE FUNCTION set_order_item_station_snapshot();

-- 3) backfill existing lines (idempotent: only NULLs, only UNLOCKED states).
--    trg_item_money_lock makes station_id immutable once an item reaches
--    sent/accepted/preparing/ready/served/completed — we do NOT bypass that
--    guard (no routing change on in-flight/frozen lines). Legacy locked
--    lines keep station_id NULL; the KDS/BDS display layer falls back to
--    the Main Kitchen default for those.
UPDATE order_items oi
SET station_id = p.station_id
FROM products p
WHERE oi.station_id IS NULL
  AND oi.product_id IS NOT NULL
  AND oi.product_id = p.id
  AND p.station_id IS NOT NULL
  AND COALESCE(oi.kitchen_status, 'pending') NOT IN
      ('sent','accepted','preparing','ready','served','completed');

COMMIT;
