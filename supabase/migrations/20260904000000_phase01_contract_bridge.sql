-- ============================================================================
-- SAITO OS — PHASE 0.1 CONTRACT BRIDGE
-- Bridges gaps between existing DB and 0.1 Architecture & SSOT Contract
-- Date: 2026-09-04
-- ============================================================================

-- ============================================================================
-- 1. ORGANIZATIONS — Multi-tenant root entity
-- ============================================================================
CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) NOT NULL UNIQUE,
  legal_name VARCHAR(255),
  tax_id VARCHAR(50),
  phone VARCHAR(30),
  email VARCHAR(255),
  address TEXT,
  timezone VARCHAR(50) NOT NULL DEFAULT 'Asia/Baku',
  currency VARCHAR(3) NOT NULL DEFAULT 'AZN',
  logo_url TEXT,
  settings JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed default org for existing data
INSERT INTO organizations (id, name, slug, is_active)
VALUES ('00000000-0000-0000-0000-000000000001', 'Saito Default', 'saito-default', true)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 2. ADD organization_id TO locations (entity ownership per 0.1.5)
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='locations' AND column_name='organization_id'
  ) THEN
    ALTER TABLE locations ADD COLUMN organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
    UPDATE locations SET organization_id = '00000000-0000-0000-0000-000000000001' WHERE organization_id IS NULL;
    ALTER TABLE locations ALTER COLUMN organization_id SET NOT NULL;
    CREATE INDEX idx_locations_organization_id ON locations(organization_id);
  END IF;
END $$;

-- ============================================================================
-- 3. ADD organization_id + location_id TO staff (location-scoped per 0.1.32)
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='staff' AND column_name='organization_id'
  ) THEN
    ALTER TABLE staff ADD COLUMN organization_id UUID REFERENCES organizations(id);
    UPDATE staff SET organization_id = '00000000-0000-0000-0000-000000000001' WHERE organization_id IS NULL;
  END IF;
END $$;

-- ============================================================================
-- 4. OUTBOX EVENTS — DB-event gap prevention per 0.1.24
-- ============================================================================
CREATE TABLE IF NOT EXISTS outbox_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aggregate_type VARCHAR(100) NOT NULL,
  aggregate_id UUID NOT NULL,
  event_type VARCHAR(100) NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  metadata JSONB NOT NULL DEFAULT '{}',
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'dead')),
  retry_count INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 5,
  next_retry_at TIMESTAMPTZ,
  processed_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_outbox_pending ON outbox_events(status, next_retry_at)
  WHERE status IN ('pending', 'processing');
CREATE INDEX idx_outbox_aggregate ON outbox_events(aggregate_type, aggregate_id);

-- ============================================================================
-- 5. CORRELATION + IDEMPOTENCY ON operation_logs (per 0.1.21, 0.1.22)
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='operation_logs' AND column_name='correlation_id'
  ) THEN
    ALTER TABLE operation_logs ADD COLUMN correlation_id UUID;
    ALTER TABLE operation_logs ADD COLUMN idempotency_key TEXT;
    ALTER TABLE operation_logs ADD COLUMN location_id UUID;
    ALTER TABLE operation_logs ADD COLUMN organization_id UUID;
    ALTER TABLE operation_logs ADD COLUMN before_state JSONB;
    ALTER TABLE operation_logs ADD COLUMN after_state JSONB;
    CREATE INDEX idx_operation_logs_correlation ON operation_logs(correlation_id) WHERE correlation_id IS NOT NULL;
    CREATE INDEX idx_operation_logs_idempotency ON operation_logs(idempotency_key) WHERE idempotency_key IS NOT NULL;
  END IF;
END $$;

-- ============================================================================
-- 6. IDEMPOTENCY KEY on order_payments (per 0.1.20)
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='order_payments' AND column_name='idempotency_key'
  ) THEN
    ALTER TABLE order_payments ADD COLUMN idempotency_key TEXT;
    ALTER TABLE order_payments ADD COLUMN correlation_id UUID;
    CREATE UNIQUE INDEX idx_order_payments_idempotency
      ON order_payments(idempotency_key) WHERE idempotency_key IS NOT NULL;
  END IF;
END $$;

-- ============================================================================
-- 7. IDEMPOTENCY + CORRELATION on order_items (per 0.1.20)
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='order_items' AND column_name='idempotency_key'
  ) THEN
    ALTER TABLE order_items ADD COLUMN idempotency_key TEXT;
    ALTER TABLE order_items ADD COLUMN correlation_id UUID;
  END IF;
END $$;

-- ============================================================================
-- 8. ORDERS — add location_id, organization_id, correlation_id (per 0.1.32)
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='orders' AND column_name='location_id'
  ) THEN
    ALTER TABLE orders ADD COLUMN location_id UUID REFERENCES locations(id);
    ALTER TABLE orders ADD COLUMN organization_id UUID REFERENCES organizations(id);
    ALTER TABLE orders ADD COLUMN idempotency_key TEXT;
    ALTER TABLE orders ADD COLUMN correlation_id UUID;
    CREATE INDEX idx_orders_location ON orders(location_id) WHERE location_id IS NOT NULL;
  END IF;
END $$;

-- ============================================================================
-- 9. TABLE_FLOORS — add location_id, organization_id (per 0.1.32)
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='table_floors' AND column_name='location_id'
  ) THEN
    ALTER TABLE table_floors ADD COLUMN location_id UUID REFERENCES locations(id);
    ALTER TABLE table_floors ADD COLUMN organization_id UUID REFERENCES organizations(id);
  END IF;
END $$;

-- ============================================================================
-- 10. LOYALTY — ledger-based system (per 0.1.14)
-- ============================================================================
CREATE TABLE IF NOT EXISTS loyalty_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES organizations(id),
  location_id UUID REFERENCES locations(id),
  points_balance INTEGER NOT NULL DEFAULT 0,
  tier VARCHAR(30) DEFAULT 'standard',
  total_earned INTEGER NOT NULL DEFAULT 0,
  total_redeemed INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(customer_id, organization_id)
);

CREATE TABLE IF NOT EXISTS loyalty_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES loyalty_accounts(id) ON DELETE CASCADE,
  type VARCHAR(30) NOT NULL
    CHECK (type IN ('earn', 'redeem', 'adjustment', 'expire', 'reversal')),
  points INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  reference_type VARCHAR(50),
  reference_id UUID,
  reason TEXT,
  performed_by UUID REFERENCES staff(id),
  correlation_id UUID,
  idempotency_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_loyalty_idempotency
  ON loyalty_transactions(idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX idx_loyalty_account ON loyalty_transactions(account_id, created_at DESC);

-- ============================================================================
-- 11. GIFT CARD LEDGER (per 0.1.15)
-- ============================================================================
CREATE TABLE IF NOT EXISTS gift_card_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gift_card_id UUID NOT NULL REFERENCES gift_cards(id) ON DELETE CASCADE,
  type VARCHAR(30) NOT NULL
    CHECK (type IN ('issue', 'load', 'redeem', 'refund', 'adjustment', 'reversal')),
  amount NUMERIC(12,2) NOT NULL,
  balance_after NUMERIC(12,2) NOT NULL,
  reference_type VARCHAR(50),
  reference_id UUID,
  reason TEXT,
  performed_by UUID REFERENCES staff(id),
  correlation_id UUID,
  idempotency_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_gift_card_ledger_idempotency
  ON gift_card_ledger(idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX idx_gift_card_ledger_card ON gift_card_ledger(gift_card_id, created_at DESC);

-- ============================================================================
-- 12. PRINT JOBS (per 0.1.29 — device failure independent of business)
-- ============================================================================
CREATE TABLE IF NOT EXISTS print_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  correlation_id UUID,
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  job_type VARCHAR(50) NOT NULL DEFAULT 'order',
  target_printer VARCHAR(100),
  payload JSONB NOT NULL DEFAULT '{}',
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'completed', 'failed', 'cancelled')),
  error_message TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_print_jobs_pending ON print_jobs(status, created_at)
  WHERE status = 'pending';

-- ============================================================================
-- 13. FLOORS entity (separate from table_floors — per 0.1.33)
-- ============================================================================
CREATE TABLE IF NOT EXISTS floors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES organizations(id),
  name VARCHAR(100) NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(location_id, name)
);

-- ============================================================================
-- 14. WEBHOOK EVENTS (per 0.1.28)
-- ============================================================================
CREATE TABLE IF NOT EXISTS webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  correlation_id UUID,
  event_type VARCHAR(100) NOT NULL,
  source VARCHAR(50) NOT NULL DEFAULT 'saito',
  payload JSONB NOT NULL DEFAULT '{}',
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'failed', 'dead')),
  target_url TEXT,
  response_status INTEGER,
  retry_count INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 3,
  next_retry_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ
);

-- ============================================================================
-- 15. ACCOUNT AUDIT IMMUTABILITY — prevent UPDATE/DELETE on audit via trigger
-- ============================================================================
CREATE OR REPLACE FUNCTION prevent_audit_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Audit records cannot be updated or deleted (0.1.23)';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_audit_update ON operation_logs;
CREATE TRIGGER trg_prevent_audit_update
  BEFORE UPDATE OR DELETE ON operation_logs
  FOR EACH ROW
  EXECUTE FUNCTION prevent_audit_mutation();

DROP TRIGGER IF EXISTS trg_prevent_audit_canonical_update ON audit_logs_canonical;
CREATE TRIGGER trg_prevent_audit_canonical_update
  BEFORE UPDATE OR DELETE ON audit_logs_canonical
  FOR EACH ROW
  EXECUTE FUNCTION prevent_audit_mutation();

-- ============================================================================
-- 16. CONSISTENT UPDATED_AT TRIGGER
-- ============================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to new tables
DROP TRIGGER IF EXISTS trg_organizations_updated ON organizations;
CREATE TRIGGER trg_organizations_updated
  BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_loyalty_accounts_updated ON loyalty_accounts;
CREATE TRIGGER trg_loyalty_accounts_updated
  BEFORE UPDATE ON loyalty_accounts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_floors_updated ON floors;
CREATE TRIGGER trg_floors_updated
  BEFORE UPDATE ON floors
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 17. RLS ENABLE — per 0.1.54 (RLS is last line of defense)
-- ============================================================================
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE outbox_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE loyalty_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE loyalty_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE gift_card_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE print_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE floors ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;

-- Service role full access (server-side operations only per 0.1.51)
DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    'organizations','outbox_events','loyalty_accounts','loyalty_transactions',
    'gift_card_ledger','print_jobs','floors','webhook_events'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format(
      'CREATE POLICY service_full_%s ON %s FOR ALL TO service_role USING (true) WITH CHECK (true)',
      t, t
    );
  END LOOP;
END $$;

-- Authenticated read policies
CREATE POLICY org_select_auth ON organizations
  FOR SELECT TO authenticated USING (true);

CREATE POLICY floors_select_auth ON floors
  FOR SELECT TO authenticated USING (true);

-- ============================================================================
-- 18. OUTBOX HELPER FUNCTION (per 0.1.24)
-- ============================================================================
CREATE OR REPLACE FUNCTION emit_outbox_event(
  p_aggregate_type TEXT,
  p_aggregate_id UUID,
  p_event_type TEXT,
  p_payload JSONB DEFAULT '{}',
  p_metadata JSONB DEFAULT '{}'
) RETURNS UUID AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO outbox_events (aggregate_type, aggregate_id, event_type, payload, metadata)
  VALUES (p_aggregate_type, p_aggregate_id, p_event_type, p_payload, p_metadata)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================================
-- 19. AUDIT LOGGING HELPER (per 0.1.22)
-- ============================================================================
CREATE OR REPLACE FUNCTION log_operation_canonical(
  p_operation TEXT,
  p_actor_staff_id UUID,
  p_location_id UUID,
  p_entity_type TEXT,
  p_entity_id UUID,
  p_before_state JSONB DEFAULT NULL,
  p_after_state JSONB DEFAULT NULL,
  p_reason TEXT DEFAULT NULL,
  p_correlation_id UUID DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'
) RETURNS UUID AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO operation_logs (
    operation, performed_by, location_id, entity_type, entity_id,
    old_state, new_state, reason, correlation_id, idempotency_key, metadata
  ) VALUES (
    p_operation, p_actor_staff_id, p_location_id, p_entity_type, p_entity_id,
    COALESCE(p_before_state, '{}'::jsonb), COALESCE(p_after_state, '{}'::jsonb),
    p_reason, p_correlation_id, p_idempotency_key, p_metadata
  ) RETURNING id INTO v_id;
  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================================
-- 20. IDEMPOTENCY CHECK HELPER (per 0.1.20)
-- ============================================================================
CREATE OR REPLACE FUNCTION check_idempotency(
  p_key TEXT,
  p_table_name TEXT DEFAULT 'operation_logs'
) RETURNS BOOLEAN AS $$
DECLARE
  v_exists BOOLEAN;
BEGIN
  IF p_key IS NULL THEN
    RETURN false;
  END IF;
  EXECUTE format(
    'SELECT EXISTS(SELECT 1 FROM %I WHERE idempotency_key = $1 LIMIT 1)',
    p_table_name
  ) INTO v_exists USING p_key;
  RETURN v_exists;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================================
-- DONE — 0.1 Contract Bridge complete
-- ============================================================================
