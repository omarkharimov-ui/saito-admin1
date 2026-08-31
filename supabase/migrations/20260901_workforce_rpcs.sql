-- =====================================================================
-- SAITO ADMIN 1 — WORKFORCE RPCs (Part 1)
-- =====================================================================

-- ---------------------------------------------------------------------
-- get_staff_directory — Tam işçi siyahısı
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_staff_directory()
RETURNS TABLE (
  id uuid, name text, full_name text, email text, phone text,
  is_active boolean, hourly_rate numeric, overtime_rate numeric,
  shift text, role_id uuid, role_name text,
  shift_id uuid, shift_opened_at timestamptz, shift_status text,
  total_orders bigint, total_revenue numeric, cash_sales numeric, card_sales numeric,
  total_voids bigint, total_refunds numeric, total_discounts numeric,
  drawer_variance numeric, avg_ticket_value numeric,
  active_tickets bigint, completed_tickets bigint, avg_prep_time interval, late_tickets bigint,
  active_tables bigint, tables_served bigint, guests_served bigint, total_tips numeric,
  risk_score integer, last_activity timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.id, s.name, s.full_name, s.email, s.phone, s.is_active,
    s.hourly_rate, COALESCE(s.overtime_rate, 1.5), s.shift,
    s.role_id, r.name AS role_name,
    sh.id AS shift_id, sh.opened_at AS shift_opened_at,
    CASE WHEN sh.id IS NOT NULL AND sh.closed_at IS NULL THEN 'active' ELSE 'off' END,
    COALESCE(perf.total_orders, 0), COALESCE(perf.total_revenue, 0),
    COALESCE(perf.cash_sales, 0), COALESCE(perf.card_sales, 0),
    COALESCE(perf.total_voids, 0), COALESCE(perf.total_refunds, 0),
    COALESCE(perf.total_discounts, 0), COALESCE(perf.drawer_variance, 0),
    COALESCE(perf.avg_ticket, 0),
    COALESCE(kitchen.active_tickets, 0), COALESCE(kitchen.completed_tickets, 0),
    kitchen.avg_prep_time, COALESCE(kitchen.late_tickets, 0),
    COALESCE(waiter.active_tables, 0), COALESCE(waiter.tables_served, 0),
    COALESCE(waiter.guests_served, 0), COALESCE(waiter.total_tips, 0),
    COALESCE(rs.total_score, 0), perf.last_order_at
  FROM staff s
  LEFT JOIN roles r ON r.id = s.role_id
  LEFT JOIN LATERAL (SELECT * FROM shifts WHERE staff_id = s.id AND closed_at IS NULL ORDER BY opened_at DESC LIMIT 1) sh ON true
  LEFT JOIN LATERAL (
    SELECT COUNT(*) AS total_orders, SUM(o.total_amount) AS total_revenue,
      SUM(o.cash_amount) AS cash_sales, SUM(o.card_amount) AS card_sales,
      COUNT(*) FILTER (WHERE o.void_reason IS NOT NULL) AS total_voids,
      COALESCE(SUM(o.refund_amount), 0) AS total_refunds,
      COALESCE(SUM(o.discount_amount), 0) AS total_discounts,
      COALESCE((SELECT SUM(cds.difference) FROM cash_drawer_sessions cds WHERE cds.opened_by = s.id AND cds.closed_at IS NOT NULL AND cds.created_at::date = CURRENT_DATE), 0) AS drawer_variance,
      AVG(o.total_amount) AS avg_ticket, MAX(o.created_at) AS last_order_at
    FROM orders o WHERE o.created_by = s.id AND o.created_at::date = CURRENT_DATE AND o.status IN ('confirmed', 'paid', 'completed')
  ) perf ON true
  LEFT JOIN LATERAL (
    SELECT COUNT(*) FILTER (WHERE kt.status IN ('pending', 'preparing')) AS active_tickets,
      COUNT(*) FILTER (WHERE kt.status = 'completed') AS completed_tickets,
      AVG(kt.completed_at - kt.created_at) FILTER (WHERE kt.status = 'completed') AS avg_prep_time,
      COUNT(*) FILTER (WHERE kt.status = 'completed' AND (kt.completed_at - kt.created_at) > interval '15 minutes') AS late_tickets
    FROM kitchen_tickets kt WHERE kt.assigned_to = s.id AND kt.created_at::date = CURRENT_DATE
  ) kitchen ON true
  LEFT JOIN LATERAL (
    SELECT COUNT(*) FILTER (WHERE wa.status = 'occupied') AS active_tables,
      COUNT(*) FILTER (WHERE wa.status = 'completed') AS tables_served,
      SUM(wa.guest_count) AS guests_served, SUM(wa.tip_amount) AS total_tips
    FROM waiter_assignments wa WHERE wa.waiter_id = s.id AND wa.created_at::date = CURRENT_DATE
  ) waiter ON true
  LEFT JOIN LATERAL (SELECT rs.total_score FROM risk_scores rs WHERE rs.staff_id = s.id AND rs.score_date = CURRENT_DATE LIMIT 1) rs ON true
  ORDER BY CASE WHEN sh.id IS NOT NULL AND sh.closed_at IS NULL THEN 0 ELSE 1 END, s.name;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_staff_directory() TO authenticated, service_role;


-- ---------------------------------------------------------------------
-- get_staff_detail — Fərdi işçi detalları
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_staff_detail(p_staff_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'id', s.id, 'name', s.name, 'full_name', s.full_name,
    'email', s.email, 'phone', s.phone, 'is_active', s.is_active,
    'hourly_rate', s.hourly_rate, 'overtime_rate', s.overtime_rate,
    'shift', s.shift, 'role_id', s.role_id, 'role_name', r.name,
    'active_shift', (SELECT jsonb_build_object('id', sh.id, 'opened_at', sh.opened_at, 'starting_cash', sh.starting_cash, 'duration_min', EXTRACT(EPOCH FROM (now() - sh.opened_at)) / 60) FROM shifts sh WHERE sh.staff_id = p_staff_id AND sh.closed_at IS NULL ORDER BY sh.opened_at DESC LIMIT 1),
    'today_stats', (SELECT jsonb_build_object('orders', COUNT(*), 'revenue', COALESCE(SUM(o.total_amount), 0), 'cash', COALESCE(SUM(o.cash_amount), 0), 'card', COALESCE(SUM(o.card_amount), 0), 'voids', COUNT(*) FILTER (WHERE o.void_reason IS NOT NULL), 'refunds', COUNT(*) FILTER (WHERE o.refund_amount > 0), 'discounts', COUNT(*) FILTER (WHERE o.discount_amount > 0)) FROM orders o WHERE o.created_by = p_staff_id AND o.created_at::date = CURRENT_DATE AND o.status IN ('confirmed', 'paid', 'completed')),
    'lifetime_stats', (SELECT jsonb_build_object('total_orders', COUNT(*), 'total_revenue', COALESCE(SUM(o.total_amount), 0), 'total_shifts', (SELECT COUNT(*) FROM shifts WHERE staff_id = p_staff_id)) FROM orders o WHERE o.created_by = p_staff_id AND o.status IN ('confirmed', 'paid', 'completed')),
    'risk_score', COALESCE((SELECT rs.total_score FROM risk_scores rs WHERE rs.staff_id = p_staff_id AND rs.score_date = CURRENT_DATE), 0)
  ) INTO v_result
  FROM staff s LEFT JOIN roles r ON r.id = s.role_id WHERE s.id = p_staff_id;
  RETURN COALESCE(v_result, '{}'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_staff_detail(uuid) TO authenticated, service_role;


-- ---------------------------------------------------------------------
-- get_staff_activity — Activity timeline
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_staff_activity(p_staff_id uuid, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
RETURNS TABLE (id text, event_type text, description text, details jsonb, created_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT * FROM (
    SELECT ('order_' || o.id)::text, 'order_closed', 'Order #' || o.order_number, jsonb_build_object('total', o.total_amount), o.created_at FROM orders o WHERE o.created_by = p_staff_id
    UNION ALL
    SELECT ('void_' || o.id)::text, 'void', 'Voided', jsonb_build_object('reason', o.void_reason), o.created_at FROM orders o WHERE o.created_by = p_staff_id AND o.void_reason IS NOT NULL
    UNION ALL
    SELECT ('refund_' || o.id)::text, 'refund', 'Refund', jsonb_build_object('amount', o.refund_amount), o.created_at FROM orders o WHERE o.created_by = p_staff_id AND o.refund_amount > 0
    UNION ALL
    SELECT ('override_' || po.id)::text, 'price_override', po.item_name, jsonb_build_object('original', po.original_price, 'override', po.override_price), po.created_at FROM price_overrides po WHERE po.staff_id = p_staff_id
    UNION ALL
    SELECT ('security_' || se.id)::text, se.event_type, se.event_type, jsonb_build_object('success', se.success), se.created_at FROM security_events se WHERE se.staff_id = p_staff_id
  ) combined ORDER BY created_at DESC LIMIT p_limit OFFSET p_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_staff_activity(uuid, integer, integer) TO authenticated, service_role;
