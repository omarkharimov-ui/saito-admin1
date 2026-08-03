CREATE VIEW public.order_hourly_stats WITH (security_invoker=on) AS SELECT EXTRACT(hour FROM (created_at AT TIME ZONE 'Asia/Baku'::text)) AS hour,
    count(*) AS order_count
   FROM public.orders
  WHERE (created_at >= (now() - '30 days'::interval))
  GROUP BY (EXTRACT(hour FROM (created_at AT TIME ZONE 'Asia/Baku'::text)))
  ORDER BY (count(*)) DESC;

GRANT ALL ON public.order_hourly_stats TO anon;

GRANT ALL ON public.order_hourly_stats TO authenticated;

GRANT ALL ON public.order_hourly_stats TO service_role;