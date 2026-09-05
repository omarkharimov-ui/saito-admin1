-- ============================================================
-- PHASE 0.2-B: LOCATION DB + LOCATION SCOPE
-- Location-scoping of top-level entities + cross-org/location invariant
-- NOTE: Applied via direct SQL against live Supabase (0.1 bug: multi-statement
--       batches roll back on any failure). Steps below match applied state.
-- ============================================================

-- ============================================================
-- STEP 1: Add location_id + organization_id columns to entities missing them
-- ============================================================
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS location_id uuid REFERENCES locations(id);
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id);
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS location_id uuid REFERENCES locations(id);
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id);
ALTER TABLE cash_drawer_sessions ADD COLUMN IF NOT EXISTS location_id uuid REFERENCES locations(id);
ALTER TABLE cash_drawer_sessions ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id);

-- ============================================================
-- STEP 2: Backfill existing rows to default location (Main Location)
-- ============================================================
UPDATE reservations SET location_id='f1f830b3-cf15-47e3-a538-01abd8222c6d', organization_id='00000000-0000-0000-0000-000000000001' WHERE location_id IS NULL;
UPDATE shifts SET location_id='f1f830b3-cf15-47e3-a538-01abd8222c6d', organization_id='00000000-0000-0000-0000-000000000001' WHERE location_id IS NULL;
UPDATE cash_drawer_sessions SET location_id='f1f830b3-cf15-47e3-a538-01abd8222c6d', organization_id='00000000-0000-0000-0000-000000000001' WHERE location_id IS NULL;
UPDATE orders SET location_id=COALESCE(location_id,'f1f830b3-cf15-47e3-a538-01abd8222c6d'), organization_id=COALESCE(organization_id,'00000000-0000-0000-0000-000000000001') WHERE location_id IS NULL OR organization_id IS NULL;
UPDATE table_floors SET location_id=COALESCE(location_id,'f1f830b3-cf15-47e3-a538-01abd8222c6d'), organization_id=COALESCE(organization_id,'00000000-0000-0000-0000-000000000001') WHERE location_id IS NULL OR organization_id IS NULL;
UPDATE floors SET location_id=COALESCE(location_id,'f1f830b3-cf15-47e3-a538-01abd8222c6d'), organization_id=COALESCE(organization_id,'00000000-0000-0000-0000-000000000001') WHERE location_id IS NULL OR organization_id IS NULL;

-- ============================================================
-- STEP 3: NOT NULL enforcement on location scope
-- ============================================================
ALTER TABLE orders ALTER COLUMN location_id SET NOT NULL;
ALTER TABLE orders ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE table_floors ALTER COLUMN location_id SET NOT NULL;
ALTER TABLE table_floors ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE floors ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE reservations ALTER COLUMN location_id SET NOT NULL;
ALTER TABLE reservations ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE shifts ALTER COLUMN location_id SET NOT NULL;
ALTER TABLE shifts ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE cash_drawer_sessions ALTER COLUMN location_id SET NOT NULL;
ALTER TABLE cash_drawer_sessions ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE staff ALTER COLUMN organization_id SET NOT NULL;

-- ============================================================
-- STEP 4: Composite FK invariant (cross-org/cross-location block)
--   (organization_id, location_id) -> locations(organization_id, id)
--   guarantees order.organization_id == locations.organization_id
-- ============================================================
CREATE UNIQUE INDEX IF NOT EXISTS locations_org_id_uidx ON locations(organization_id, id);

ALTER TABLE orders ADD CONSTRAINT orders_location_org_invariant
  FOREIGN KEY (organization_id, location_id) REFERENCES locations(organization_id, id);
ALTER TABLE reservations ADD CONSTRAINT reservations_location_org_invariant
  FOREIGN KEY (organization_id, location_id) REFERENCES locations(organization_id, id);
ALTER TABLE shifts ADD CONSTRAINT shifts_location_org_invariant
  FOREIGN KEY (organization_id, location_id) REFERENCES locations(organization_id, id);
ALTER TABLE cash_drawer_sessions ADD CONSTRAINT cash_drawer_sessions_location_org_invariant
  FOREIGN KEY (organization_id, location_id) REFERENCES locations(organization_id, id);
ALTER TABLE table_floors ADD CONSTRAINT table_floors_location_org_invariant
  FOREIGN KEY (organization_id, location_id) REFERENCES locations(organization_id, id);
ALTER TABLE floors ADD CONSTRAINT floors_location_org_invariant
  FOREIGN KEY (organization_id, location_id) REFERENCES locations(organization_id, id);

-- ============================================================
-- STEP 5: Indexes for location-scoped queries
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_reservations_org_loc ON reservations(organization_id, location_id);
CREATE INDEX IF NOT EXISTS idx_shifts_org_loc ON shifts(organization_id, location_id);
CREATE INDEX IF NOT EXISTS idx_cash_drawer_org_loc ON cash_drawer_sessions(organization_id, location_id);
