CREATE FUNCTION public.get_staff_performance (
  p_start_date date DEFAULT (CURRENT_DATE - '7 days'::interval),
  p_end_date   date DEFAULT CURRENT_DATE
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
DECLARE
  v_by_staff JSONB;
  v_top_performers JSONB;
BEGIN
  -- Staff order stats
  SELECT COALESCE(jsonb_agg(row_to_json(s)), '[]'::JSONB) INTO v_by_staff
  FROM (
    SELECT
      o.created_by AS staff_id,
      COALESCE(s.name, 'Unknown') AS staff_name,
      COUNT(*) AS orders_handled,
      COALESCE(SUM(o.total_amount), 0) AS total_sales,
      ROUND(AVG(o.total_amount), 2) AS avg_order_value,
      COUNT(*) FILTER (WHERE o.status = 'cancelled') AS cancelled_orders
    FROM orders o
    LEFT JOIN staff s ON o.created_by = s.id
    WHERE DATE(o.created_at) BETWEEN p_start_date AND p_end_date
      AND o.status NOT IN ('draft')
    GROUP BY o.created_by, s.name
    ORDER BY total_sales DESC
  ) s;

  -- Top performers by sales
  v_top_performers := (
    SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::JSONB)
    FROM (
      SELECT
        o.created_by AS staff_id,
        COALESCE(s.name, 'Unknown') AS staff_name,
        COALESCE(SUM(o.total_amount), 0) AS total_sales,
        COUNT(*) AS orders_count
      FROM orders o
      LEFT JOIN staff s ON o.created_by = s.id
      WHERE DATE(o.created_at) BETWEEN p_start_date AND p_end_date
        AND o.status = 'paid'
      GROUP BY o.created_by, s.name
      ORDER BY total_sales DESC
      LIMIT 5
    ) t
  );

  RETURN jsonb_build_object(
    'period', jsonb_build_object('start', p_start_date, 'end', p_end_date),
    'by_staff', v_by_staff,
    'top_performers', v_top_performers
  );
END;
$function$;

GRANT ALL ON FUNCTION public.get_staff_performance(date, date) TO anon;

GRANT ALL ON FUNCTION public.get_staff_performance(date, date) TO authenticated;

GRANT ALL ON FUNCTION public.get_staff_performance(date, date) TO service_role;