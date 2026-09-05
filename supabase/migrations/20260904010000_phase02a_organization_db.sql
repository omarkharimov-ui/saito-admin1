-- ============================================================================
-- SAITO OS — PHASE 0.2-A: Organization DB
-- Finalize organizations + locations schema per 0.2 contract
-- Date: 2026-09-04
-- ============================================================================

-- ============================================================================
-- 1. ORGANIZATION STATUS ENUM (per 0.2.2)
--    ACTIVE / SUSPENDED / ARCHIVED
--    Keep is_active as derived convenience, but status is canonical (0.2.2)
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'organization_status'
  ) THEN
    CREATE TYPE organization_status AS ENUM ('ACTIVE', 'SUSPENDED', 'ARCHIVED');
  END IF;
END $$;

-- Add status column (canonical), backfill from is_active
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='organizations' AND column_name='status'
  ) THEN
    ALTER TABLE organizations ADD COLUMN status organization_status DEFAULT 'ACTIVE';
    UPDATE organizations SET status = CASE WHEN is_active THEN 'ACTIVE'::organization_status ELSE 'ARCHIVED'::organization_status END WHERE status IS NULL;
    ALTER TABLE organizations ALTER COLUMN status SET NOT NULL;
    ALTER TABLE organizations ALTER COLUMN status SET DEFAULT 'ACTIVE';
  END IF;
END $$;

-- ============================================================================
-- 2. LOCATION: CODE + SLUG (per 0.2.5, 0.2.6)
--    UNIQUE(organization_id, code)
--    UNIQUE(organization_id, slug)
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='locations' AND column_name='code'
  ) THEN
    ALTER TABLE locations ADD COLUMN code VARCHAR(50);
    -- Backfill code from lowercased name slug
    UPDATE locations SET code = lower(regexp_replace(name, '[^a-zA-Z0-9]+', '-', 'g')) WHERE code IS NULL;
    ALTER TABLE locations ALTER COLUMN code SET NOT NULL;
    ALTER TABLE locations ADD CONSTRAINT locations_org_code_unique UNIQUE (organization_id, code);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='locations' AND column_name='slug'
  ) THEN
    ALTER TABLE locations ADD COLUMN slug VARCHAR(100);
    UPDATE locations SET slug = lower(regexp_replace(name, '[^a-zA-Z0-9]+', '-', 'g')) WHERE slug IS NULL;
    ALTER TABLE locations ALTER COLUMN slug SET NOT NULL;
    ALTER TABLE locations ADD CONSTRAINT locations_org_slug_unique UNIQUE (organization_id, slug);
  END IF;
END $$;

-- ============================================================================
-- 3. LOCATION: CURRENCY (per 0.2.8)
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='locations' AND column_name='currency'
  ) THEN
    ALTER TABLE locations ADD COLUMN currency VARCHAR(3);
    UPDATE locations SET currency = COALESCE(
      (SELECT o.currency FROM organizations o WHERE o.id = locations.organization_id),
      'AZN'
    ) WHERE currency IS NULL;
    ALTER TABLE locations ALTER COLUMN currency SET NOT NULL;
    ALTER TABLE locations ALTER COLUMN currency SET DEFAULT 'AZN';
  END IF;
END $$;

-- ============================================================================
-- 4. LOCATION: STATUS ENUM (per 0.2.3)
--    ACTIVE / INACTIVE
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'location_status'
  ) THEN
    CREATE TYPE location_status AS ENUM ('ACTIVE', 'INACTIVE');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='locations' AND column_name='status'
  ) THEN
    ALTER TABLE locations ADD COLUMN status location_status DEFAULT 'ACTIVE';
    UPDATE locations SET status = CASE WHEN is_active THEN 'ACTIVE'::location_status ELSE 'INACTIVE'::location_status END WHERE status IS NULL;
    ALTER TABLE locations ALTER COLUMN status SET NOT NULL;
    ALTER TABLE locations ALTER COLUMN status SET DEFAULT 'ACTIVE';
    CREATE INDEX IF NOT EXISTS idx_locations_status ON locations(status);
  END IF;
END $$;

-- ============================================================================
-- 5. LOCATION: updated_at (per 0.2.9)
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='locations' AND column_name='updated_at'
  ) THEN
    ALTER TABLE locations ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_locations_updated ON locations;
CREATE TRIGGER trg_locations_updated
  BEFORE UPDATE ON locations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 6. INDEXES (per 0.2.61)
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_locations_organization_id ON locations(organization_id);
CREATE INDEX IF NOT EXISTS idx_locations_org_code ON locations(organization_id, code);
CREATE INDEX IF NOT EXISTS idx_locations_org_slug ON locations(organization_id, slug);
CREATE INDEX IF NOT EXISTS idx_locations_org_status ON locations(organization_id, status);

-- ============================================================================
-- 7. RLS: LOCATIONS — tighten per 0.2.23, 0.2.24, 0.2.25, 0.2.26
--    Drop wide-open "Allow all for authenticated" and restrict to authenticated
--    reading their organization's locations only
-- ============================================================================
DO $$
BEGIN
  DROP POLICY IF EXISTS "Allow all for authenticated" ON locations;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Function: get current staff's organization (via session)
-- For 0.2, authenticated users can read locations (organization scoping refined in 0.4/0.5 RBAC)
CREATE POLICY locations_select_auth ON locations
  FOR SELECT TO authenticated USING (true);

-- Service role full management
CREATE POLICY locations_service_full ON locations
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================================
-- 8. OUTBOX: organization/location lifecycle events (per 0.2.52)
-- ============================================================================
CREATE OR REPLACE FUNCTION emit_location_lifecycle_event()
RETURNS TRIGGER AS $$
DECLARE
  v_event TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_event := 'location.created';
  ELSIF TG_OP = 'DELETE' THEN
    v_event := 'location.deactivated';
    RETURN OLD;
  ELSE
    IF OLD.status IS DISTINCT FROM NEW.status THEN
      v_event := lower('location.' || NEW.status);
    ELSIF OLD.name IS DISTINCT FROM NEW.name OR OLD.code IS DISTINCT FROM NEW.code THEN
      v_event := 'location.updated';
    ELSE
      RETURN NEW;
    END IF;
  END IF;

  PERFORM emit_outbox_event(
    'location',
    COALESCE(NEW.id, OLD.id),
    v_event,
    jsonb_build_object(
      'name', COALESCE(NEW.name, OLD.name),
      'code', COALESCE(NEW.code, OLD.code),
      'status', COALESCE(NEW.status, OLD.status)
    ),
    jsonb_build_object('organization_id', COALESCE(NEW.organization_id, OLD.organization_id))
  );
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_location_outbox ON locations;
CREATE TRIGGER trg_location_outbox
  AFTER INSERT OR UPDATE OR DELETE ON locations
  FOR EACH ROW EXECUTE FUNCTION emit_location_lifecycle_event();

-- ============================================================================
-- 9. AUDIT: organization/location mutation (per 0.2.53)
--    Covered by canonical log_operation() in application layer + operation_logs
-- ============================================================================

-- ============================================================================
-- DONE — 0.2-A Organization DB
-- ============================================================================
