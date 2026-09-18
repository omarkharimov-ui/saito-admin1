-- P-9 M4 ROLLBACK — restore orders.items (from archive) + original v_closed_orders
-- (original definition preserved in .p9-audit/p9_schema_dump.sql)
BEGIN;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS items jsonb;
UPDATE public.orders o SET items = a.items
FROM public.p9_archive_orders_items a WHERE a.id = o.id;

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
    jsonb_array_length(items) AS item_count
   FROM public.orders o
  WHERE (status = 'paid'::text);
COMMIT;
