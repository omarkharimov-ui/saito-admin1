-- P-9 M5 ROLLBACK — restore the 2 dropped tables (audit_log,
-- waiter_assignments) with original DDL (from
-- .p9-audit/p9_schema_dump.sql) + archive data + the mirror trigger +
-- the original staff_stats view (with the waiter CTE; M5-R1 recreated it
-- without). dining_groups: untouched by M5 (M5-R2 scope cut).
-- NOTE: order matters — tables first, then the view that reads
-- waiter_assignments.
BEGIN;
CREATE TABLE public.audit_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    table_name text NOT NULL,
    record_id uuid,
    action text NOT NULL,
    old_data jsonb,
    new_data jsonb,
    performed_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    changed_by uuid
);
INSERT INTO public.audit_log (id, table_name, record_id, action, old_data, new_data, performed_by, created_at, changed_by)
  SELECT id, table_name, record_id, action, old_data, new_data, performed_by, created_at, changed_by FROM public.p9_archive_audit_log;
CREATE TRIGGER trg_audit_log_mirror AFTER INSERT ON public.audit_log FOR EACH ROW EXECUTE FUNCTION public.mirror_audit_log_to_audit_logs();

CREATE TABLE public.waiter_assignments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    waiter_id uuid,
    table_id uuid,
    guest_count integer DEFAULT 0,
    status text DEFAULT 'occupied'::text,
    seated_at timestamp with time zone DEFAULT now(),
    completed_at timestamp with time zone,
    total_amount numeric DEFAULT 0,
    tip_amount numeric DEFAULT 0,
    created_at timestamp with time zone DEFAULT now()
);
INSERT INTO public.waiter_assignments (id, waiter_id, table_id, guest_count, status, seated_at, completed_at, total_amount, tip_amount, created_at)
  SELECT id, waiter_id, table_id, guest_count, status, seated_at, completed_at, total_amount, tip_amount, created_at FROM public.p9_archive_waiter_assignments;

-- dining_groups: untouched by M5 (M5-R2 scope cut) — nothing to restore.

-- M5-R1 rollback: original staff_stats WITH the waiter CTE (pre-P-9 definition,
-- verbatim from .p9-audit/p9_schema_dump.sql lines 26984-27096).
DROP VIEW IF EXISTS public.staff_stats;
CREATE VIEW public.staff_stats AS
 WITH perf AS (
         SELECT o.created_by AS staff_id,
            (count(*))::integer AS total_orders,
            COALESCE(sum(o.total_amount), (0)::numeric) AS total_revenue,
            COALESCE(sum(o.cash_amount), (0)::numeric) AS cash_sales,
            COALESCE(sum(o.card_amount), (0)::numeric) AS card_sales,
            (count(*) FILTER (WHERE (o.void_reason IS NOT NULL)))::integer AS total_voids,
            COALESCE(sum(o.refund_amount), (0)::numeric) AS total_refunds,
            COALESCE(sum(o.discount_amount), (0)::numeric) AS total_discounts,
            COALESCE(avg(o.total_amount), (0)::numeric) AS avg_ticket_value,
            COALESCE(avg(o.total_amount), (0)::numeric) AS avg_order_value
           FROM public.orders o
          WHERE (((o.created_at)::date = CURRENT_DATE) AND (o.status = ANY (ARRAY['confirmed'::text, 'paid'::text, 'completed'::text])) AND (o.is_draft IS NOT TRUE))
          GROUP BY o.created_by
        ), kitchen AS (
         SELECT kt.assigned_to AS staff_id,
            (count(*) FILTER (WHERE (kt.status = ANY (ARRAY['pending'::text, 'preparing'::text]))))::integer AS active_tickets,
            (count(*) FILTER (WHERE (kt.status = 'completed'::text)))::integer AS completed_tickets,
                CASE
                    WHEN (count(*) FILTER (WHERE (kt.status = 'completed'::text)) = 0) THEN NULL::text
                    ELSE (round((EXTRACT(epoch FROM avg((kt.completed_at - kt.created_at)) FILTER (WHERE (kt.status = 'completed'::text))) / (60)::numeric), 1))::text
                END AS avg_prep_time,
            (count(*) FILTER (WHERE ((kt.status = 'completed'::text) AND ((kt.completed_at - kt.created_at) > '00:15:00'::interval))))::integer AS late_tickets,
            (count(*) FILTER (WHERE (kt.status = 'cancelled'::text)))::integer AS cancelled_tickets,
            (round((COALESCE(avg(EXTRACT(epoch FROM (kt.completed_at - kt.created_at))), (0)::numeric) / (60)::numeric), 1))::text AS avg_wait_time
           FROM public.kitchen_tickets kt
          WHERE ((kt.created_at)::date = CURRENT_DATE)
          GROUP BY kt.assigned_to
        ), waiter AS (
         SELECT wa.waiter_id AS staff_id,
            (count(*) FILTER (WHERE (wa.status = 'occupied'::text)))::integer AS active_tables,
            (count(*) FILTER (WHERE (wa.status = 'completed'::text)))::integer AS tables_served,
            (COALESCE(sum(wa.guest_count), (0)::bigint))::integer AS guests_served,
            (COALESCE(sum(wa.guest_count) FILTER (WHERE (wa.status = 'occupied'::text)), (0)::bigint))::integer AS seated_guests,
            COALESCE(sum(wa.tip_amount), (0)::numeric) AS total_tips
           FROM public.waiter_assignments wa
          WHERE ((wa.created_at)::date = CURRENT_DATE)
          GROUP BY wa.waiter_id
        ), aprv AS (
         SELECT ar.staff_id,
            (count(*))::integer AS approvals_count,
            (count(*) FILTER (WHERE ((ar.action_type ~~* '%void%'::text) OR (ar.action_type ~~* '%refund%'::text))))::integer AS void_refund_approvals
           FROM public.approval_requests ar
          WHERE ((ar.created_at)::date = CURRENT_DATE)
          GROUP BY ar.staff_id
        ), sec AS (
         SELECT se.staff_id,
            (count(*))::integer AS exceptions_count
           FROM public.security_events se
          WHERE ((se.created_at)::date = CURRENT_DATE)
          GROUP BY se.staff_id
        ), lbr AS (
         SELECT sh.staff_id,
            sum((GREATEST((EXTRACT(epoch FROM (COALESCE(sh.closed_at, now()) - sh.opened_at)) / (3600)::numeric), (0)::numeric) * COALESCE(s_1.hourly_rate, (0)::numeric))) AS labor_cost,
            sum(GREATEST((EXTRACT(epoch FROM (COALESCE(sh.closed_at, now()) - sh.opened_at)) / (3600)::numeric), (0)::numeric)) AS hours
           FROM (public.shifts sh
             JOIN public.staff s_1 ON ((s_1.id = sh.staff_id)))
          WHERE (date(sh.opened_at) = CURRENT_DATE)
          GROUP BY sh.staff_id
        ), turn AS (
         SELECT o.created_by AS staff_id,
            (round((avg(EXTRACT(epoch FROM (COALESCE(o.closed_at, now()) - o.created_at))) / (60)::numeric), 1))::text AS table_turnover_rate
           FROM public.orders o
          WHERE (((o.created_at)::date = CURRENT_DATE) AND (o.status = ANY (ARRAY['confirmed'::text, 'paid'::text, 'completed'::text])))
          GROUP BY o.created_by
        )
 SELECT s.id AS staff_id,
    CURRENT_DATE AS period,
    COALESCE(p.total_orders, 0) AS total_orders,
    COALESCE(p.total_revenue, (0)::numeric) AS total_revenue,
    COALESCE(p.cash_sales, (0)::numeric) AS cash_sales,
    COALESCE(p.card_sales, (0)::numeric) AS card_sales,
    COALESCE(p.total_voids, 0) AS total_voids,
    COALESCE(p.total_refunds, (0)::numeric) AS total_refunds,
    COALESCE(p.total_discounts, (0)::numeric) AS total_discounts,
    COALESCE(p.avg_ticket_value, (0)::numeric) AS avg_ticket_value,
    COALESCE(p.avg_order_value, (0)::numeric) AS avg_order_value,
    COALESCE(k.active_tickets, 0) AS active_tickets,
    COALESCE(k.completed_tickets, 0) AS completed_tickets,
    k.avg_prep_time,
    COALESCE(k.late_tickets, 0) AS late_tickets,
    0 AS items_prepared,
    0 AS re_fired,
    COALESCE(k.cancelled_tickets, 0) AS cancelled_tickets,
    0 AS waste_count,
    COALESCE(w.active_tables, 0) AS active_tables,
    COALESCE(w.tables_served, 0) AS tables_served,
    COALESCE(w.guests_served, 0) AS guests_served,
    COALESCE(w.total_tips, (0)::numeric) AS total_tips,
    COALESCE(a.approvals_count, 0) AS approvals_count,
    COALESCE(sc.exceptions_count, 0) AS exceptions_count,
        CASE
            WHEN (COALESCE(p.total_revenue, (0)::numeric) > (0)::numeric) THEN ((COALESCE(l.labor_cost, (0)::numeric) / p.total_revenue) * (100)::numeric)
            ELSE (0)::numeric
        END AS labor_cost_percent,
        CASE
            WHEN (COALESCE(l.labor_cost, (0)::numeric) > (0)::numeric) THEN (COALESCE(p.total_revenue, (0)::numeric) / l.labor_cost)
            ELSE (0)::numeric
        END AS labor_efficiency,
    COALESCE(a.void_refund_approvals, 0) AS void_refund_approvals,
    COALESCE(w.seated_guests, 0) AS seated_guests,
    k.avg_wait_time,
    t.table_turnover_rate,
    0 AS no_shows
   FROM (((((((public.staff s
     LEFT JOIN perf p ON ((p.staff_id = s.id)))
     LEFT JOIN kitchen k ON ((k.staff_id = s.id)))
     LEFT JOIN waiter w ON ((w.staff_id = s.id)))
     LEFT JOIN aprv a ON ((a.staff_id = s.id)))
     LEFT JOIN sec sc ON ((sc.staff_id = s.id)))
     LEFT JOIN lbr l ON ((l.staff_id = s.id)))
     LEFT JOIN turn t ON ((t.staff_id = s.id)));
COMMIT;
