-- =====================================================================
-- SAITO ADMIN 1 — LOSS PREVENTION & ANOMALY DETECTION SCHEMA
-- =====================================================================

-- ---------------------------------------------------------------------
-- PRICE OVERRIDES
-- Track when staff enter a price different from catalog price
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.price_overrides (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  order_item_id uuid,
  order_id uuid NOT NULL,
  staff_id uuid NOT NULL,
  product_id uuid,
  catalog_price numeric(12,2) NOT NULL,
  override_price numeric(12,2) NOT NULL,
  variance numeric(12,2) NOT NULL,
  variance_percent numeric(5,2),
  reason text,
  approved_by uuid,
  manager_approved boolean DEFAULT false,
  created_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT price_overrides_pkey PRIMARY KEY (id),
  CONSTRAINT price_overrides_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.staff(id) ON DELETE RESTRICT,
  CONSTRAINT price_overrides_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_price_overrides_staff ON public.price_overrides(staff_id);
CREATE INDEX IF NOT EXISTS idx_price_overrides_order ON public.price_overrides(order_id);
CREATE INDEX IF NOT EXISTS idx_price_overrides_created ON public.price_overrides(created_at);

ALTER TABLE public.price_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY price_overrides_select ON public.price_overrides
  FOR SELECT USING (auth.role() IN ('authenticated', 'service_role'));

CREATE POLICY price_overrides_service_full ON public.price_overrides
  TO service_role USING (true) WITH CHECK (true);

GRANT SELECT ON public.price_overrides TO authenticated, service_role;
GRANT INSERT, UPDATE, DELETE ON public.price_overrides TO service_role;

-- ---------------------------------------------------------------------
-- SECURITY EVENTS
-- Track authentication and security-related events
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.security_events (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  staff_id uuid,
  event_type text NOT NULL,
  success boolean DEFAULT true,
  ip_address text,
  user_agent text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT security_events_pkey PRIMARY KEY (id),
  CONSTRAINT security_events_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.staff(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_security_events_staff ON public.security_events(staff_id);
CREATE INDEX IF NOT EXISTS idx_security_events_type ON public.security_events(event_type);
CREATE INDEX IF NOT EXISTS idx_security_events_created ON public.security_events(created_at);

ALTER TABLE public.security_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY security_events_select ON public.security_events
  FOR SELECT USING (auth.role() IN ('authenticated', 'service_role'));

CREATE POLICY security_events_service_full ON public.security_events
  TO service_role USING (true) WITH CHECK (true);

GRANT SELECT ON public.security_events TO authenticated, service_role;
GRANT INSERT, UPDATE, DELETE ON public.security_events TO service_role;

-- ---------------------------------------------------------------------
-- APPROVAL REQUESTS
-- Centralized manager approval queue
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.approval_requests (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  staff_id uuid NOT NULL,
  action_type text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  amount numeric(12,2),
  reason text,
  old_values jsonb,
  new_values jsonb,
  status text DEFAULT 'pending' NOT NULL,
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT approval_requests_pkey PRIMARY KEY (id),
  CONSTRAINT approval_requests_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.staff(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_approval_requests_staff ON public.approval_requests(staff_id);
CREATE INDEX IF NOT EXISTS idx_approval_requests_status ON public.approval_requests(status);
CREATE INDEX IF NOT EXISTS idx_approval_requests_created ON public.approval_requests(created_at);

ALTER TABLE public.approval_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY approval_requests_select ON public.approval_requests
  FOR SELECT USING (auth.role() IN ('authenticated', 'service_role'));

CREATE POLICY approval_requests_service_full ON public.approval_requests
  TO service_role USING (true) WITH CHECK (true);

GRANT SELECT ON public.approval_requests TO authenticated, service_role;
GRANT INSERT, UPDATE, DELETE ON public.approval_requests TO service_role;

-- ---------------------------------------------------------------------
-- OPERATION_LOG ENHANCEMENTS
-- Ensure operation_logs has the right columns for new event types
-- ---------------------------------------------------------------------
ALTER TABLE public.operation_logs ADD COLUMN IF NOT EXISTS entity_type text;
ALTER TABLE public.operation_logs ADD COLUMN IF NOT EXISTS entity_id uuid;
ALTER TABLE public.operation_logs ADD COLUMN IF NOT EXISTS amount numeric(12,2);
ALTER TABLE public.operation_logs ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;
