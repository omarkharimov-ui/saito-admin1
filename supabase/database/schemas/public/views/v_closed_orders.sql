CREATE VIEW public.v_closed_orders AS SELECT id AS order_id,
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

GRANT ALL ON public.v_closed_orders TO anon;

GRANT ALL ON public.v_closed_orders TO authenticated;

GRANT ALL ON public.v_closed_orders TO service_role;