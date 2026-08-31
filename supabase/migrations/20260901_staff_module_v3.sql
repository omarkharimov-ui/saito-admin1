-- =====================================================================
-- SAITO ADMIN 1 — STAFF MODULE V3: ROLE-SPECIFIC METRICS & ENTERPRISE FEATURES
-- Applied: 2026-09-01
-- Purpose: Toast POS-level staff management with role-based analytics
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. EXTEND STAFF TABLE - Pay Structure & Enterprise Fields
-- ---------------------------------------------------------------------
ALTER TABLE staff
  ADD COLUMN IF NOT EXISTS overtime_rate numeric DEFAULT 1.5,
  ADD COLUMN IF NOT EXISTS base_monthly_salary numeric DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS max_weekly_hours integer DEFAULT 40,
  ADD COLUMN IF NOT EXISTS can_apply_discount boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_void_items boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_open_drawer_without_sale boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_refund boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_view_reports boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_manage_staff boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS break_start timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS break_end timestamptz DEFAULT NULL;

-- ---------------------------------------------------------------------
-- 2. SHIFT BREAKS TABLE - Track break times
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS shift_breaks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id uuid NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
  staff_id uuid NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  break_type text NOT NULL DEFAULT 'meal', -- meal, rest, personal
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz DEFAULT NULL,
  duration interval GENERATED ALWAYS AS (ended_at - started_at) STORED,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shift_breaks_shift_id ON shift_breaks(shift_id);
CREATE INDEX IF NOT EXISTS idx_shift_breaks_staff_id ON shift_breaks(staff_id);

-- ---------------------------------------------------------------------
-- 3. STAFF METRICS CACHE - Pre-calculated role-specific metrics
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS staff_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  metric_date date NOT NULL DEFAULT CURRENT_DATE,
  -- Kitchen metrics
  active_tickets integer DEFAULT 0,
  completed_tickets integer DEFAULT 0,
  avg_prep_time interval DEFAULT NULL,
  late_tickets integer DEFAULT 0,
  cancelled_tickets integer DEFAULT 0,
  -- Waiter metrics
  active_tables integer DEFAULT 0,
  tables_served integer DEFAULT 0,
  guests_served integer DEFAULT 0,
  avg_table_turnaround interval DEFAULT NULL,
  total_tips numeric DEFAULT 0,
  avg_ticket_size numeric DEFAULT 0,
  -- Cashier/Bartender metrics
  cash_sales numeric DEFAULT 0,
  card_sales numeric DEFAULT 0,
  total_voids integer DEFAULT 0,
  total_discounts numeric DEFAULT 0,
  total_refunds numeric DEFAULT 0,
  drawer_variance numeric DEFAULT 0,
  -- Common
  total_orders integer DEFAULT 0,
  total_revenue numeric DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(staff_id, metric_date)
);

CREATE INDEX IF NOT EXISTS idx_staff_metrics_staff_date ON staff_metrics(staff_id, metric_date);
CREATE INDEX IF NOT EXISTS idx_staff_metrics_date ON staff_metrics(metric_date);

-- ---------------------------------------------------------------------
-- 4. RPC: get_staff_directory_v2 - Enhanced with role-specific metrics
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
  overtime_rate numeric,
  base_monthly_salary numeric,
  max_weekly_hours integer,
  shift text,
  role_id uuid,
  role_name text,
  role_is_system boolean,
  shift_id uuid,
  shift_opened_at timestamptz,
  shift_status text,
  shift_duration interval,
  -- Permissions
  can_apply_discount boolean,
  can_void_items boolean,
  can_open_drawer_without_sale boolean,
  can_refund boolean,
  can_view_reports boolean,
  can_manage_staff boolean,
  -- Common metrics
  total_orders bigint,
  total_revenue numeric,
  cash_sales numeric,
  card_sales numeric,
  total_voids bigint,
  total_discounts numeric,
  total_refunds numeric,
  drawer_variance numeric,
  -- Kitchen-specific
  active_tickets bigint,
  completed_tickets bigint,
  avg_prep_time interval,
  late_tickets bigint,
  cancelled_tickets bigint,
  -- Waiter-specific
  active_tables bigint,
  tables_served bigint,
  guests_served bigint,
  avg_table_turnaround interval,
  total_tips numeric,
  avg_ticket_size numeric,
  -- Metadata
  last_activity timestamptz,
  risk_level text,
  risk_flags bigint
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
    s.overtime_rate,
    s.base_monthly_salary,
    s.max_weekly_hours,
    s.shift,
    s.role_id,
    r.name AS role_name,
    r.is_system AS role_is_system,
    sh.id AS shift_id,
    sh.opened_at AS shift_opened_at,
    CASE WHEN sh.id IS NOT NULL AND sh.closed_at IS NULL THEN 'active' ELSE 'off' END AS shift_status,
    CASE WHEN sh.id IS NOT NULL AND sh.closed_at IS NULL THEN now() - sh.opened_at ELSE NULL END AS shift_duration,
    -- Permissions
    s.can_apply_discount,
    s.can_void_items,
    s.can_open_drawer_without_sale,
    s.can_refund,
    s.can_view_reports,
    s.can_manage_staff,
    -- Common metrics
    COALESCE(perf.total_orders, 0),
    COALESCE(perf.total_revenue, 0),
    COALESCE(perf.cash_sales, 0),
    COALESCE(perf.card_sales, 0),
    COALESCE(perf.total_voids, 0),
    COALESCE(perf.total_discounts, 0),
    COALESCE(perf.total_refunds, 0),
    COALESCE(perf.drawer_variance, 0),
    -- Kitchen-specific
    COALESCE(kitchen.active_tickets, 0),
    COALESCE(kitchen.completed_tickets, 0),
    kitchen.avg_prep_time,
    COALESCE(kitchen.late_tickets, 0),
    COALESCE(kitchen.cancelled_tickets, 0),
    -- Waiter-specific
    COALESCE(waiter.active_tables, 0),
    COALESCE(waiter.tables_served, 0),
    COALESCE(waiter.guests_served, 0),
    waiter.avg_table_turnaround,
    COALESCE(waiter.total_tips, 0),
    COALESCE(waiter.avg_ticket_size, 0),
    -- Metadata
    perf.last_order_at AS last_activity,
    CASE
      WHEN COALESCE(perf.total_voids, 0) > 10 OR COALESCE(perf.total_refunds, 0) > 5 THEN 'HIGH'
      WHEN COALESCE(perf.total_voids, 0) > 5 OR COALESCE(perf.total_refunds, 0) > 2 THEN 'MEDIUM'
      ELSE 'LOW'
    END AS risk_level,
    (COALESCE(perf.total_voids, 0) + COALESCE(perf.total_refunds, 0)) AS risk_flags
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
      SUM(o.total_amount) AS total_revenue,
      SUM(o.cash_amount) AS cash_sales,
      SUM(o.card_amount) AS card_sales,
      COUNT(*) FILTER (WHERE o.void_reason IS NOT NULL) AS total_voids,
      COALESCE(SUM(o.discount_amount), 0) AS total_discounts,
      COALESCE(SUM(o.refund_amount), 0) AS total_refunds,
      COALESCE(SUM(cds_sub.difference), 0) AS drawer_variance,
      MAX(o.created_at) AS last_order_at
    FROM orders o
    LEFT JOIN LATERAL (
      SELECT SUM(cds.difference) AS difference
      FROM cash_drawer_sessions cds
      WHERE cds.opened_by = s.id AND cds.closed_at IS NOT NULL AND cds.created_at::date = CURRENT_DATE
    ) cds_sub ON true
    WHERE o.created_by = s.id
      AND o.created_at::date = CURRENT_DATE
      AND o.status IN ('confirmed', 'paid', 'completed')
  ) perf ON true
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*) FILTER (WHERE kt.status IN ('pending', 'preparing')) AS active_tickets,
      COUNT(*) FILTER (WHERE kt.status = 'completed') AS completed_tickets,
      AVG(kt.completed_at - kt.created_at) FILTER (WHERE kt.status = 'completed') AS avg_prep_time,
      COUNT(*) FILTER (WHERE kt.status = 'completed' AND (kt.completed_at - kt.created_at) > interval '15 minutes') AS late_tickets,
      COUNT(*) FILTER (WHERE kt.status = 'cancelled') AS cancelled_tickets
    FROM kitchen_tickets kt
    WHERE kt.assigned_to = s.id
      AND kt.created_at::date = CURRENT_DATE
  ) kitchen ON true
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*) FILTER (WHERE wa.status = 'occupied') AS active_tables,
      COUNT(*) FILTER (WHERE wa.status = 'completed') AS tables_served,
      SUM(wa.guest_count) AS guests_served,
      AVG(wa.completed_at - wa.seated_at) FILTER (WHERE wa.status = 'completed') AS avg_table_turnaround,
      SUM(wa.tip_amount) AS total_tips,
      AVG(wa.total_amount) AS avg_ticket_size
    FROM waiter_assignments wa
    WHERE wa.waiter_id = s.id
      AND wa.created_at::date = CURRENT_DATE
  ) waiter ON true
  ORDER BY
    CASE WHEN sh.id IS NOT NULL AND sh.closed_at IS NULL THEN 0 ELSE 1 END,
    s.name;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_staff_directory_v2() TO authenticated, service_role;


-- ---------------------------------------------------------------------
-- 5. RPC: get_role_specific_metrics - Returns metrics based on role
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_role_specific_metrics(p_staff_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_role text;
  v_result jsonb;
  v_active_tickets bigint;
  v_completed_tickets bigint;
  v_avg_prep_time interval;
  v_late_tickets bigint;
  v_cancelled_tickets bigint;
  v_active_tables bigint;
  v_tables_served bigint;
  v_guests_served bigint;
  v_avg_turnaround interval;
  v_total_tips numeric;
  v_avg_ticket_size numeric;
  v_cash_sales numeric;
  v_card_sales numeric;
  v_voids_count bigint;
  v_discounts_amount numeric;
  v_refunds_amount numeric;
  v_drawer_variance numeric;
  v_orders_count bigint;
  v_avg_order_value numeric;
  v_total_sales numeric;
  v_open_checks bigint;
  v_items_prepared bigint;
  v_current_queue bigint;
BEGIN
  SELECT r.name INTO v_role
  FROM staff s
  JOIN roles r ON r.id = s.role_id
  WHERE s.id = p_staff_id;

  IF v_role IS NULL THEN
    RETURN '{}'::jsonb;
  END IF;

  CASE v_role
    WHEN 'kitchen', 'chef', 'cook' THEN
      SELECT
        COUNT(*) FILTER (WHERE kt.status IN ('pending', 'preparing')),
        COUNT(*) FILTER (WHERE kt.status = 'completed'),
        (SELECT AVG(kt2.completed_at - kt2.created_at) FROM kitchen_tickets kt2 WHERE kt2.assigned_to = p_staff_id AND kt2.created_at::date = CURRENT_DATE AND kt2.status = 'completed'),
        COUNT(*) FILTER (WHERE kt.status = 'completed' AND (kt.completed_at - kt.created_at) > interval '15 minutes'),
        COUNT(*) FILTER (WHERE kt.status = 'cancelled'),
        COUNT(*) FILTER (WHERE kt.status = 'pending')
      INTO v_active_tickets, v_completed_tickets, v_avg_prep_time, v_late_tickets, v_cancelled_tickets, v_current_queue
      FROM kitchen_tickets kt
      WHERE kt.assigned_to = p_staff_id
        AND kt.created_at::date = CURRENT_DATE;

      SELECT COUNT(*) INTO v_items_prepared
      FROM kitchen_ticket_items kti
      WHERE kti.ticket_id IN (
        SELECT kt2.id FROM kitchen_tickets kt2 WHERE kt2.assigned_to = p_staff_id AND kt2.created_at::date = CURRENT_DATE
      );

      v_result := jsonb_build_object(
        'role', v_role,
        'active_tickets', COALESCE(v_active_tickets, 0),
        'completed_tickets', COALESCE(v_completed_tickets, 0),
        'avg_prep_time_seconds', COALESCE(EXTRACT(EPOCH FROM v_avg_prep_time), 0),
        'late_tickets', COALESCE(v_late_tickets, 0),
        'cancelled_tickets', COALESCE(v_cancelled_tickets, 0),
        'current_queue', COALESCE(v_current_queue, 0),
        'items_prepared', COALESCE(v_items_prepared, 0)
      );

    WHEN 'waiter', 'server' THEN
      SELECT
        COUNT(*) FILTER (WHERE wa.status = 'occupied'),
        COUNT(*) FILTER (WHERE wa.status = 'completed'),
        COALESCE(SUM(wa.guest_count), 0),
        (SELECT AVG(wa2.completed_at - wa2.seated_at) FROM waiter_assignments wa2 WHERE wa2.waiter_id = p_staff_id AND wa2.created_at::date = CURRENT_DATE AND wa2.status = 'completed'),
        COALESCE(SUM(wa.tip_amount), 0),
        COALESCE(AVG(wa.total_amount), 0),
        COUNT(*) FILTER (WHERE wa.status = 'occupied')
      INTO v_active_tables, v_tables_served, v_guests_served, v_avg_turnaround, v_total_tips, v_avg_ticket_size, v_open_checks
      FROM waiter_assignments wa
      WHERE wa.waiter_id = p_staff_id
        AND wa.created_at::date = CURRENT_DATE;

      v_total_sales := COALESCE(v_avg_ticket_size * v_tables_served, 0);

      v_result := jsonb_build_object(
        'role', v_role,
        'active_tables', COALESCE(v_active_tables, 0),
        'tables_served', COALESCE(v_tables_served, 0),
        'guests_served', v_guests_served,
        'avg_turnaround_seconds', COALESCE(EXTRACT(EPOCH FROM v_avg_turnaround), 0),
        'total_tips', v_total_tips,
        'avg_ticket_size', v_avg_ticket_size,
        'total_sales', v_total_sales,
        'open_checks', COALESCE(v_open_checks, 0)
      );

    WHEN 'cashier', 'bartender' THEN
      SELECT
        COALESCE(SUM(o.cash_amount), 0),
        COALESCE(SUM(o.card_amount), 0),
        COALESCE(SUM(o.total_amount), 0),
        COUNT(*) FILTER (WHERE o.void_reason IS NOT NULL),
        COALESCE(SUM(o.discount_amount), 0),
        COALESCE(SUM(o.refund_amount), 0),
        COUNT(*),
        COALESCE(AVG(o.total_amount), 0)
      INTO v_cash_sales, v_card_sales, v_total_sales, v_voids_count, v_discounts_amount, v_refunds_amount, v_orders_count, v_avg_order_value
      FROM orders o
      WHERE o.created_by = p_staff_id
        AND o.created_at::date = CURRENT_DATE
        AND o.status IN ('confirmed', 'paid', 'completed');

      SELECT COALESCE(SUM(cds.difference), 0) INTO v_drawer_variance
      FROM cash_drawer_sessions cds
      WHERE cds.opened_by = p_staff_id AND cds.closed_at IS NOT NULL AND cds.created_at::date = CURRENT_DATE;

      v_result := jsonb_build_object(
        'role', v_role,
        'cash_sales', v_cash_sales,
        'card_sales', v_card_sales,
        'total_sales', v_total_sales,
        'voids_count', COALESCE(v_voids_count, 0),
        'discounts_amount', v_discounts_amount,
        'refunds_amount', v_refunds_amount,
        'drawer_variance', v_drawer_variance,
        'orders_count', COALESCE(v_orders_count, 0),
        'avg_order_value', v_avg_order_value
      );

    ELSE
      SELECT
        COUNT(*),
        COALESCE(SUM(o.total_amount), 0),
        COALESCE(AVG(o.total_amount), 0)
      INTO v_orders_count, v_total_sales, v_avg_order_value
      FROM orders o
      WHERE o.created_by = p_staff_id
        AND o.created_at::date = CURRENT_DATE
        AND o.status IN ('confirmed', 'paid', 'completed');

      v_result := jsonb_build_object(
        'role', v_role,
        'total_orders', COALESCE(v_orders_count, 0),
        'total_revenue', v_total_sales,
        'avg_order_value', v_avg_order_value
      );
  END CASE;

  RETURN COALESCE(v_result, '{}'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_role_specific_metrics(uuid) TO authenticated, service_role;


-- ---------------------------------------------------------------------
-- 6. RPC: force_clock_out - Admin force ends a shift
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.force_clock_out(
  p_staff_id uuid,
  p_reason text DEFAULT 'Forced by admin',
  p_performed_by uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_shift shifts%ROWTYPE;
  v_duration interval;
BEGIN
  -- Find active shift
  SELECT * INTO v_shift
  FROM shifts
  WHERE staff_id = p_staff_id AND closed_at IS NULL
  ORDER BY opened_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'NO_ACTIVE_SHIFT');
  END IF;

  v_duration := now() - v_shift.opened_at;

  -- Close the shift
  UPDATE shifts SET
    closed_at = now(),
    notes = COALESCE(notes, '') || ' | Force closed: ' || p_reason,
    updated_at = now()
  WHERE id = v_shift.id;

  -- End any active break
  UPDATE shift_breaks SET
    ended_at = now()
  WHERE shift_id = v_shift.id AND ended_at IS NULL;

  -- Close cash drawer session
  UPDATE cash_drawer_sessions SET
    closed_at = now(),
    status = 'force_closed'
  WHERE opened_by = p_staff_id AND closed_at IS NULL;

  -- Audit
  PERFORM log_audit(
    'force_clock_out', 'shifts', v_shift.id::text, p_performed_by,
    jsonb_build_object('opened_at', v_shift.opened_at, 'duration', v_duration),
    jsonb_build_object('reason', p_reason, 'forced_at', now()),
    NULL, NULL, NULL
  );

  RETURN jsonb_build_object(
    'success', true,
    'shift_id', v_shift.id,
    'duration_minutes', EXTRACT(EPOCH FROM v_duration) / 60,
    'reason', p_reason
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.force_clock_out(uuid, text, uuid) TO authenticated, service_role;


-- ---------------------------------------------------------------------
-- 7. RPC: reset_staff_pin - Generate new PIN for staff
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reset_staff_pin(
  p_staff_id uuid,
  p_new_pin text DEFAULT NULL,
  p_performed_by uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_pin text;
  v_staff staff%ROWTYPE;
BEGIN
  SELECT * INTO v_staff FROM staff WHERE id = p_staff_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'STAFF_NOT_FOUND');
  END IF;

  -- Generate random 4-digit PIN if not provided
  v_pin := COALESCE(p_new_pin, LPAD(FLOOR(RANDOM() * 10000)::text, 4, '0'));

  -- Validate PIN format
  IF LENGTH(v_pin) < 4 OR LENGTH(v_pin) > 6 OR v_pin !~ '^\d+$' THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_PIN_FORMAT');
  END IF;

  -- Update PIN (hashed)
  UPDATE staff SET pin_hash = crypt(v_pin, gen_salt('bf')) WHERE id = p_staff_id;

  -- Audit
  PERFORM log_audit(
    'pin_reset', 'staff', p_staff_id::text, p_performed_by,
    NULL, jsonb_build_object('pin_length', LENGTH(v_pin)), NULL, NULL, NULL
  );

  RETURN jsonb_build_object(
    'success', true,
    'staff_id', p_staff_id,
    'new_pin', v_pin,
    'message', 'PIN has been reset. Share securely with staff member.'
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.reset_staff_pin(uuid, text, uuid) TO authenticated, service_role;


-- ---------------------------------------------------------------------
-- 8. RPC: get_shift_audit_log - Complete shift timeline
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_shift_audit_log(p_shift_id uuid)
RETURNS TABLE (
  id text,
  event_type text,
  description text,
  details jsonb,
  created_at timestamptz,
  performed_by_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT * FROM (
    -- Clock in/out events
    SELECT
      ('shift_' || sh.id)::text,
      CASE WHEN sh.closed_at IS NULL THEN 'clock_in' ELSE 'clock_out' END,
      CASE WHEN sh.closed_at IS NULL THEN 'Shift started' ELSE 'Shift ended' END,
      jsonb_build_object(
        'opened_at', sh.opened_at,
        'closed_at', sh.closed_at,
        'duration_minutes', EXTRACT(EPOCH FROM (COALESCE(sh.closed_at, now()) - sh.opened_at)) / 60,
        'starting_cash', sh.starting_cash
      ),
      sh.opened_at,
      s.name
    FROM shifts sh
    JOIN staff s ON s.id = sh.staff_id
    WHERE sh.id = p_shift_id

    UNION ALL

    -- Break events
    SELECT
      ('break_' || sb.id)::text,
      CASE WHEN sb.ended_at IS NULL THEN 'break_start' ELSE 'break_end' END,
      CASE WHEN sb.ended_at IS NULL THEN 'Break started: ' || sb.break_type ELSE 'Break ended: ' || sb.break_type END,
      jsonb_build_object(
        'break_type', sb.break_type,
        'started_at', sb.started_at,
        'ended_at', sb.ended_at,
        'duration_minutes', EXTRACT(EPOCH FROM (COALESCE(sb.ended_at, now()) - sb.started_at)) / 60
      ),
      sb.started_at,
      s.name
    FROM shift_breaks sb
    JOIN staff s ON s.id = sb.staff_id
    WHERE sb.shift_id = p_shift_id

    UNION ALL

    -- Order events during shift
    SELECT
      ('order_' || o.id)::text,
      'order_created',
      'Order #' || o.order_number || ' - ' || o.total_amount::text || ' AZN',
      jsonb_build_object(
        'order_id', o.id,
        'order_number', o.order_number,
        'total', o.total_amount,
        'status', o.status,
        'payment_method', o.payment_method,
        'table_id', o.table_id
      ),
      o.created_at,
      s.name
    FROM orders o
    JOIN staff s ON s.id = o.created_by
    WHERE o.created_by = (SELECT staff_id FROM shifts WHERE id = p_shift_id)
      AND o.created_at >= (SELECT opened_at FROM shifts WHERE id = p_shift_id)
      AND (SELECT closed_at FROM shifts WHERE id = p_shift_id) IS NULL
          OR o.created_at <= (SELECT closed_at FROM shifts WHERE id = p_shift_id)

    UNION ALL

    -- Cash drawer events
    SELECT
      ('drawer_' || cds.id)::text,
      'drawer_' || cds.status,
      CASE cds.status
        WHEN 'opened' THEN 'Cash drawer opened'
        WHEN 'closed' THEN 'Cash drawer closed'
        WHEN 'force_closed' THEN 'Cash drawer force closed'
        ELSE 'Cash drawer ' || cds.status
      END,
      jsonb_build_object(
        'opening_balance', cds.opening_balance,
        'closing_balance', cds.closing_balance,
        'expected_balance', cds.expected_balance,
        'difference', cds.difference,
        'status', cds.status
      ),
      cds.created_at,
      s.name
    FROM cash_drawer_sessions cds
    JOIN staff s ON s.id = cds.opened_by
    WHERE cds.opened_by = (SELECT staff_id FROM shifts WHERE id = p_shift_id)
      AND cds.opened_at >= (SELECT opened_at FROM shifts WHERE id = p_shift_id)
      AND ((SELECT closed_at FROM shifts WHERE id = p_shift_id) IS NULL
          OR cds.opened_at <= (SELECT closed_at FROM shifts WHERE id = p_shift_id))
  ) timeline
  ORDER BY created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_shift_audit_log(uuid) TO authenticated, service_role;


-- ---------------------------------------------------------------------
-- 9. RPC: calculate_labor_cost - Accurate labor cost for a period
-- Only counts actual clock-in to clock-out time, NOT scheduled hours
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.calculate_labor_cost(
  p_start_date date DEFAULT CURRENT_DATE - interval '7 days',
  p_end_date date DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  staff_id uuid,
  staff_name text,
  role_name text,
  total_shifts bigint,
  total_minutes numeric,
  regular_minutes numeric,
  overtime_minutes numeric,
  regular_pay numeric,
  overtime_pay numeric,
  total_labor_cost numeric,
  avg_hourly_cost numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.id AS staff_id,
    s.name AS staff_name,
    r.name AS role_name,
    COUNT(sh.id) AS total_shifts,
    -- Total actual minutes worked (clock-in to clock-out only)
    SUM(EXTRACT(EPOCH FROM (sh.closed_at - sh.opened_at)) / 60) AS total_minutes,
    -- Regular minutes (up to max_weekly_hours per week)
    SUM(
      LEAST(
        EXTRACT(EPOCH FROM (sh.closed_at - sh.opened_at)) / 60,
        (s.max_weekly_hours * 60.0) / NULLIF(COUNT(sh.id) OVER (PARTITION BY s.id), 0)
      )
    ) AS regular_minutes,
    -- Overtime minutes (anything beyond max)
    SUM(
      GREATEST(
        EXTRACT(EPOCH FROM (sh.closed_at - sh.opened_at)) / 60 - (s.max_weekly_hours * 60.0) / NULLIF(COUNT(sh.id) OVER (PARTITION BY s.id), 0),
        0
      )
    ) AS overtime_minutes,
    -- Regular pay
    SUM(
      LEAST(
        EXTRACT(EPOCH FROM (sh.closed_at - sh.opened_at)) / 60,
        (s.max_weekly_hours * 60.0) / NULLIF(COUNT(sh.id) OVER (PARTITION BY s.id), 0)
      ) / 60.0 * s.hourly_rate
    ) AS regular_pay,
    -- Overtime pay
    SUM(
      GREATEST(
        EXTRACT(EPOCH FROM (sh.closed_at - sh.opened_at)) / 60 - (s.max_weekly_hours * 60.0) / NULLIF(COUNT(sh.id) OVER (PARTITION BY s.id), 0),
        0
      ) / 60.0 * s.hourly_rate * s.overtime_rate
    ) AS overtime_pay,
    -- Total labor cost
    SUM(
      LEAST(
        EXTRACT(EPOCH FROM (sh.closed_at - sh.opened_at)) / 60,
        (s.max_weekly_hours * 60.0) / NULLIF(COUNT(sh.id) OVER (PARTITION BY s.id), 0)
      ) / 60.0 * s.hourly_rate
    ) + SUM(
      GREATEST(
        EXTRACT(EPOCH FROM (sh.closed_at - sh.opened_at)) / 60 - (s.max_weekly_hours * 60.0) / NULLIF(COUNT(sh.id) OVER (PARTITION BY s.id), 0),
        0
      ) / 60.0 * s.hourly_rate * s.overtime_rate
    ) AS total_labor_cost,
    -- Average hourly cost
    CASE WHEN SUM(EXTRACT(EPOCH FROM (sh.closed_at - sh.opened_at)) / 60) > 0
      THEN (
        SUM(
          LEAST(
            EXTRACT(EPOCH FROM (sh.closed_at - sh.opened_at)) / 60,
            (s.max_weekly_hours * 60.0) / NULLIF(COUNT(sh.id) OVER (PARTITION BY s.id), 0)
          ) / 60.0 * s.hourly_rate
        ) + SUM(
          GREATEST(
            EXTRACT(EPOCH FROM (sh.closed_at - sh.opened_at)) / 60 - (s.max_weekly_hours * 60.0) / NULLIF(COUNT(sh.id) OVER (PARTITION BY s.id), 0),
            0
          ) / 60.0 * s.hourly_rate * s.overtime_rate
        )
      ) / (SUM(EXTRACT(EPOCH FROM (sh.closed_at - sh.opened_at)) / 60) / 60.0)
      ELSE 0
    END AS avg_hourly_cost
  FROM staff s
  JOIN roles r ON r.id = s.role_id
  JOIN shifts sh ON sh.staff_id = s.id
  WHERE sh.closed_at IS NOT NULL
    AND sh.opened_at::date BETWEEN p_start_date AND p_end_date
  GROUP BY s.id, s.name, r.name, s.hourly_rate, s.overtime_rate, s.max_weekly_hours
  ORDER BY total_labor_cost DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.calculate_labor_cost(date, date) TO authenticated, service_role;


-- ---------------------------------------------------------------------
-- 10. INDEXES for new tables
-- ---------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_shift_breaks_shift_id ON shift_breaks(shift_id);
CREATE INDEX IF NOT EXISTS idx_shift_breaks_staff_id ON shift_breaks(staff_id);
CREATE INDEX IF NOT EXISTS idx_staff_metrics_staff_date ON staff_metrics(staff_id, metric_date);
CREATE INDEX IF NOT EXISTS idx_staff_metrics_date ON staff_metrics(metric_date);
