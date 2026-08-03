CREATE FUNCTION public.get_sales_report (
  p_start_date date DEFAULT CURRENT_DATE,
  p_end_date   date DEFAULT CURRENT_DATE
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
DECLARE
  v_daily JSONB;
  v_by_category JSONB;
  v_by_product JSONB;
  v_by_source JSONB;
BEGIN
  -- Daily breakdown
  SELECT COALESCE(jsonb_agg(row_to_json(d)), '[]'::JSONB) INTO v_daily
  FROM (
    SELECT
      DATE(o.paid_at) AS date,
      COUNT(*) AS orders,
      COALESCE(SUM(o.total_amount), 0) AS revenue,
      ROUND(AVG(o.total_amount), 2) AS aov,
      COUNT(*) FILTER (WHERE o.order_source = 'dine_in') AS dine_in_orders,
      COUNT(*) FILTER (WHERE o.order_source = 'takeaway') AS takeaway_orders,
      COUNT(*) FILTER (WHERE o.order_source = 'delivery') AS delivery_orders
    FROM orders o
    WHERE o.status = 'paid'
      AND DATE(o.paid_at) BETWEEN p_start_date AND p_end_date
    GROUP BY DATE(o.paid_at)
    ORDER BY DATE(o.paid_at)
  ) d;

  -- By category
  SELECT COALESCE(jsonb_agg(row_to_json(c)), '[]'::JSONB) INTO v_by_category
  FROM (
    SELECT
      cat.name AS category_name,
      COUNT(*) AS items_sold,
      COALESCE(SUM(oi.total_price), 0) AS revenue
    FROM order_items oi
    JOIN orders o ON oi.order_id = o.id
    JOIN products p ON oi.product_id = p.id
    JOIN categories cat ON p.category_id = cat.id
    WHERE o.status = 'paid'
      AND DATE(o.paid_at) BETWEEN p_start_date AND p_end_date
      AND oi.kitchen_status NOT IN ('cancelled')
    GROUP BY cat.name
    ORDER BY revenue DESC
  ) c;

  -- By product
  SELECT COALESCE(jsonb_agg(row_to_json(p)), '[]'::JSONB) INTO v_by_product
  FROM (
    SELECT
      oi.product_name,
      SUM(oi.quantity) AS quantity_sold,
      COALESCE(SUM(oi.total_price), 0) AS revenue,
      ROUND(AVG(oi.unit_price), 2) AS avg_price
    FROM order_items oi
    JOIN orders o ON oi.order_id = o.id
    WHERE o.status = 'paid'
      AND DATE(o.paid_at) BETWEEN p_start_date AND p_end_date
      AND oi.kitchen_status NOT IN ('cancelled')
    GROUP BY oi.product_name
    ORDER BY revenue DESC
    LIMIT 20
  ) p;

  -- By order source
  SELECT COALESCE(jsonb_agg(row_to_json(s)), '[]'::JSONB) INTO v_by_source
  FROM (
    SELECT
      o.order_source,
      COUNT(*) AS orders,
      COALESCE(SUM(o.total_amount), 0) AS revenue
    FROM orders o
    WHERE o.status = 'paid'
      AND DATE(o.paid_at) BETWEEN p_start_date AND p_end_date
    GROUP BY o.order_source
  ) s;

  RETURN jsonb_build_object(
    'period', jsonb_build_object('start', p_start_date, 'end', p_end_date),
    'daily', v_daily,
    'by_category', v_by_category,
    'by_product', v_by_product,
    'by_source', v_by_source
  );
END;
$function$;

GRANT ALL ON FUNCTION public.get_sales_report(date, date) TO anon;

GRANT ALL ON FUNCTION public.get_sales_report(date, date) TO authenticated;

GRANT ALL ON FUNCTION public.get_sales_report(date, date) TO service_role;