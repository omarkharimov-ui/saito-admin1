-- 20260923000001_bds_stations.sql
-- BDS station model (owner request 2026-09-23): delivery/pickup are first-class
-- stations with station ids, same SSOT pattern as kitchen stations.
--
-- AUDIT (2026-09-23, live DB jbxmlnsicbfkbsatnoej — read-only):
--   stations:       5 rows, station_type IN ('kitchen','bar','grill','prep','service'),
--                   CHECK constraint blocks any other value.
--   orders:         798 rows, order_type takeaway=4 / delivery=3 (30d);
--                   dormant station_id column 0/798 populated (NOT reused —
--                   original intent unknown; new explicit column instead).
--   RPCs:           create_takeaway_order / create_delivery_order INSERT orders
--                   without any station ref.
--
-- CHANGES:
--   1. station_type CHECK extended with 'delivery' | 'pickup'.
--   2. Seed 'Çatdırılma' (delivery) + 'Gel-Al' (pickup) stations, idempotent
--      (global unique(name) guards re-runs).
--   3. orders.bds_station_id -> stations(id), ON DELETE SET NULL.
--   4. Backfill from order_type (takeaway->pickup, delivery->delivery),
--      location-scoped.
--   5. BEFORE INSERT trigger snapshots the default BDS station onto new
--      takeaway/delivery orders — single choke point covering every current
--      and future write path (same pattern as
--      trg_order_items_station_snapshot). Explicit bds_station_id wins.

BEGIN;

-- 1) allow BDS station kinds
ALTER TABLE stations DROP CONSTRAINT IF EXISTS stations_station_type_check;
ALTER TABLE stations ADD CONSTRAINT stations_station_type_check
  CHECK (station_type = ANY (ARRAY['kitchen','bar','grill','prep','service','other','delivery','pickup']));

-- 2) seed BDS stations (idempotent; single location/org today — copied from
--    the existing kitchen station row)
INSERT INTO stations (name, station_type, is_active, sort_order, location_id, organization_id)
SELECT v.name, v.station_type, true, v.sort_order, ctx.location_id, ctx.organization_id
FROM (VALUES
  ('Çatdırılma', 'delivery', 90),
  ('Gel-Al', 'pickup', 91)
) AS v(name, station_type, sort_order)
CROSS JOIN (SELECT location_id, organization_id FROM stations LIMIT 1) ctx
WHERE NOT EXISTS (SELECT 1 FROM stations x WHERE x.name = v.name);

-- 3) orders.bds_station_id
ALTER TABLE orders ADD COLUMN IF NOT EXISTS bds_station_id uuid
  REFERENCES stations(id) ON DELETE SET NULL;

-- 4) backfill from order_type (location-scoped)
UPDATE orders o SET bds_station_id = s.id
FROM stations s
WHERE o.bds_station_id IS NULL
  AND o.order_type = 'takeaway' AND s.station_type = 'pickup'
  AND s.location_id = o.location_id;
UPDATE orders o SET bds_station_id = s.id
FROM stations s
WHERE o.bds_station_id IS NULL
  AND o.order_type = 'delivery' AND s.station_type = 'delivery'
  AND s.location_id = o.location_id;

-- 5) snapshot trigger (explicit value always wins)
CREATE OR REPLACE FUNCTION set_order_bds_station() RETURNS trigger AS $f$
DECLARE
  v_station UUID;
BEGIN
  IF NEW.bds_station_id IS NULL AND NEW.order_type IN ('takeaway', 'delivery') THEN
    SELECT s.id INTO v_station
    FROM stations s
    WHERE s.location_id = NEW.location_id
      AND s.station_type = CASE WHEN NEW.order_type = 'takeaway' THEN 'pickup' ELSE 'delivery' END
      AND s.is_active
    LIMIT 1;
    NEW.bds_station_id := v_station;
  END IF;
  RETURN NEW;
END;
$f$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_orders_bds_station ON orders;
CREATE TRIGGER trg_orders_bds_station
  BEFORE INSERT ON orders
  FOR EACH ROW EXECUTE FUNCTION set_order_bds_station();

COMMIT;
