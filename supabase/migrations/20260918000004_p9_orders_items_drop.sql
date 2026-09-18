-- =============================================================================
-- P-9 M4 — orders.items legacy jsonb column (ratified D-4)
-- M0 proved 0 fn/constraint dependents; the M4 apply attempt surfaced ONE
-- additional dependency: the DEAD view v_closed_orders (0 app/gate readers —
-- grep-verified) uses jsonb_array_length(items) AS item_count. Schema comment
-- itself states: "orders.items is NOT canonical" (SSOT = order_items, 0.1.37).
-- Fix: recreate v_closed_orders with item_count derived from order_items
-- (semantics preserved for any future consumer), archive non-null values, drop.
-- Rollback: see 20260918000004_p9_orders_items_drop_rollback.sql
-- =============================================================================
CREATE TABLE public.p9_archive_orders_items AS
  SELECT id, items FROM public.orders WHERE items IS NOT NULL;

DROP VIEW public.v_closed_orders;
CREATE VIEW public.v_closed_orders AS
 SELECT id AS order_id,
    table_number,
    total_amount,
    paid_amount,
    payment_method,
    discount_type,
    discount_value,
    cogs,
    profit,
    (COALESCE(paid_amount, (0)::numeric) - COALESCE(cogs, (0)::numeric)) AS gross_profit,
        CASE
            WHEN (COALESCE(paid_amount, (0)::numeric) > (0)::numeric) THEN round((((COALESCE(paid_amount, (0)::numeric) - COALESCE(cogs, (0)::numeric)) / COALESCE(paid_amount, (0)::numeric)) * (100)::numeric), 1)
            ELSE (0)::numeric
        END AS profit_margin_pct,
    tip_amount,
    guest_count,
    created_at AS order_created_at,
    paid_at,
    updated_at,
    reservation_id,
    (SELECT count(*) FROM public.order_items oi WHERE oi.order_id = o.id) AS item_count
   FROM public.orders o
  WHERE (status = 'paid'::text);

ALTER TABLE public.orders DROP COLUMN items;
