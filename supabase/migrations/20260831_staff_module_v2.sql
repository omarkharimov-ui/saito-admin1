-- =====================================================================
-- SAITO ADMIN 1 — STAFF MODULE v2: ROLE-AWARE METRICS
-- Applied: 2026-08-31
-- Purpose: Dense operational table with role-specific metrics
-- =====================================================================

-- ---------------------------------------------------------------------
-- get_staff_directory_v2
-- Returns staff list with role-aware metrics for dense table display
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_staff_directory_v2()
RETURNS TABLE (
  id uuid,
  name text,
  full_name text,
  email text,
  phone text,
  is_active boolean,
  hourly_rate numeric,
  shift text,
  role_id uuid,
  role_name text,
  role_is_system boolean,
  shift_id uuid,
  shift_opened_at timestamptz,
  shift_status text,
  -- Role-aware metrics
  total_orders bigint,
  total_revenue numeric,
  cash_handled numeric,
  card_handled numeric,
  discounts_given bigint,
  voids_count bigint,
  refunds_count bigint,
  tables_served bigint,
  guests_served bigint,
  avg_order_value numeric,
  cash_variance numeric,
  risk_level text,
  risk_flags bigint,
  last_activity timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
    s.shift,
    s.role_id,
    r.name AS role_name,
    r.is_system AS role_is_system,
    sh.id AS shift_id,
    sh.opened_at AS shift_opened_at,
    CASE WHEN sh.id IS NOT NULL AND sh.closed_at IS NULL THEN 'active' ELSE 'off' END AS shift_status,
    -- Metrics
    COALESCE(perf.total_orders, 0),
    COALESCE(perf.total_revenue, 0),
    COALESCE(perf.cash_handled, 0),
    COALESCE(perf.card_handled, 0),
    COALESCE(perf.discounts_given, 0),
    COALESCE(perf.voids_count, 0),
    COALESCE(perf.refunds_count, 0),
    COALESCE(perf.tables_served, 0),
    COALESCE(perf.guests_served, 0),
    COALESCE(perf.avg_order_value, 0),
    COALESCE(perf.cash_variance, 0),
    -- Risk calculation
    CASE
      WHEN COALESCE(perf.voids_count, 0) > 5 OR COALESCE(perf.refunds_count, 0) > 3 OR COALESCE(perf.cash_variance, 0) < -50 THEN 'HIGH'
      WHEN COALESCE(perf.voids_count, 0) > 2 OR COALESCE(perf.refunds_count, 0) > 1 OR COALESCE(perf.cash_variance, 0) < -20 THEN 'MEDIUM'
      ELSE 'LOW'
    END AS risk_level,
    COALESCE(risk.flags, 0),
    perf.last_order_at
  FROM staff s
  LEFT JOIN roles r ON r.id = s.role_id
  LEFT JOIN LATERAL (
    SELECT * FROM shifts
    WHERE staff_id = s.id AND closed_at IS NULL
    ORDER BY opened_at DESC
    LIMIT 1
  ) sh ON true
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*) AS total_orders,
      SUM(total_amount) AS total_revenue,
      SUM(cash_amount) AS cash_handled,
      SUM(card_amount) AS card_handled,
      COUNT(*) FILTER (WHERE discount_amount > 0) AS discounts_given,
      COUNT(*) FILTER (WHERE void_reason IS NOT NULL) AS voids_count,
      COUNT(*) FILTER (WHERE refund_amount > 0) AS refunds_count,
      COUNT(DISTINCT table_number) FILTER (WHERE table_number IS NOT NULL) AS tables_served,
      SUM(guest_count) AS guests_served,
      AVG(total_amount) AS avg_order_value,
      0::numeric AS cash_variance,
      MAX(created_at) AS last_order_at
    FROM orders
    WHERE created_by = s.id
      AND status IN ('confirmed', 'paid', 'completed')
  ) perf ON true
  LEFT JOIN LATERAL (
    SELECT COUNT(*) AS flags
    FROM security_events
    WHERE staff_id = s.id
      AND success = false
      AND created_at::date = CURRENT_DATE
  ) risk ON true
  ORDER BY s.name;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_staff_directory_v2() TO authenticated, service_role;


-- ---------------------------------------------------------------------
-- get_staff_detail_v2
-- Returns role-aware detail for staff member
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_staff_detail_v2(p_staff_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_staff staff%ROWTYPE;
  v_role roles%ROWTYPE;
  v_result jsonb;
BEGIN
  SELECT * INTO v_staff FROM staff WHERE id = p_staff_id;
  IF NOT FOUND THEN
    RETURN '{}'::jsonb;
  END IF;

  SELECT * INTO v_role FROM roles WHERE id = v_staff.role_id;

  SELECT jsonb_build_object(
    'id', v_staff.id,
    'name', v_staff.name,
    'full_name', v_staff.full_name,
    'email', v_staff.email,
    'phone', v_staff.phone,
    'is_active', v_staff.is_active,
    'hourly_rate', v_staff.hourly_rate,
    'shift', v_staff.shift,
    'role_id', v_staff.role_id,
    'role_name', v_role.name,
    'role_is_system', v_role.is_system,
    'active_shift', (
      SELECT jsonb_build_object(
        'id', sh.id,
        'opened_at', sh.opened_at,
        'starting_cash', sh.starting_cash,
        'expected_cash', sh.expected_cash,
        'actual_cash', sh.actual_cash,
        'difference', sh.difference
      )
      FROM shifts sh
      WHERE sh.staff_id = p_staff_id AND sh.closed_at IS NULL
      ORDER BY sh.opened_at DESC
      LIMIT 1
    ),
    'today_stats', (
      SELECT jsonb_build_object(
        'orders_count', COUNT(*),
        'revenue', COALESCE(SUM(total_amount), 0),
        'cash_handled', COALESCE(SUM(cash_amount), 0),
        'card_handled', COALESCE(SUM(card_amount), 0),
        'discounts', COUNT(*) FILTER (WHERE discount_amount > 0),
        'voids', COUNT(*) FILTER (WHERE void_reason IS NOT NULL),
        'refunds', COUNT(*) FILTER (WHERE refund_amount > 0),
        'tables_served', COUNT(DISTINCT table_number) FILTER (WHERE table_number IS NOT NULL),
        'guests_served', COALESCE(SUM(guest_count), 0),
        'avg_order_value', COALESCE(AVG(total_amount), 0)
      )
      FROM orders
      WHERE created_by = p_staff_id
        AND created_at::date = CURRENT_DATE
        AND status IN ('confirmed', 'paid', 'completed')
    ),
    'lifetime_stats', (
      SELECT jsonb_build_object(
        'total_orders', COUNT(*),
        'total_revenue', COALESCE(SUM(total_amount), 0),
        'total_tips', COALESCE(SUM(tip_amount), 0),
        'avg_order_value', COALESCE(AVG(total_amount), 0),
        'total_shifts', (SELECT COUNT(*) FROM shifts WHERE staff_id = p_staff_id),
        'total_voids', (SELECT COUNT(*) FROM orders WHERE created_by = p_staff_id AND void_reason IS NOT NULL),
        'total_refunds', (SELECT COUNT(*) FROM orders WHERE created_by = p_staff_id AND refund_amount > 0),
        'total_discounts', (SELECT COUNT(*) FROM orders WHERE created_by = p_staff_id AND discount_amount > 0),
        'first_order', MIN(created_at),
        'last_order', MAX(created_at)
      )
      FROM orders
      WHERE created_by = p_staff_id
        AND status IN ('confirmed', 'paid', 'completed')
    ),
    'recent_shifts', (
      SELECT jsonb_agg(jsonb_build_object(
        'id', sh.id,
        'opened_at', sh.opened_at,
        'closed_at', sh.closed_at,
        'starting_cash', sh.starting_cash,
        'expected_cash', sh.expected_cash,
        'actual_cash', sh.actual_cash,
        'difference', sh.difference,
        'status', CASE WHEN sh.closed_at IS NULL THEN 'active' ELSE 'closed' END
      ) ORDER BY sh.opened_at DESC)
      FROM (
        SELECT * FROM shifts WHERE staff_id = p_staff_id ORDER BY opened_at DESC LIMIT 10
      ) sh
    ),
    'security_summary', (
      SELECT jsonb_build_object(
        'failed_logins', (SELECT COUNT(*) FROM security_events WHERE staff_id = p_staff_id AND success = false AND created_at::date = CURRENT_DATE),
        'total_sessions', (SELECT COUNT(*) FROM sessions WHERE user_id = p_staff_id),
        'active_sessions', (SELECT COUNT(*) FROM sessions WHERE user_id = p_staff_id AND revoked_at IS NULL AND expires_at > now()),
        'last_login', (SELECT MAX(created_at) FROM security_events WHERE staff_id = p_staff_id AND event_type = 'login' AND success = true)
      )
    )
  ) INTO v_result;

  RETURN COALESCE(v_result, '{}'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_staff_detail_v2(uuid) TO authenticated, service_role;


-- ---------------------------------------------------------------------
-- get_staff_activity_v2
-- Forensic timeline for staff member
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_staff_activity_v2(
  p_staff_id uuid,
  p_limit integer DEFAULT 100,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id text,
  event_type text,
  description text,
  details jsonb,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT * FROM (
    -- Security events
    SELECT
      se.id::text,
      se.event_type,
      CASE se.event_type
        WHEN 'login' THEN CASE WHEN se.success THEN 'Successful login' ELSE 'Failed login attempt' END
        WHEN 'permission_denied' THEN 'Permission denied'
        WHEN 'logout' THEN 'Logged out'
        WHEN 'pin_change' THEN 'PIN changed'
        WHEN 'account_disabled' THEN 'Account disabled'
        WHEN 'account_enabled' THEN 'Account enabled'
        ELSE se.event_type
      END,
      jsonb_build_object(
        'success', se.success,
        'ip_address', se.ip_address,
        'metadata', se.metadata
      ),
      se.created_at
    FROM security_events se
    WHERE se.staff_id = p_staff_id

    UNION ALL

    -- Audit logs
    SELECT
      al.id::text,
      al.action,
      CASE
        WHEN al.action LIKE 'status_change:%' THEN 'Status changed: ' || COALESCE(al.old_data->>'status', '?') || ' → ' || COALESCE(al.new_data->>'status', '?')
        WHEN al.action = 'staff_created' THEN 'Account created'
        WHEN al.action = 'staff_updated' THEN 'Profile updated'
        WHEN al.action = 'staff_disabled' THEN 'Account disabled'
        WHEN al.action = 'staff_enabled' THEN 'Account enabled'
        WHEN al.action = 'force_logout' THEN 'Force logged out'
        WHEN al.action = 'shift_closed' THEN 'Shift closed'
        ELSE al.action
      END,
      jsonb_build_object(
        'table_name', al.table_name,
        'old_data', al.old_data,
        'new_data', al.new_data,
        'reason', al.reason,
        'approved_by', al.approved_by
      ),
      al.created_at
    FROM audit_logs al
    WHERE al.performed_by = p_staff_id
       OR al.staff_id = p_staff_id

    UNION ALL

    -- Order events (voids, discounts, refunds)
    SELECT
      o.id::text,
      CASE
        WHEN o.void_reason IS NOT NULL THEN 'void'
        WHEN o.refund_amount > 0 THEN 'refund'
        WHEN o.discount_amount > 0 THEN 'discount'
        ELSE 'order'
      END,
      CASE
        WHEN o.void_reason IS NOT NULL THEN 'Order voided: ' || COALESCE(o.void_reason, 'No reason')
        WHEN o.refund_amount > 0 THEN 'Refund: ₼' || o.refund_amount::text
        WHEN o.discount_amount > 0 THEN 'Discount: ₼' || o.discount_amount::text
        ELSE 'Order #' || COALESCE(o.order_number, '—') || ': ₼' || o.total_amount::text
      END,
      jsonb_build_object(
        'order_id', o.id,
        'table_number', o.table_number,
        'total_amount', o.total_amount,
        'void_reason', o.void_reason,
        'discount_amount', o.discount_amount,
        'refund_amount', o.refund_amount
      ),
      o.created_at
    FROM orders o
    WHERE o.created_by = p_staff_id
      AND (o.void_reason IS NOT NULL OR o.refund_amount > 0 OR o.discount_amount > 0)
  ) combined
  ORDER BY created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_staff_activity_v2(uuid, integer, integer) TO authenticated, service_role;


-- =====================================================================
-- INDEXES for new queries
-- =====================================================================
CREATE INDEX IF NOT EXISTS idx_orders_void_reason ON orders(created_by) WHERE void_reason IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_refund_amount ON orders(created_by) WHERE refund_amount > 0;
CREATE INDEX IF NOT EXISTS idx_orders_discount_amount ON orders(created_by) WHERE discount_amount > 0;
CREATE INDEX IF NOT EXISTS idx_security_events_staff_success ON security_events(staff_id, success, created_at);
