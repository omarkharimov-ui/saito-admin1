CREATE VIEW public.v_daily_revenue AS SELECT date((paid_at AT TIME ZONE 'Asia/Baku'::text)) AS sale_date,
    count(DISTINCT id) AS order_count,
    COALESCE(sum(paid_amount), (0)::numeric) AS total_revenue,
    COALESCE(sum(cogs), (0)::numeric) AS total_cogs,
    COALESCE(sum(profit), (0)::numeric) AS total_profit,
    COALESCE(avg(guest_count), (0)::numeric) AS avg_guest_count,
    COALESCE(sum(tip_amount), (0)::numeric) AS total_tips,
    count(DISTINCT table_number) FILTER (WHERE (table_number IS NOT NULL)) AS unique_tables
   FROM public.orders
  WHERE ((status = 'paid'::text) AND (paid_at IS NOT NULL))
  GROUP BY (date((paid_at AT TIME ZONE 'Asia/Baku'::text)))
  ORDER BY (date((paid_at AT TIME ZONE 'Asia/Baku'::text))) DESC;

GRANT ALL ON public.v_daily_revenue TO anon;

GRANT ALL ON public.v_daily_revenue TO authenticated;

GRANT ALL ON public.v_daily_revenue TO service_role;