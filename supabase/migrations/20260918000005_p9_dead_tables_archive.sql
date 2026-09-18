-- =============================================================================
-- P-9 M5 — dead tables: archive + drop (ratified D-5 + D-6)
-- PROVEN (M0 E3): 0 app route references (waiter_assignments, dining_groups);
-- audit_log dead since 08-27 (67 rows) with a dormant self-mirror trigger.
--
-- M5-R1 (post-M0 dependency fix, same pattern as M4's v_closed_orders):
-- M0 E3 checked pg_depend under classid='pg_class' only, which MISSES view
-- dependencies recorded under pg_rewrite / pg_attribute. Raw pg_depend on
-- waiter_assignments showed classid=2618 (pg_rewrite) objid=35181 = the
-- staff_stats view, refobjsubid 2/4/5 (waiter_id, table_id, guest_count).
-- Fix: recreate staff_stats WITHOUT the `waiter` CTE.
--   - waiter_assignments has ZERO app writers/readers (grep: only this
--     migration family references it).
--   - staff_stats' two live consumers (get_staff_directory_v2 family fns)
--     read: avg_wait_time, table_turnover_rate, no_shows, total_orders,
--     total_revenue, cash_sales, card_sales, total_voids, total_refunds,
--     total_discounts, avg_ticket_value, avg_order_value — NONE of the five
--     waiter-CTE columns.
--   - View column contract preserved 1:1 (names + order + types); the five
--     waiter columns become the constants the COALESCE(w.*,0) wrappers always
--     produced for staff without same-day assignments.
--
-- M5-R2 (post-dry-run scope cut, user-ratified Option A 2026-09-17):
-- dining_groups was misclassified DEAD by M0 E3 (same pg_depend blind spot —
-- FKs are recorded under classid=pg_constraint, missed by the pg_class filter).
-- PROVEN LIVE/FROZEN-BOUND: merge_tables_v4 (FROZEN, P-7 V2 contract) INSERTs
-- into dining_groups on every table merge; unmerge_tables_v4 +
-- undo_operation_v4 (FROZEN) UPDATE orders.group_id (validated FK
-- orders_group_id_fkey -> dining_groups, ON DELETE SET NULL);
-- complete_payment_v4 (FROZEN) reads group_id. dining_groups is EXCLUDED
-- from this migration and stays in place.
--
-- Kept (NOT in this migration, per plan exclusions): popular_queries (LIVE via
-- upsert_popular_query), sync_operations (Q8 stub), reservations_archive +
-- reservation_tables_quarantine_2026_09 (archive-by-design), cash_registers /
-- cash_drawer_logs (FROZEN-BOUND writers — grants fixed in M1 only),
-- audit_logs (compat, active), audit_logs_canonical (SSOT, NEVER touched),
-- dining_groups (LIVE/FROZEN-BOUND — M5-R2).
-- Rollback: see 20260918000005_p9_dead_tables_archive_rollback.sql
-- =============================================================================
BEGIN;

CREATE TABLE public.p9_archive_waiter_assignments AS SELECT * FROM public.waiter_assignments;
CREATE TABLE public.p9_archive_audit_log AS SELECT * FROM public.audit_log;

DROP TRIGGER IF EXISTS trg_audit_log_mirror ON public.audit_log;

-- M5-R1: staff_stats without the waiter CTE (definition = live 2026-09-17,
-- structurally verified against pg_views.definition; waiter CTE removed,
-- LEFT JOIN waiter removed, five columns -> constants).
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
    0 AS active_tables,
    0 AS tables_served,
    0 AS guests_served,
    (0)::numeric AS total_tips,
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
    0 AS seated_guests,
    k.avg_wait_time,
    t.table_turnover_rate,
    0 AS no_shows
   FROM ((((((public.staff s
     LEFT JOIN perf p ON ((p.staff_id = s.id)))
     LEFT JOIN kitchen k ON ((k.staff_id = s.id)))
     LEFT JOIN aprv a ON ((a.staff_id = s.id)))
     LEFT JOIN sec sc ON ((sc.staff_id = s.id)))
     LEFT JOIN lbr l ON ((l.staff_id = s.id)))
     LEFT JOIN turn t ON ((t.staff_id = s.id)));

 -- dining_groups: NOT dropped (M5-R2 — LIVE/FROZEN-BOUND via merge_tables_v4).
 DROP TABLE public.audit_log;
 DROP TABLE public.waiter_assignments;

COMMIT;
