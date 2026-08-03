CREATE VIEW public.inventory_status AS SELECT id,
    name,
    unit,
    current_stock,
    theoretical_stock,
    critical_limit,
    average_cost_per_unit,
    purchase_price,
    cold_waste_percentage,
    updated_at,
        CASE
            WHEN (current_stock <= (0)::numeric) THEN 'out_of_stock'::text
            WHEN (current_stock <= critical_limit) THEN 'critical'::text
            ELSE 'normal'::text
        END AS status,
        CASE
            WHEN (critical_limit > (0)::numeric) THEN round(((current_stock / critical_limit) * (100)::numeric), 2)
            ELSE (0)::numeric
        END AS stock_ratio,
    COALESCE(( SELECT sum((l.quantity * i2.average_cost_per_unit)) AS sum
           FROM (public.inventory_logs l
             JOIN public.ingredients i2 ON ((i2.id = l.ingredient_id)))
          WHERE ((l.ingredient_id = i.id) AND (l.type = 'waste'::public.inventory_log_type) AND (l.created_at >= date_trunc('month'::text, now())))), (0)::numeric) AS monthly_waste_cost
   FROM public.ingredients i;

GRANT ALL ON public.inventory_status TO anon;

GRANT ALL ON public.inventory_status TO authenticated;

GRANT ALL ON public.inventory_status TO service_role;