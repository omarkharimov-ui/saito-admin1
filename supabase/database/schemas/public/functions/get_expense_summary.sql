CREATE FUNCTION public.get_expense_summary (
  p_start_date date DEFAULT (CURRENT_DATE - '30 days'::interval),
  p_end_date   date DEFAULT CURRENT_DATE
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
DECLARE
  v_total NUMERIC;
  v_by_category JSONB;
  v_daily JSONB;
BEGIN
  SELECT COALESCE(SUM(amount), 0) INTO v_total
  FROM expenses
  WHERE expense_date BETWEEN p_start_date AND p_end_date;

  SELECT COALESCE(jsonb_agg(row_to_json(c)), '[]'::JSONB) INTO v_by_category
  FROM (
    SELECT
      category,
      COUNT(*) AS count,
      COALESCE(SUM(amount), 0) AS total
    FROM expenses
    WHERE expense_date BETWEEN p_start_date AND p_end_date
    GROUP BY category
    ORDER BY total DESC
  ) c;

  SELECT COALESCE(jsonb_agg(row_to_json(d)), '[]'::JSONB) INTO v_daily
  FROM (
    SELECT
      expense_date AS date,
      COALESCE(SUM(amount), 0) AS total
    FROM expenses
    WHERE expense_date BETWEEN p_start_date AND p_end_date
    GROUP BY expense_date
    ORDER BY expense_date
  ) d;

  RETURN jsonb_build_object(
    'period', jsonb_build_object('start', p_start_date, 'end', p_end_date),
    'total', v_total,
    'by_category', v_by_category,
    'daily', v_daily
  );
END;
$function$;

GRANT ALL ON FUNCTION public.get_expense_summary(date, date) TO anon;

GRANT ALL ON FUNCTION public.get_expense_summary(date, date) TO authenticated;

GRANT ALL ON FUNCTION public.get_expense_summary(date, date) TO service_role;