-- ============================================================
-- PHASE 0.2-C2: Cross-Entity Consistency — Table -> Floor -> Location
-- Invariant: table_floors.floor_id must reference a floor in the SAME
--            location/organization as the table.
-- Onboarding: floors table was empty; created floors from distinct
--             table_floors.floor_name values.
-- ============================================================

-- STEP 1: Seed floors from existing table_floors.floor_name values (Main Location)
INSERT INTO floors (id, location_id, organization_id, name, sort_order, is_active)
VALUES
('10000000-0000-4000-8000-000000000001','f1f830b3-cf15-47e3-a538-01abd8222c6d','00000000-0000-0000-0000-000000000001','mertebe 1',1,true),
('10000000-0000-4000-8000-000000000002','f1f830b3-cf15-47e3-a538-01abd8222c6d','00000000-0000-0000-0000-000000000001','VIP',2,true)
ON CONFLICT (id) DO NOTHING;

-- STEP 2: Add table_floors.floor_id + backfill from floor_name
ALTER TABLE table_floors ADD COLUMN IF NOT EXISTS floor_id uuid;
UPDATE table_floors tf
SET floor_id = f.id
FROM floors f
WHERE f.location_id = tf.location_id
  AND f.organization_id = tf.organization_id
  AND f.name = tf.floor_name
  AND tf.floor_id IS NULL;

-- STEP 3: FK target unique index + FKs
CREATE UNIQUE INDEX IF NOT EXISTS floors_org_loc_id_uidx ON floors(organization_id, location_id, id);
ALTER TABLE table_floors ADD CONSTRAINT table_floors_floor_id_fkey
  FOREIGN KEY (floor_id) REFERENCES floors(id);
ALTER TABLE table_floors ADD CONSTRAINT table_floors_floor_loc_org_invariant
  FOREIGN KEY (organization_id, location_id, floor_id) REFERENCES floors(organization_id, location_id, id);
