-- =====================================================================
-- SAITO ADMIN 1 — STAFF & SHIFTS MODULE RPCs
-- Applied: 2026-08-31
-- Purpose: Complete backend for Staff Directory + Shifts management
-- =====================================================================

-- ---------------------------------------------------------------------
-- get_staff_directory
-- Returns all staff with role info, active shift, and quick KPIs
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_staff_directory()
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
  terminal_id uuid,
  terminal_name text,
  total_orders bigint,
  total_revenue numeric,
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
    NULL::uuid AS terminal_id,
    NULL::text AS terminal_name,
    COALESCE(perf.total_orders, 0) AS total_orders,
    COALESCE(perf.total_revenue, 0) AS total_revenue,
    perf.last_order_at AS last_activity
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
      MAX(created_at) AS last_order_at
    FROM orders
    WHERE created_by = s.id
      AND status IN ('confirmed', 'paid', 'completed')
  ) perf ON true
  ORDER BY s.name;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_staff_directory() TO authenticated, service_role;


-- ---------------------------------------------------------------------
-- get_staff_detail
-- Returns detailed info for a single staff member
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_staff_detail(p_staff_id uuid)
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
  permissions jsonb,
  active_shift jsonb,
  today_stats jsonb,
  lifetime_stats jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_staff staff%ROWTYPE;
  v_role roles%ROWTYPE;
  v_shift jsonb;
  v_today jsonb;
  v_lifetime jsonb;
  v_perms jsonb;
BEGIN
  -- Get staff
  SELECT * INTO v_staff FROM staff WHERE id = p_staff_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Get role
  SELECT * INTO v_role FROM roles WHERE id = v_staff.role_id;

  -- Get permissions
  SELECT jsonb_agg(jsonb_build_object(
    'key', p.key,
    'description', p.description,
    'category', p.category
  )) INTO v_perms
  FROM role_permissions rp
  JOIN permissions p ON p.key = rp.permission_key
  WHERE rp.role_id = v_staff.role_id;

  -- Get active shift
  SELECT jsonb_build_object(
    'id', sh.id,
    'opened_at', sh.opened_at,
    'starting_cash', sh.starting_cash,
    'expected_cash', sh.expected_cash,
    'terminal', NULL,
    'register', NULL
  ) INTO v_shift
  FROM shifts sh
  WHERE sh.staff_id = p_staff_id AND sh.closed_at IS NULL
  ORDER BY sh.opened_at DESC
  LIMIT 1;

  -- Today stats
  SELECT jsonb_build_object(
    'orders_count', COUNT(*),
    'revenue', COALESCE(SUM(total_amount), 0),
    'tips', COALESCE(SUM(tip_amount), 0),
    'voids', COUNT(*) FILTER (WHERE void_reason IS NOT NULL),
    'discounts', COUNT(*) FILTER (WHERE discount_amount > 0),
    'refunds', COUNT(*) FILTER (WHERE refund_amount > 0),
    'cash_sales', COALESCE(SUM(cash_amount), 0),
    'card_sales', COALESCE(SUM(card_amount), 0)
  ) INTO v_today
  FROM orders
  WHERE created_by = p_staff_id
    AND created_at::date = CURRENT_DATE
    AND status IN ('confirmed', 'paid', 'completed');

  -- Lifetime stats
  SELECT jsonb_build_object(
    'total_orders', COUNT(*),
    'total_revenue', COALESCE(SUM(total_amount), 0),
    'total_tips', COALESCE(SUM(tip_amount), 0),
    'avg_order_value', COALESCE(AVG(total_amount), 0),
    'first_order', MIN(created_at),
    'last_order', MAX(created_at),
    'total_shifts', (SELECT COUNT(*) FROM shifts WHERE staff_id = p_staff_id),
    'total_voids', (SELECT COUNT(*) FROM orders WHERE created_by = p_staff_id AND void_reason IS NOT NULL),
    'total_refunds', (SELECT COUNT(*) FROM orders WHERE created_by = p_staff_id AND refund_amount > 0)
  ) INTO v_lifetime
  FROM orders
  WHERE created_by = p_staff_id
    AND status IN ('confirmed', 'paid', 'completed');

  RETURN QUERY
  SELECT
    v_staff.id,
    v_staff.name,
    v_staff.full_name,
    v_staff.email,
    v_staff.phone,
    v_staff.is_active,
    v_staff.hourly_rate,
    v_staff.shift,
    v_staff.role_id,
    v_role.name,
    v_role.is_system,
    COALESCE(v_perms, '[]'::jsonb),
    COALESCE(v_shift, '{}'::jsonb),
    COALESCE(v_today, '{}'::jsonb),
    COALESCE(v_lifetime, '{}'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_staff_detail(uuid) TO authenticated, service_role;


-- ---------------------------------------------------------------------
-- get_staff_activity
-- Returns activity timeline for a staff member
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_staff_activity(
  p_staff_id uuid,
  p_limit integer DEFAULT 50,
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
    -- Audit logs
    SELECT
      al.id::text,
      al.action AS event_type,
      CASE al.action
        WHEN 'clock_in' THEN 'Started shift'
        WHEN 'clock_out' THEN 'Ended shift'
        WHEN 'order_created' THEN 'Created order'
        WHEN 'payment_received' THEN 'Processed payment'
        WHEN 'void' THEN 'Voided item'
        WHEN 'refund' THEN 'Processed refund'
        WHEN 'discount' THEN 'Applied discount'
        WHEN 'login' THEN 'Logged in'
        WHEN 'permission_denied' THEN 'Permission denied'
        ELSE al.action
      END AS description,
      jsonb_build_object(
        'table_name', al.table_name,
        'record_id', al.record_id,
        'old_data', al.old_data,
        'new_data', al.new_data,
        'reason', al.reason,
        'approved_by', al.approved_by
      ) AS details,
      al.created_at
    FROM audit_logs al
    WHERE al.performed_by = p_staff_id
       OR al.staff_id = p_staff_id

    UNION ALL

    -- Security events
    SELECT
      se.id::text,
      se.event_type,
      CASE se.event_type
        WHEN 'login' THEN 'Successful login'
        WHEN 'permission_denied' THEN 'Permission denied'
        ELSE se.event_type
      END,
      jsonb_build_object(
        'success', se.success,
        'ip_address', se.ip_address,
        'user_agent', se.user_agent,
        'metadata', se.metadata
      ),
      se.created_at
    FROM security_events se
    WHERE se.staff_id = p_staff_id

    UNION ALL

    -- Order events
    SELECT
      oe.id::text,
      oe.event_type,
      'Order ' || oe.event_type || ': ' || COALESCE(oe.new_value, ''),
      jsonb_build_object(
        'order_id', oe.order_id,
        'old_value', oe.old_value,
        'new_value', oe.new_value,
        'employee_name', oe.employee_name
      ),
      oe.created_at
    FROM order_events oe
    WHERE oe.performed_by = p_staff_id
  ) combined
  ORDER BY created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_staff_activity(uuid, integer, integer) TO authenticated, service_role;


-- ---------------------------------------------------------------------
-- get_live_shifts
-- Returns all active shifts with staff and cash drawer info
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_live_shifts()
RETURNS TABLE (
  shift_id uuid,
  staff_id uuid,
  staff_name text,
  staff_role text,
  opened_at timestamptz,
  duration interval,
  terminal_name text,
  register_name text,
  starting_cash numeric,
  expected_cash numeric,
  cash_drawer_session_id uuid,
  drawer_status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT
    sh.id AS shift_id,
    s.id AS staff_id,
    s.name AS staff_name,
    r.name AS staff_role,
    sh.opened_at,
    now() - sh.opened_at AS duration,
    NULL::text AS terminal_name,
    NULL::text AS register_name,
    sh.starting_cash,
    sh.expected_cash,
    cds.id AS cash_drawer_session_id,
    cds.status AS drawer_status
  FROM shifts sh
  JOIN staff s ON s.id = sh.staff_id
  LEFT JOIN roles r ON r.id = s.role_id
  LEFT JOIN cash_drawer_sessions cds ON cds.opened_by = s.id AND cds.closed_at IS NULL
  WHERE sh.closed_at IS NULL
  ORDER BY sh.opened_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_live_shifts() TO authenticated, service_role;


-- ---------------------------------------------------------------------
-- get_staff_permissions
-- Returns effective permissions for a staff member
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_staff_permissions(p_staff_id uuid)
RETURNS TABLE (
  permission_key text,
  permission_description text,
  permission_category text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_role_id uuid;
BEGIN
  SELECT role_id INTO v_role_id FROM staff WHERE id = p_staff_id;
  IF v_role_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT p.key, p.description, p.category
  FROM role_permissions rp
  JOIN permissions p ON p.key = rp.permission_key
  WHERE rp.role_id = v_role_id
  ORDER BY p.category, p.key;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_staff_permissions(uuid) TO authenticated, service_role;


-- ---------------------------------------------------------------------
-- create_staff_atomic
-- Creates staff member with validation and audit
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_staff_atomic(
  p_name text,
  p_full_name text DEFAULT NULL,
  p_email text DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_role_id uuid DEFAULT NULL,
  p_pin_hash text DEFAULT NULL,
  p_hourly_rate numeric DEFAULT NULL,
  p_shift text DEFAULT NULL,
  p_station_id uuid DEFAULT NULL,
  p_is_active boolean DEFAULT true,
  p_performed_by uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_staff_id uuid;
  v_role_exists boolean;
BEGIN
  -- Validate role
  IF p_role_id IS NOT NULL THEN
    SELECT EXISTS(SELECT 1 FROM roles WHERE id = p_role_id) INTO v_role_exists;
    IF NOT v_role_exists THEN
      RETURN jsonb_build_object('success', false, 'error', 'ROLE_NOT_FOUND');
    END IF;
  END IF;

  -- Create staff
  INSERT INTO staff (name, full_name, email, phone, role_id, pin_hash, hourly_rate, shift, station_id, is_active)
  VALUES (p_name, p_full_name, p_email, p_phone, p_role_id, p_pin_hash, p_hourly_rate, p_shift, p_station_id, p_is_active)
  RETURNING id INTO v_staff_id;

  -- Audit
  PERFORM log_audit(
    'staff_created', 'staff', v_staff_id::text, p_performed_by,
    NULL,
    jsonb_build_object(
      'name', p_name,
      'role_id', p_role_id,
      'is_active', p_is_active
    ),
    NULL, NULL, NULL
  );

  RETURN jsonb_build_object(
    'success', true,
    'staff_id', v_staff_id,
    'name', p_name
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_staff_atomic(text, text, text, text, uuid, text, numeric, text, uuid, boolean, uuid) TO authenticated, service_role;


-- ---------------------------------------------------------------------
-- update_staff_atomic
-- Updates staff member fields atomically
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_staff_atomic(
  p_staff_id uuid,
  p_name text DEFAULT NULL,
  p_full_name text DEFAULT NULL,
  p_email text DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_role_id uuid DEFAULT NULL,
  p_pin_hash text DEFAULT NULL,
  p_hourly_rate numeric DEFAULT NULL,
  p_shift text DEFAULT NULL,
  p_station_id uuid DEFAULT NULL,
  p_performed_by uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_old staff%ROWTYPE;
BEGIN
  SELECT * INTO v_old FROM staff WHERE id = p_staff_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'STAFF_NOT_FOUND');
  END IF;

  UPDATE staff SET
    name = COALESCE(p_name, name),
    full_name = COALESCE(p_full_name, full_name),
    email = COALESCE(p_email, email),
    phone = COALESCE(p_phone, phone),
    role_id = COALESCE(p_role_id, role_id),
    pin_hash = COALESCE(p_pin_hash, pin_hash),
    hourly_rate = COALESCE(p_hourly_rate, hourly_rate),
    shift = COALESCE(p_shift, shift),
    station_id = COALESCE(p_station_id, station_id)
  WHERE id = p_staff_id;

  PERFORM log_audit(
    'staff_updated', 'staff', p_staff_id::text, p_performed_by,
    jsonb_build_object(
      'name', v_old.name, 'role_id', v_old.role_id, 'is_active', v_old.is_active
    ),
    jsonb_build_object(
      'name', COALESCE(p_name, v_old.name),
      'role_id', COALESCE(p_role_id, v_old.role_id)
    ),
    NULL, NULL, NULL
  );

  RETURN jsonb_build_object('success', true, 'staff_id', p_staff_id);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_staff_atomic(uuid, text, text, text, text, uuid, text, numeric, text, uuid, uuid) TO authenticated, service_role;


-- ---------------------------------------------------------------------
-- toggle_staff_active
-- Enable/disable staff account
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.toggle_staff_active(
  p_staff_id uuid,
  p_is_active boolean,
  p_performed_by uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_staff staff%ROWTYPE;
BEGIN
  SELECT * INTO v_staff FROM staff WHERE id = p_staff_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'STAFF_NOT_FOUND');
  END IF;

  UPDATE staff SET is_active = p_is_active WHERE id = p_staff_id;

  IF NOT p_is_active THEN
    UPDATE sessions SET revoked_at = now() WHERE user_id = p_staff_id AND revoked_at IS NULL;
  END IF;

  PERFORM log_audit(
    CASE WHEN p_is_active THEN 'staff_enabled' ELSE 'staff_disabled' END,
    'staff', p_staff_id::text, p_performed_by,
    jsonb_build_object('is_active', v_staff.is_active),
    jsonb_build_object('is_active', p_is_active),
    NULL, NULL, NULL
  );

  RETURN jsonb_build_object(
    'success', true,
    'staff_id', p_staff_id,
    'is_active', p_is_active
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.toggle_staff_active(uuid, boolean, uuid) TO authenticated, service_role;


-- ---------------------------------------------------------------------
-- force_logout_staff
-- Revoke all sessions for a staff member
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.force_logout_staff(
  p_staff_id uuid,
  p_performed_by uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE sessions SET revoked_at = now()
  WHERE user_id = p_staff_id AND revoked_at IS NULL;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  PERFORM log_audit(
    'force_logout', 'staff', p_staff_id::text, p_performed_by,
    jsonb_build_object('sessions_revoked', v_count),
    NULL, NULL, NULL, NULL
  );

  RETURN jsonb_build_object(
    'success', true,
    'staff_id', p_staff_id,
    'sessions_revoked', v_count
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.force_logout_staff(uuid, uuid) TO authenticated, service_role;


-- ---------------------------------------------------------------------
-- close_shift_atomic
-- Close shift with cash reconciliation
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.close_shift_atomic(
  p_shift_id uuid,
  p_actual_cash numeric,
  p_reason text DEFAULT NULL,
  p_performed_by uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_shift shifts%ROWTYPE;
  v_expected numeric;
  v_difference numeric;
  v_requires_review boolean;
BEGIN
  SELECT * INTO v_shift FROM shifts WHERE id = p_shift_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'SHIFT_NOT_FOUND');
  END IF;

  IF v_shift.closed_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'SHIFT_ALREADY_CLOSED');
  END IF;

  -- Calculate expected cash
  v_expected := COALESCE(v_shift.starting_cash, 0) + COALESCE(v_shift.expected_cash, 0);
  v_difference := p_actual_cash - v_expected;
  v_requires_review := ABS(v_difference) > 10;

  -- Close shift
  UPDATE shifts SET
    closed_at = now(),
    actual_cash = p_actual_cash,
    expected_cash = v_expected,
    difference = v_difference,
    notes = COALESCE(notes, '') || COALESCE(' | Close: ' || p_reason, ''),
    updated_at = now()
  WHERE id = p_shift_id;

  -- Audit
  PERFORM log_audit(
    'shift_closed', 'shifts', p_shift_id::text, p_performed_by,
    jsonb_build_object(
      'starting_cash', v_shift.starting_cash,
      'expected', v_expected
    ),
    jsonb_build_object(
      'actual_cash', p_actual_cash,
      'difference', v_difference,
      'requires_review', v_requires_review
    ),
    NULL, NULL, NULL
  );

  RETURN jsonb_build_object(
    'success', true,
    'shift_id', p_shift_id,
    'expected_cash', v_expected,
    'actual_cash', p_actual_cash,
    'difference', v_difference,
    'requires_review', v_requires_review
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.close_shift_atomic(uuid, numeric, text, uuid) TO authenticated, service_role;


-- ---------------------------------------------------------------------
-- get_staff_kpis
-- Returns aggregate KPIs for staff dashboard
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_staff_kpis()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'total_staff', (SELECT COUNT(*) FROM staff),
    'active_staff', (SELECT COUNT(*) FROM staff WHERE is_active = true),
    'on_shift', (SELECT COUNT(DISTINCT staff_id) FROM shifts WHERE closed_at IS NULL),
    'off_shift', (SELECT COUNT(*) FROM staff WHERE is_active = true) - (SELECT COUNT(DISTINCT staff_id) FROM shifts WHERE closed_at IS NULL),
    'today_orders', (SELECT COUNT(*) FROM orders WHERE created_at::date = CURRENT_DATE),
    'today_revenue', (SELECT COALESCE(SUM(total_amount), 0) FROM orders WHERE created_at::date = CURRENT_DATE AND status IN ('confirmed', 'paid', 'completed')),
    'open_cash_drawers', (SELECT COUNT(*) FROM cash_drawer_sessions WHERE closed_at IS NULL),
    'cash_variance', (SELECT COALESCE(SUM(difference), 0) FROM cash_drawer_sessions WHERE closed_at IS NOT NULL AND created_at::date = CURRENT_DATE),
    'risk_alerts', (SELECT COUNT(*) FROM security_events WHERE success = false AND created_at::date = CURRENT_DATE)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_staff_kpis() TO authenticated, service_role;


-- ---------------------------------------------------------------------
-- get_shift_detail
-- Returns full shift details with orders and cash info
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_shift_detail(p_shift_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'shift', jsonb_build_object(
      'id', sh.id,
      'staff_id', sh.staff_id,
      'staff_name', s.name,
      'role', r.name,
      'opened_at', sh.opened_at,
      'closed_at', sh.closed_at,
      'starting_cash', sh.starting_cash,
      'expected_cash', sh.expected_cash,
      'actual_cash', sh.actual_cash,
      'difference', sh.difference,
      'notes', sh.notes
    ),
    'orders', (
      SELECT jsonb_agg(jsonb_build_object(
        'id', o.id,
        'order_number', o.order_number,
        'total', o.total_amount,
        'status', o.status,
        'created_at', o.created_at,
        'payment_method', o.payment_method
      ) ORDER BY o.created_at)
      FROM orders o
      WHERE o.created_by = sh.staff_id
        AND o.created_at >= sh.opened_at
        AND (sh.closed_at IS NULL OR o.created_at <= sh.closed_at)
    ),
    'cash_drawer', (
      SELECT jsonb_build_object(
        'session_id', cds.id,
        'opening_balance', cds.opening_balance,
        'closing_balance', cds.closing_balance,
        'expected_balance', cds.expected_balance,
        'difference', cds.difference,
        'status', cds.status
      )
      FROM cash_drawer_sessions cds
      WHERE cds.opened_by = sh.staff_id
        AND cds.opened_at >= sh.opened_at
        AND (sh.closed_at IS NULL OR cds.opened_at <= sh.closed_at)
      ORDER BY cds.opened_at DESC
      LIMIT 1
    ),
    'audit_events', (
      SELECT jsonb_agg(jsonb_build_object(
        'action', al.action,
        'created_at', al.created_at,
        'details', al.details
      ) ORDER BY al.created_at)
      FROM audit_logs al
      WHERE al.performed_by = sh.staff_id
        AND al.created_at >= sh.opened_at
        AND (sh.closed_at IS NULL OR al.created_at <= sh.closed_at)
    )
  ) INTO v_result
  FROM shifts sh
  JOIN staff s ON s.id = sh.staff_id
  LEFT JOIN roles r ON r.id = s.role_id
  WHERE sh.id = p_shift_id;

  RETURN COALESCE(v_result, '{}'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_shift_detail(uuid) TO authenticated, service_role;


-- =====================================================================
-- INDEXES for performance
-- =====================================================================
CREATE INDEX IF NOT EXISTS idx_staff_role_id ON staff(role_id);
CREATE INDEX IF NOT EXISTS idx_staff_is_active ON staff(is_active);
CREATE INDEX IF NOT EXISTS idx_shifts_staff_id ON shifts(staff_id);
CREATE INDEX IF NOT EXISTS idx_shifts_closed_at ON shifts(closed_at);
CREATE INDEX IF NOT EXISTS idx_shifts_opened_at ON shifts(opened_at);
CREATE INDEX IF NOT EXISTS idx_orders_created_by ON orders(created_by);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_performed_by ON audit_logs(performed_by);
CREATE INDEX IF NOT EXISTS idx_security_events_staff_id ON security_events(staff_id);
