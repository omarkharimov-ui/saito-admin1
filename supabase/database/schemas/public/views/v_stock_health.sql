CREATE VIEW public.v_stock_health AS SELECT count(*) FILTER (WHERE ((current_stock <= (0)::numeric) OR (current_stock IS NULL))) AS out_of_stock_count,
    count(*) FILTER (WHERE ((current_stock > (0)::numeric) AND (current_stock <= critical_limit))) AS critical_count,
    count(*) FILTER (WHERE ((current_stock > critical_limit) OR (critical_limit IS NULL) OR (critical_limit = (0)::numeric))) AS normal_count,
    count(*) AS total_ingredients,
    round((((count(*) FILTER (WHERE ((current_stock <= (0)::numeric) OR (current_stock IS NULL))))::numeric / (GREATEST(count(*), (1)::bigint))::numeric) * (100)::numeric), 1) AS out_of_stock_pct
   FROM public.ingredients;

GRANT ALL ON public.v_stock_health TO anon;

GRANT ALL ON public.v_stock_health TO authenticated;

GRANT ALL ON public.v_stock_health TO service_role;