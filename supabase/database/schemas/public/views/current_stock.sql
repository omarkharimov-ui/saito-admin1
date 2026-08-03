CREATE VIEW public.current_stock AS SELECT i.id AS ingredient_id,
    i.name,
    i.unit,
    i.min_limit,
    i.created_at,
    COALESCE(sum(t.quantity), (0)::numeric) AS total_stock,
        CASE
            WHEN (COALESCE(sum(t.quantity), (0)::numeric) <= i.min_limit) THEN true
            ELSE false
        END AS is_low_stock
   FROM (public.ingredients i
     LEFT JOIN public.stock_transactions t ON ((t.ingredient_id = i.id)))
  GROUP BY i.id, i.name, i.unit, i.min_limit, i.created_at
  ORDER BY i.name;

GRANT ALL ON public.current_stock TO anon;

GRANT ALL ON public.current_stock TO authenticated;

GRANT ALL ON public.current_stock TO service_role;