-- =====================================================================
-- SAITO ADMIN 1 — STAFF REPORTS
-- Purpose: Staff performance views with canonical attribution.
--          Runs AFTER schema reconciliation and security foundation.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Canonical attribution rule
-- ---------------------------------------------------------------------
-- For staff performance, each order is attributed to exactly ONE staff:
--   1. If assigned_to IS NOT NULL -> assigned_to
--   2. Else -> created_by
--
-- This prevents double counting when an order has both fields set.
-- Only orders with status IN ('paid','closed') count as revenue.

-- ---------------------------------------------------------------------
-- v_staff_performance
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_staff_performance AS
WITH order_attribution AS (
  SELECT
    CASE
      WHEN o.assigned_to IS NOT NULL THEN o.assigned_to
      ELSE o.created_by
    END AS staff_id,
    o.id AS order_id,
    o.total_amount,
    o.tip_amount,
    o.created_at
  FROM public.orders o
  WHERE o.status IN ('paid', 'closed')
)
SELECT
  s.id AS staff_id,
  s.name AS staff_name,
  r.name AS role,
  COUNT(DISTINCT oa.order_id) AS total_orders,
  COALESCE(SUM(oa.total_amount), 0) AS total_revenue,
  COALESCE(SUM(oa.tip_amount), 0) AS total_tips,
  COALESCE(AVG(oa.total_amount), 0) AS avg_order_value,
  MIN(oa.created_at) AS first_order_at,
  MAX(oa.created_at) AS last_order_at
FROM public.staff s
LEFT JOIN public.roles r ON r.id = s.role_id
LEFT JOIN order_attribution oa ON oa.staff_id = s.id
WHERE s.is_active = true
GROUP BY s.id, s.name, r.name
ORDER BY total_revenue DESC;

-- ---------------------------------------------------------------------
-- v_daily_staff_performance
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_daily_staff_performance AS
WITH order_attribution AS (
  SELECT
    CASE
      WHEN o.assigned_to IS NOT NULL THEN o.assigned_to
      ELSE o.created_by
    END AS staff_id,
    o.id AS order_id,
    o.total_amount,
    o.tip_amount,
    o.created_at
  FROM public.orders o
  WHERE o.status IN ('paid', 'closed')
    AND o.created_at >= NOW() - INTERVAL '30 days'
)
SELECT
  DATE(oa.created_at) AS report_date,
  s.id AS staff_id,
  s.name AS staff_name,
  r.name AS role,
  COUNT(DISTINCT oa.order_id) AS order_count,
  COALESCE(SUM(oa.total_amount), 0) AS revenue,
  COALESCE(SUM(oa.tip_amount), 0) AS tips,
  COALESCE(AVG(oa.total_amount), 0) AS avg_order_value
FROM public.staff s
LEFT JOIN public.roles r ON r.id = s.role_id
LEFT JOIN order_attribution oa ON oa.staff_id = s.id
WHERE s.is_active = true
GROUP BY DATE(oa.created_at), s.id, s.name, r.name
ORDER BY report_date DESC, revenue DESC;

-- ---------------------------------------------------------------------
-- Indexes for report performance
-- ---------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_orders_created_by
  ON public.orders(created_by);

CREATE INDEX IF NOT EXISTS idx_orders_assigned_to
  ON public.orders(assigned_to);

CREATE INDEX IF NOT EXISTS idx_orders_created_at
  ON public.orders(created_at);

CREATE INDEX IF NOT EXISTS idx_orders_status
  ON public.orders(status);

-- ---------------------------------------------------------------------
-- Verification
-- ---------------------------------------------------------------------
DO $$
DECLARE
  v_staff_perf_exists boolean;
  v_daily_perf_exists boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.views
    WHERE table_schema = 'public'
      AND table_name = 'v_staff_performance'
  ) INTO v_staff_perf_exists;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.views
    WHERE table_schema = 'public'
      AND table_name = 'v_daily_staff_performance'
  ) INTO v_daily_perf_exists;

  RAISE NOTICE 'Reports: v_staff_performance=%, v_daily_staff_performance=%',
    v_staff_perf_exists, v_daily_perf_exists;
END $$;
