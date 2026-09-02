-- ============================================================================
-- Staff UX Backend Fix Pass
-- Targets: /api/staff/directory-v2, /api/staff/directory, /api/labor/splh,
--          /api/staff/[id]/activity (4 broken live RPC families)
-- NOTE: applies on top of existing live schema (verified 2026-09-02)
-- ============================================================================

-- 1) staff: add columns referenced by get_staff_directory_v2 / get_staff_kpis
ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS expected_cash       numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS drawer_variance     numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS risk_score          integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS risk_level          text    DEFAULT 'low',
  ADD COLUMN IF NOT EXISTS risk_flags          text[]  DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS last_activity       timestamptz;

-- 2) labor_summaries view (get_staff_kpis.labor_cost_today dependency)
CREATE OR REPLACE VIEW public.labor_summaries AS
SELECT
    COALESCE(sh.report_date, DATE(sh.opened_at))                AS period,
    sh.staff_id,
    COALESCE(s.hourly_rate, 0)                                  AS hourly_rate,
    GREATEST(EXTRACT(EPOCH FROM (COALESCE(sh.closed_at, NOW()) - sh.opened_at)) / 3600, 0) AS hours_worked,
    GREATEST(EXTRACT(EPOCH FROM (COALESCE(sh.closed_at, NOW()) - sh.opened_at)) / 3600, 0)
        * COALESCE(s.hourly_rate, 0)                            AS total_labor_cost
FROM public.shifts sh
JOIN public.staff s ON s.id = sh.staff_id;

-- 3) staff_stats view (get_staff_directory_v2 dependency)
CREATE OR REPLACE VIEW public.staff_stats AS
WITH perf AS (
    SELECT
        o.created_by                                        AS staff_id,
        COUNT(*)::int                                       AS total_orders,
        COALESCE(SUM(o.total_amount), 0)                    AS total_revenue,
        COALESCE(SUM(o.cash_amount), 0)                     AS cash_sales,
        COALESCE(SUM(o.card_amount), 0)                     AS card_sales,
        COUNT(*) FILTER (WHERE o.void_reason IS NOT NULL)::int AS total_voids,
        COALESCE(SUM(o.refund_amount), 0)                   AS total_refunds,
        COALESCE(SUM(o.discount_amount), 0)                 AS total_discounts,
        COALESCE(AVG(o.total_amount), 0)                    AS avg_ticket_value,
        COALESCE(AVG(o.total_amount), 0)                    AS avg_order_value
    FROM public.orders o
    WHERE o.created_at::date = CURRENT_DATE
      AND o.status IN ('confirmed', 'paid', 'completed')
      AND o.is_draft IS NOT TRUE
    GROUP BY o.created_by
),
kitchen AS (
    SELECT
        kt.assigned_to                                      AS staff_id,
        COUNT(*) FILTER (WHERE kt.status IN ('pending', 'preparing'))::int AS active_tickets,
        COUNT(*) FILTER (WHERE kt.status = 'completed')::int AS completed_tickets,
        CASE WHEN COUNT(*) FILTER (WHERE kt.status = 'completed') = 0 THEN NULL
             ELSE ROUND(EXTRACT(EPOCH FROM AVG(kt.completed_at - kt.created_at)
                       FILTER (WHERE kt.status = 'completed')) / 60, 1)::text END AS avg_prep_time,
        COUNT(*) FILTER (WHERE kt.status = 'completed'
                       AND (kt.completed_at - kt.created_at) > interval '15 minutes')::int AS late_tickets,
        COUNT(*) FILTER (WHERE kt.status = 'cancelled')::int AS cancelled_tickets,
        ROUND(COALESCE(AVG(EXTRACT(EPOCH FROM (kt.completed_at - kt.created_at))), 0) / 60, 1)::text AS avg_wait_time
    FROM public.kitchen_tickets kt
    WHERE kt.created_at::date = CURRENT_DATE
    GROUP BY kt.assigned_to
),
waiter AS (
    SELECT
        wa.waiter_id                                        AS staff_id,
        COUNT(*) FILTER (WHERE wa.status = 'occupied')::int  AS active_tables,
        COUNT(*) FILTER (WHERE wa.status = 'completed')::int AS tables_served,
        COALESCE(SUM(wa.guest_count), 0)::int               AS guests_served,
        COALESCE(SUM(wa.guest_count) FILTER (WHERE wa.status = 'occupied'), 0)::int AS seated_guests,
        COALESCE(SUM(wa.tip_amount), 0)                     AS total_tips
    FROM public.waiter_assignments wa
    WHERE wa.created_at::date = CURRENT_DATE
    GROUP BY wa.waiter_id
),
aprv AS (
    SELECT
        ar.staff_id,
        COUNT(*)::int                                                       AS approvals_count,
        COUNT(*) FILTER (WHERE ar.action_type ILIKE '%void%'
                       OR ar.action_type ILIKE '%refund%')::int             AS void_refund_approvals
    FROM public.approval_requests ar
    WHERE ar.created_at::date = CURRENT_DATE
    GROUP BY ar.staff_id
),
sec AS (
    SELECT
        se.staff_id,
        COUNT(*)::int AS exceptions_count
    FROM public.security_events se
    WHERE se.created_at::date = CURRENT_DATE
    GROUP BY se.staff_id
),
lbr AS (
    SELECT
        sh.staff_id,
        SUM(GREATEST(EXTRACT(EPOCH FROM (COALESCE(sh.closed_at, NOW()) - sh.opened_at)) / 3600, 0)
            * COALESCE(s.hourly_rate, 0)) AS labor_cost,
        SUM(GREATEST(EXTRACT(EPOCH FROM (COALESCE(sh.closed_at, NOW()) - sh.opened_at)) / 3600, 0)) AS hours
    FROM public.shifts sh
    JOIN public.staff s ON s.id = sh.staff_id
    WHERE DATE(sh.opened_at) = CURRENT_DATE
    GROUP BY sh.staff_id
),
turn AS (
    SELECT
        o.created_by AS staff_id,
        ROUND(AVG(EXTRACT(EPOCH FROM (COALESCE(o.closed_at, NOW()) - o.created_at))) / 60, 1)::text AS table_turnover_rate
    FROM public.orders o
    WHERE o.created_at::date = CURRENT_DATE AND o.status IN ('confirmed', 'paid', 'completed')
    GROUP BY o.created_by
)
SELECT
    s.id                                        AS staff_id,
    CURRENT_DATE                                AS period,
    COALESCE(p.total_orders, 0)                 AS total_orders,
    COALESCE(p.total_revenue, 0)                AS total_revenue,
    COALESCE(p.cash_sales, 0)                   AS cash_sales,
    COALESCE(p.card_sales, 0)                   AS card_sales,
    COALESCE(p.total_voids, 0)                  AS total_voids,
    COALESCE(p.total_refunds, 0)                AS total_refunds,
    COALESCE(p.total_discounts, 0)              AS total_discounts,
    COALESCE(p.avg_ticket_value, 0)             AS avg_ticket_value,
    COALESCE(p.avg_order_value, 0)              AS avg_order_value,
    COALESCE(k.active_tickets, 0)               AS active_tickets,
    COALESCE(k.completed_tickets, 0)            AS completed_tickets,
    k.avg_prep_time                             AS avg_prep_time,
    COALESCE(k.late_tickets, 0)                 AS late_tickets,
    0                                           AS items_prepared,
    0                                           AS re_fired,
    COALESCE(k.cancelled_tickets, 0)            AS cancelled_tickets,
    0                                           AS waste_count,
    COALESCE(w.active_tables, 0)                AS active_tables,
    COALESCE(w.tables_served, 0)                AS tables_served,
    COALESCE(w.guests_served, 0)                AS guests_served,
    COALESCE(w.total_tips, 0)                   AS total_tips,
    COALESCE(a.approvals_count, 0)              AS approvals_count,
    COALESCE(sc.exceptions_count, 0)            AS exceptions_count,
    CASE WHEN COALESCE(p.total_revenue, 0) > 0 THEN COALESCE(l.labor_cost, 0) / p.total_revenue * 100 ELSE 0 END AS labor_cost_percent,
    CASE WHEN COALESCE(l.labor_cost, 0) > 0 THEN COALESCE(p.total_revenue, 0) / l.labor_cost ELSE 0 END AS labor_efficiency,
    COALESCE(a.void_refund_approvals, 0)        AS void_refund_approvals,
    COALESCE(w.seated_guests, 0)                AS seated_guests,
    k.avg_wait_time                             AS avg_wait_time,
    t.table_turnover_rate                       AS table_turnover_rate,
    0                                           AS no_shows
FROM public.staff s
LEFT JOIN perf p ON p.staff_id = s.id
LEFT JOIN kitchen k ON k.staff_id = s.id
LEFT JOIN waiter w ON w.staff_id = s.id
LEFT JOIN aprv a ON a.staff_id = s.id
LEFT JOIN sec sc ON sc.staff_id = s.id
LEFT JOIN lbr l ON l.staff_id = s.id
LEFT JOIN turn t ON t.staff_id = s.id;

-- 4) get_splh_metrics: rewrite to use shifts (time_clock_entries empty today)
--    + real order revenue → returns {total_revenue, total_hours, splh}
CREATE OR REPLACE FUNCTION public.get_splh_metrics(
    p_staff_id uuid DEFAULT NULL::uuid,
    p_period_start date DEFAULT (CURRENT_DATE - '30 days'::interval),
    p_period_end date DEFAULT CURRENT_DATE
)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    total_rev numeric := 0;
    total_hrs numeric := 0;
BEGIN
    SELECT COALESCE(SUM(o.total_amount), 0)
      INTO total_rev
      FROM public.orders o
     WHERE o.created_at::date BETWEEN p_period_start AND p_period_end
       AND o.status IN ('confirmed', 'paid', 'completed')
       AND o.created_by = COALESCE(p_staff_id, o.created_by);

    SELECT COALESCE(SUM(GREATEST(EXTRACT(EPOCH FROM (COALESCE(sh.closed_at, NOW()) - sh.opened_at)) / 3600, 0)), 0)
      INTO total_hrs
      FROM public.shifts sh
     WHERE DATE(sh.opened_at) BETWEEN p_period_start AND p_period_end
       AND sh.staff_id = COALESCE(p_staff_id, sh.staff_id);

    RETURN json_build_object(
        'total_revenue', ROUND(total_rev, 2),
        'total_hours',   ROUND(total_hrs, 2),
        'splh',          CASE WHEN total_hrs > 0 THEN ROUND((total_rev / total_hrs), 2) ELSE 0 END
    );
END;
$function$;

-- 5) get_staff_activity: align with live price_overrides columns
CREATE OR REPLACE FUNCTION public.get_staff_activity(
    p_staff_id uuid,
    p_limit integer DEFAULT 50,
    p_offset integer DEFAULT 0
)
 RETURNS TABLE(id text, event_type text, description text, details jsonb, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT * FROM (
    SELECT ('order_' || o.id)::text, 'order_closed', 'Order #' || COALESCE(o.order_number, ''),
           jsonb_build_object('total', o.total_amount), o.created_at
    FROM public.orders o WHERE o.created_by = p_staff_id
    UNION ALL
    SELECT ('void_' || o.id)::text, 'void', 'Voided',
           jsonb_build_object('reason', o.void_reason), o.created_at
    FROM public.orders o WHERE o.created_by = p_staff_id AND o.void_reason IS NOT NULL
    UNION ALL
    SELECT ('refund_' || o.id)::text, 'refund', 'Refund',
           jsonb_build_object('amount', o.refund_amount), o.created_at
    FROM public.orders o WHERE o.created_by = p_staff_id AND o.refund_amount > 0
    UNION ALL
    SELECT ('override_' || po.id)::text, 'price_override', 'Price override',
           jsonb_build_object('original', po.catalog_price, 'override', po.override_price, 'variance', po.variance),
           po.created_at
    FROM public.price_overrides po WHERE po.staff_id = p_staff_id
    UNION ALL
    SELECT ('security_' || se.id)::text, se.event_type, se.event_type,
           jsonb_build_object('success', se.success), se.created_at
    FROM public.security_events se WHERE se.staff_id = p_staff_id
  ) combined ORDER BY created_at DESC LIMIT p_limit OFFSET p_offset;
END;
$function$;
-- 6) get_staff_locations: locations.name is varchar, function returns text
CREATE OR REPLACE FUNCTION public.get_staff_locations(p_staff_id uuid)
 RETURNS TABLE(location_id uuid, location_name text, is_primary boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT l.id, l.name::text, sl.is_primary
  FROM public.staff_locations sl
  JOIN public.locations l ON l.id = sl.location_id
  WHERE sl.staff_id = p_staff_id
  ORDER BY sl.is_primary DESC;
END;
$function$;

-- 7) permissions model fix: role_permissions/overrides keyed by permission_key,
--    permissions has no id column, source column needs explicit varchar
CREATE OR REPLACE FUNCTION public.get_effective_permissions(p_staff_id uuid)
 RETURNS TABLE(permission_code character varying, permission_name character varying, category_name text, is_granted boolean, source character varying)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    p.code, p.name, pc.name::text,
    COALESCE(spo.is_allowed, (rp.permission_key IS NOT NULL), false)::boolean,
    (CASE
      WHEN spo.id IS NOT NULL THEN 'override'
      WHEN rp.permission_key IS NOT NULL THEN 'role'
      ELSE 'default'
    END)::character varying
  FROM public.permissions p
  LEFT JOIN public.permission_categories pc ON pc.id = p.category_id
  LEFT JOIN public.role_permissions rp ON rp.permission_key = p.key AND rp.role_id = (SELECT role_id FROM staff WHERE id = p_staff_id)
  LEFT JOIN public.staff_permission_overrides spo ON spo.permission_key = p.key AND spo.staff_id = p_staff_id
  ORDER BY pc.sort_order, p.name;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_effective_permissions_v2(p_staff_id uuid, p_location_id uuid DEFAULT NULL::uuid, p_active_role_id uuid DEFAULT NULL::uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  result JSON;
BEGIN
  WITH staff_base_perms AS (
    SELECT DISTINCT rp.permission_key
    FROM public.staff s
    JOIN public.role_permissions rp ON rp.role_id = s.role_id
    WHERE s.id = p_staff_id
    UNION
    SELECT DISTINCT spo.permission_key
    FROM public.staff_permission_overrides spo
    WHERE spo.staff_id = p_staff_id AND spo.is_allowed = true
  ),
  active_role_perms AS (
    SELECT DISTINCT rp.permission_key
    FROM public.role_permissions rp
    WHERE rp.role_id = p_active_role_id
  ),
  effective AS (
    SELECT DISTINCT p.code, p.name, p.key
    FROM public.permissions p
    WHERE p.key IN (
        SELECT permission_key FROM active_role_perms
        UNION
        SELECT permission_key FROM staff_base_perms
    )
  )
  SELECT json_agg(e.*) INTO result FROM effective e;

  RETURN COALESCE(result, '[]'::json);
END;
$function$;

CREATE OR REPLACE FUNCTION public.check_permission(p_staff_id uuid, p_permission_code text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_has_permission BOOLEAN;
  v_override BOOLEAN;
BEGIN
  SELECT spo.is_allowed INTO v_override
  FROM public.staff_permission_overrides spo
  JOIN public.permissions p ON p.key = spo.permission_key
  WHERE spo.staff_id = p_staff_id AND p.code = p_permission_code;

  IF FOUND THEN
    RETURN json_build_object('has_permission', v_override, 'source', 'override');
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.staff st
    JOIN public.role_permissions rp ON rp.role_id = st.role_id
    JOIN public.permissions p ON p.key = rp.permission_key
    WHERE st.id = p_staff_id AND p.code = p_permission_code
  ) INTO v_has_permission;

  RETURN json_build_object('has_permission', v_has_permission, 'source', 'role');
END;
$function$;

-- 8) get_shift_audit_log: orders.table_number (no table_id) + dynamic SQL to
--    avoid plpgsql OUT-param name collision (id/event_type/etc.)
CREATE OR REPLACE FUNCTION public.get_shift_audit_log(p_shift_id uuid)
 RETURNS TABLE(id text, event_type text, description text, details jsonb, created_at timestamp with time zone, performed_by_name text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY EXECUTE $q$
  SELECT t.id, t.event_type, t.description, t.details, t.created_at, t.performed_by_name
  FROM (
    SELECT
      ('shift_' || sh.id)::text AS id,
      CASE WHEN sh.closed_at IS NULL THEN 'clock_in' ELSE 'clock_out' END AS event_type,
      CASE WHEN sh.closed_at IS NULL THEN 'Shift started' ELSE 'Shift ended' END AS description,
      jsonb_build_object('opened_at', sh.opened_at, 'closed_at', sh.closed_at,
        'duration_minutes', EXTRACT(EPOCH FROM (COALESCE(sh.closed_at, now()) - sh.opened_at)) / 60,
        'starting_cash', sh.starting_cash) AS details,
      sh.opened_at AS created_at,
      s.name AS performed_by_name
    FROM shifts sh JOIN staff s ON s.id = sh.staff_id WHERE sh.id = $1
    UNION ALL
    SELECT
      ('break_' || sb.id)::text AS id,
      CASE WHEN sb.ended_at IS NULL THEN 'break_start' ELSE 'break_end' END AS event_type,
      CASE WHEN sb.ended_at IS NULL THEN 'Break started: ' || sb.break_type ELSE 'Break ended: ' || sb.break_type END AS description,
      jsonb_build_object('break_type', sb.break_type, 'started_at', sb.started_at, 'ended_at', sb.ended_at,
        'duration_minutes', EXTRACT(EPOCH FROM (COALESCE(sb.ended_at, now()) - sb.started_at)) / 60) AS details,
      sb.started_at AS created_at,
      s.name AS performed_by_name
    FROM shift_breaks sb JOIN staff s ON s.id = sb.staff_id WHERE sb.shift_id = $1
    UNION ALL
    SELECT
      ('order_' || o.id)::text AS id, 'order_created' AS event_type,
      'Order #' || COALESCE(o.order_number, '') || ' - ' || o.total_amount::text || ' AZN' AS description,
      jsonb_build_object('order_id', o.id, 'order_number', o.order_number, 'total', o.total_amount,
        'status', o.status, 'payment_method', o.payment_method, 'table_number', o.table_number) AS details,
      o.created_at AS created_at,
      s.name AS performed_by_name
    FROM orders o JOIN staff s ON s.id = o.created_by
    WHERE o.created_by = (SELECT staff_id FROM shifts WHERE id = $1)
      AND o.created_at >= (SELECT opened_at FROM shifts WHERE id = $1)
      AND ((SELECT closed_at FROM shifts WHERE id = $1) IS NULL
          OR o.created_at <= (SELECT closed_at FROM shifts WHERE id = $1))
    UNION ALL
    SELECT
      ('drawer_' || cds.id)::text AS id, 'drawer_' || cds.status AS event_type,
      CASE cds.status WHEN 'opened' THEN 'Cash drawer opened' WHEN 'closed' THEN 'Cash drawer closed'
        WHEN 'force_closed' THEN 'Cash drawer force closed' ELSE 'Cash drawer ' || cds.status END AS description,
      jsonb_build_object('opening_balance', cds.opening_balance, 'closing_balance', cds.closing_balance,
        'expected_balance', cds.expected_balance, 'difference', cds.difference, 'status', cds.status) AS details,
      cds.created_at AS created_at,
      s.name AS performed_by_name
    FROM cash_drawer_sessions cds JOIN staff s ON s.id = cds.opened_by
    WHERE cds.opened_by = (SELECT staff_id FROM shifts WHERE id = $1)
      AND cds.opened_at >= (SELECT opened_at FROM shifts WHERE id = $1)
      AND ((SELECT closed_at FROM shifts WHERE id = $1) IS NULL
          OR cds.opened_at <= (SELECT closed_at FROM shifts WHERE id = $1))
  ) t
  ORDER BY t.created_at DESC$q$ USING p_shift_id;
END;
$function$;
