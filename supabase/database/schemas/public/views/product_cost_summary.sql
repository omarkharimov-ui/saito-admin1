CREATE VIEW public.product_cost_summary AS SELECT p.id AS product_id,
    p.name_az AS product_name,
    p.price AS sale_price,
    COALESCE(sum((COALESCE(r.quantity_brutto, r.quantity_required) * i.average_cost_per_unit)), (0)::numeric) AS calculated_cost,
        CASE
            WHEN (p.price > (0)::numeric) THEN round((((p.price - COALESCE(sum((COALESCE(r.quantity_brutto, r.quantity_required) * i.average_cost_per_unit)), (0)::numeric)) / p.price) * (100)::numeric), 1)
            ELSE (0)::numeric
        END AS calculated_margin
   FROM ((public.products p
     LEFT JOIN public.recipes r ON (((r.menu_item_id = p.id) AND (r.is_ai_suggested = false))))
     LEFT JOIN public.ingredients i ON ((i.id = r.ingredient_id)))
  GROUP BY p.id, p.name_az, p.price;

GRANT ALL ON public.product_cost_summary TO anon;

GRANT ALL ON public.product_cost_summary TO authenticated;

GRANT ALL ON public.product_cost_summary TO service_role;