CREATE VIEW public.v_top_products AS SELECT p.id AS product_id,
    p.name_az AS product_name,
    p.category_id,
    c.name_az AS category_name,
    count(DISTINCT o.id) AS order_count,
    sum(oi.quantity) AS total_quantity_sold,
    sum(oi.total_price) AS total_revenue,
    p.cost_price,
    (sum(oi.total_price) - (COALESCE(p.cost_price, (0)::numeric) * (sum(oi.quantity))::numeric)) AS estimated_profit
   FROM (((public.order_items oi
     JOIN public.orders o ON (((o.id = oi.order_id) AND (o.status = 'paid'::text))))
     JOIN public.products p ON ((p.id = oi.product_id)))
     LEFT JOIN public.categories c ON ((c.id = p.category_id)))
  GROUP BY p.id, p.name_az, p.category_id, c.name_az, p.cost_price
  ORDER BY (sum(oi.quantity)) DESC;

GRANT ALL ON public.v_top_products TO anon;

GRANT ALL ON public.v_top_products TO authenticated;

GRANT ALL ON public.v_top_products TO service_role;