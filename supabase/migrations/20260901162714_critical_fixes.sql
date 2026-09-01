-- =============================================
-- CRITICAL FIX: separate_tables_v1 RPC
-- =============================================

CREATE OR REPLACE FUNCTION separate_tables_v1(
  p_primary_table_id UUID,
  p_separated_table_id UUID,
  p_order_ids UUID[]
) RETURNS VOID AS $$
BEGIN
  UPDATE orders
  SET table_number = p_separated_table_id
  WHERE id = ANY(p_order_ids);

  UPDATE table_floors
  SET status = 'occupied'
  WHERE id = p_separated_table_id;

  IF NOT EXISTS (
    SELECT 1 FROM orders
    WHERE table_number = p_primary_table_id
      AND status = 'active'
  ) THEN
    UPDATE table_floors
    SET status = 'available'
    WHERE id = p_primary_table_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- CRITICAL FIX: Staff Directory RPCs
-- =============================================

DROP FUNCTION IF EXISTS get_staff_kpis();
DROP FUNCTION IF EXISTS get_staff_directory_v2();
DROP FUNCTION IF EXISTS get_live_shifts();

CREATE OR REPLACE FUNCTION get_staff_kpis()
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'total_staff', (SELECT COUNT(*) FROM staff WHERE is_active = true),
    'active_staff', (SELECT COUNT(*) FROM staff WHERE is_active = true),
    'on_shift', (SELECT COUNT(*) FROM shifts WHERE closed_at IS NULL),
    'off_shift', (SELECT COUNT(*) FROM staff WHERE is_active = true) - (SELECT COUNT(*) FROM shifts WHERE closed_at IS NULL),
    'today_orders', COALESCE((SELECT COUNT(*) FROM orders WHERE DATE(created_at) = CURRENT_DATE), 0),
    'today_revenue', COALESCE((SELECT SUM(total_amount) FROM orders WHERE DATE(created_at) = CURRENT_DATE AND status = 'paid'), 0),
    'open_cash_drawers', COALESCE((SELECT COUNT(*) FROM cash_drawer_sessions WHERE status = 'open'), 0),
    'cash_variance', COALESCE((SELECT SUM(ABS(difference)) FROM shifts WHERE closed_at IS NULL AND difference IS NOT NULL), 0),
    'risk_alerts', COALESCE((SELECT COUNT(*) FROM staff WHERE risk_score > 50 AND is_active = true), 0),
    'labor_cost_today', COALESCE((SELECT SUM(total_labor_cost) FROM labor_summaries WHERE period = CURRENT_DATE), 0),
    'avg_ticket_size', COALESCE((SELECT AVG(total_amount) FROM orders WHERE DATE(created_at) = CURRENT_DATE AND status = 'paid'), 0),
    'high_risk_voids', COALESCE((SELECT COUNT(*) FROM operation_logs WHERE action = 'void' AND DATE(created_at) = CURRENT_DATE), 0)
  ) INTO result;

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP FUNCTION IF EXISTS get_staff_directory_v2();
DROP FUNCTION IF EXISTS get_live_shifts();

CREATE OR REPLACE FUNCTION get_staff_directory_v2()
RETURNS TABLE (
  id UUID,
  name TEXT,
  full_name TEXT,
  email TEXT,
  phone TEXT,
  is_active BOOLEAN,
  hourly_rate DECIMAL,
  role_id UUID,
  role_name TEXT,
  shift TEXT,
  shift_id UUID,
  shift_opened_at TIMESTAMPTZ,
  shift_status TEXT,
  active_shift JSONB,
  expected_cash DECIMAL,
  total_orders INTEGER,
  total_revenue DECIMAL,
  cash_sales DECIMAL,
  card_sales DECIMAL,
  total_voids INTEGER,
  total_refunds DECIMAL,
  total_discounts DECIMAL,
  drawer_variance DECIMAL,
  avg_ticket_value DECIMAL,
  avg_order_value DECIMAL,
  active_tickets INTEGER,
  completed_tickets INTEGER,
  avg_prep_time TEXT,
  late_tickets INTEGER,
  items_prepared INTEGER,
  re_fired INTEGER,
  cancelled_tickets INTEGER,
  waste_count INTEGER,
  active_tables INTEGER,
  tables_served INTEGER,
  guests_served INTEGER,
  total_tips DECIMAL,
  approvals_count INTEGER,
  exceptions_count INTEGER,
  labor_cost_percent DECIMAL,
  labor_efficiency DECIMAL,
  void_refund_approvals INTEGER,
  seated_guests INTEGER,
  avg_wait_time TEXT,
  table_turnover_rate TEXT,
  no_shows INTEGER,
  risk_score INTEGER,
  risk_level TEXT,
  risk_flags TEXT[],
  last_activity TIMESTAMPTZ,
  can_apply_discount BOOLEAN,
  can_void_items BOOLEAN,
  can_open_drawer_without_sale BOOLEAN,
  can_refund BOOLEAN,
  can_view_reports BOOLEAN,
  can_manage_staff BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.id,
    s.name,
    s.full_name,
    s.email,
    s.phone,
    s.is_active,
    s.hourly_rate,
    s.role_id,
    r.name AS role_name,
    s.shift,
    sh.id AS shift_id,
    sh.opened_at AS shift_opened_at,
    CASE WHEN sh.closed_at IS NULL THEN 'active' ELSE 'off' END AS shift_status,
    CASE WHEN sh.closed_at IS NULL THEN
      jsonb_build_object(
        'id', sh.id,
        'opened_at', sh.opened_at,
        'starting_cash', sh.starting_cash,
        'duration_minutes', EXTRACT(EPOCH FROM (NOW() - sh.opened_at)) / 60
      )
    ELSE NULL END AS active_shift,
    s.expected_cash,
    COALESCE(ss.total_orders, 0),
    COALESCE(ss.total_revenue, 0),
    COALESCE(ss.cash_sales, 0),
    COALESCE(ss.card_sales, 0),
    COALESCE(ss.total_voids, 0),
    COALESCE(ss.total_refunds, 0),
    COALESCE(ss.total_discounts, 0),
    COALESCE(s.drawer_variance, 0),
    COALESCE(ss.avg_ticket_value, 0),
    COALESCE(ss.avg_order_value, 0),
    COALESCE(ss.active_tickets, 0),
    COALESCE(ss.completed_tickets, 0),
    ss.avg_prep_time,
    COALESCE(ss.late_tickets, 0),
    COALESCE(ss.items_prepared, 0),
    COALESCE(ss.re_fired, 0),
    COALESCE(ss.cancelled_tickets, 0),
    COALESCE(ss.waste_count, 0),
    COALESCE(ss.active_tables, 0),
    COALESCE(ss.tables_served, 0),
    COALESCE(ss.guests_served, 0),
    COALESCE(ss.total_tips, 0),
    COALESCE(ss.approvals_count, 0),
    COALESCE(ss.exceptions_count, 0),
    COALESCE(ss.labor_cost_percent, 0),
    COALESCE(ss.labor_efficiency, 0),
    COALESCE(ss.void_refund_approvals, 0),
    COALESCE(ss.seated_guests, 0),
    ss.avg_wait_time,
    ss.table_turnover_rate,
    COALESCE(ss.no_shows, 0),
    COALESCE(s.risk_score, 0),
    s.risk_level,
    s.risk_flags,
    s.last_activity,
    s.can_apply_discount,
    s.can_void_items,
    s.can_open_drawer_without_sale,
    s.can_refund,
    s.can_view_reports,
    s.can_manage_staff
  FROM staff s
  LEFT JOIN roles r ON r.id = s.role_id
  LEFT JOIN shifts sh ON sh.staff_id = s.id AND sh.closed_at IS NULL
  LEFT JOIN staff_stats ss ON ss.staff_id = s.id AND ss.period = CURRENT_DATE
  WHERE s.is_active = true
  ORDER BY s.name ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP FUNCTION IF EXISTS get_live_shifts();

CREATE OR REPLACE FUNCTION get_live_shifts()
RETURNS TABLE (
  staff_id UUID,
  staff_name TEXT,
  role_name TEXT,
  shift_id UUID,
  opened_at TIMESTAMPTZ,
  starting_cash DECIMAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.id AS staff_id,
    s.name AS staff_name,
    r.name AS role_name,
    sh.id AS shift_id,
    sh.opened_at,
    sh.starting_cash
  FROM shifts sh
  JOIN staff s ON s.id = sh.staff_id
  LEFT JOIN roles r ON r.id = s.role_id
  WHERE sh.closed_at IS NULL
  ORDER BY sh.opened_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
