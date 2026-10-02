-- 2026-10-02 (12h, owner GO): "yuxaridan grill prep service stationsini çıxar —
-- sadece hot ve bar stationsları var (gələcəkdə arta bilər)".
-- The kitchen is a HOT line (Main Kitchen) + BAR. Grill/Prep/Service are
-- removed from the SSOT; their products + item snapshots are remapped to
-- Main Kitchen (hot line) so no station reference dangles.
BEGIN;

-- Served-state items have FROZEN station routing (trg_item_money_lock raises
-- "ITEM_STATION_FROZEN"). This one-off reconfiguration needs the freeze off
-- for the remap; re-enabled before COMMIT.
ALTER TABLE order_items DISABLE TRIGGER trg_item_money_lock;

UPDATE products
   SET station_id = '90821f15-c53f-47c5-98c6-fa07b31d7f11' -- Main Kitchen
 WHERE station_id IN (
   '2c61cc08-983d-4142-965f-bd9ba1bc72dc', -- Grill
   '66b3fd8c-952d-4456-8040-fd5fe7a3b723', -- Prep
   '30c7286b-bab1-4fe4-ab1d-59ef75c63974'  -- Service
 );

UPDATE order_items
   SET station_id = '90821f15-c53f-47c5-98c6-fa07b31d7f11'
 WHERE station_id IN (
   '2c61cc08-983d-4142-965f-bd9ba1bc72dc',
   '66b3fd8c-952d-4456-8040-fd5fe7a3b723',
   '30c7286b-bab1-4fe4-ab1d-59ef75c63974'
 );

DELETE FROM stations
 WHERE id IN (
   '2c61cc08-983d-4142-965f-bd9ba1bc72dc',
   '66b3fd8c-952d-4456-8040-fd5fe7a3b723',
   '30c7286b-bab1-4fe4-ab1d-59ef75c63974'
 );

ALTER TABLE order_items ENABLE TRIGGER trg_item_money_lock;

COMMIT;
