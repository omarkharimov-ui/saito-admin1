-- Phase 6: Reports Hub Foundation
-- Purpose: Prepare database for /admin/reports/staff-performance
-- Uses existing views and adds missing performance metrics

-- ============================================
-- STEP 1: Verify existing views
-- ============================================
DO $$
DECLARE
  view_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO view_count
  FROM information_schema.views
  WHERE table_schema = 'public'
    AND table_name IN ('v_closed_orders', 'v_daily_revenue', 'v_stock_health', 'v_top_products');
  
  RAISE NOTICE 'Report views found: %', view_count;
END $$;

-- ============================================
-- STEP 2: Create staff performance view if missing
-- ============================================
CREATE OR REPLACE VIEW v_staff_performance AS
SELECT
  s.id AS staff_id,
  s.name AS staff_name,
  r.name AS role,
  COUNT(DISTINCT o.id) AS total_orders,
  COALESCE(SUM(o.total_amount), 0) AS total_revenue,
  COALESCE(SUM(o.tip_amount), 0) AS total_tips,
  COALESCE(AVG(o.total_amount), 0) AS avg_order_value,
  MIN(o.created_at) AS first_order_at,
  MAX(o.created_at) AS last_order_at
FROM staff s
LEFT JOIN roles r ON r.id = s.role_id
LEFT JOIN orders o ON o.created_by = s.id OR o.assigned_to = s.id
WHERE s.is_active = true
GROUP BY s.id, s.name, r.name
ORDER BY total_revenue DESC;

-- ============================================
-- STEP 3: Create daily staff performance view
-- ============================================
CREATE OR REPLACE VIEW v_daily_staff_performance AS
SELECT
  DATE(o.created_at) AS report_date,
  s.id AS staff_id,
  s.name AS staff_name,
  r.name AS role,
  COUNT(DISTINCT o.id) AS order_count,
  COALESCE(SUM(o.total_amount), 0) AS revenue,
  COALESCE(SUM(o.tip_amount), 0) AS tips,
  COALESCE(AVG(o.total_amount), 0) AS avg_order_value
FROM staff s
LEFT JOIN roles r ON r.id = s.role_id
LEFT JOIN orders o ON o.created_by = s.id OR o.assigned_to = s.id
WHERE s.is_active = true
  AND o.created_at >= NOW() - INTERVAL '30 days'
GROUP BY DATE(o.created_at), s.id, s.name, r.name
ORDER BY report_date DESC, revenue DESC;

-- ============================================
-- STEP 4: Indexes for report performance
-- ============================================
CREATE INDEX IF NOT EXISTS idx_orders_created_by ON orders(created_by);
CREATE INDEX IF NOT EXISTS idx_orders_assigned_to ON orders(assigned_to);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_orders_total_amount ON orders(total_amount);

-- ============================================
-- VERIFICATION
-- ============================================
-- SELECT * FROM v_staff_performance;
-- SELECT * FROM v_daily_staff_performance LIMIT 10;
