CREATE FUNCTION public.get_z_report (
  p_date date DEFAULT CURRENT_DATE
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
DECLARE
  v_result JSONB;
  v_total_revenue NUMERIC := 0;
  v_total_orders INTEGER := 0;
  v_aov NUMERIC := 0;
  v_items_sold INTEGER := 0;
  v_cash_total NUMERIC := 0;
  v_card_total NUMERIC := 0;
  v_tips_total NUMERIC := 0;
  v_discounts_total NUMERIC := 0;
  v_voids_count INTEGER := 0;
  v_voids_amount NUMERIC := 0;
  v_starting_cash NUMERIC := 0;
  v_expected_cash NUMERIC := 0;
  v_cogs NUMERIC := 0;
  v_labor_cost NUMERIC := 0;
  v_expenses_total NUMERIC := 0;
  v_expenses_breakdown JSONB;
  v_previous_report RECORD;
BEGIN
  -- Get previous report for starting cash
  SELECT * INTO v_previous_report
  FROM daily_reports
  WHERE report_date < p_date
  ORDER BY report_date DESC LIMIT 1;

  IF v_previous_report IS NOT NULL THEN
    v_starting_cash := COALESCE(v_previous_report.actual_cash, 0);
  END IF;

  -- Aggregate from orders
  SELECT
    COALESCE(SUM(total_amount), 0),
    COUNT(*),
    COALESCE(SUM(tip_amount), 0),
    COALESCE(SUM(discount_amount), 0)
  INTO v_total_revenue, v_total_orders, v_tips_total, v_discounts_total
  FROM orders
  WHERE status = 'paid'
    AND DATE(paid_at) = p_date;

  IF v_total_orders > 0 THEN
    v_aov := ROUND(v_total_revenue / v_total_orders, 2);
  END IF;

  -- Items sold
  SELECT COUNT(*) INTO v_items_sold
  FROM order_items oi
  JOIN orders o ON oi.order_id = o.id
  WHERE o.status = 'paid'
    AND DATE(o.paid_at) = p_date
    AND oi.kitchen_status NOT IN ('cancelled');

  -- Payment breakdown from order_payments
  SELECT
    COALESCE(SUM(CASE WHEN op.payment_method IN ('cash', 'nağd') THEN op.amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN op.payment_method IN ('card', 'kart') THEN op.amount ELSE 0 END), 0)
  INTO v_cash_total, v_card_total
  FROM order_payments op
  JOIN orders o ON op.order_id = o.id
  WHERE o.status = 'paid'
    AND DATE(o.paid_at) = p_date;

  -- Fallback to orders
  IF v_cash_total = 0 AND v_card_total = 0 AND v_total_revenue > 0 THEN
    SELECT
      COALESCE(SUM(CASE WHEN o.payment_method IN ('cash', 'nağd') THEN o.total_amount ELSE 0 END), 0),
      COALESCE(SUM(CASE WHEN o.payment_method IN ('card', 'kart') THEN o.total_amount ELSE 0 END), 0)
    INTO v_cash_total, v_card_total
    FROM orders o
    WHERE o.status = 'paid'
      AND DATE(o.paid_at) = p_date;
  END IF;

  -- Voids
  SELECT COUNT(*), COALESCE(SUM(total_amount), 0)
  INTO v_voids_count, v_voids_amount
  FROM orders
  WHERE status = 'cancelled'
    AND DATE(cancelled_at) = p_date;

  -- COGS from orders (if tracked)
  SELECT COALESCE(SUM(cogs), 0) INTO v_cogs
  FROM orders
  WHERE status = 'paid'
    AND DATE(paid_at) = p_date;

  -- Labor cost
  SELECT COALESCE(SUM(amount), 0) INTO v_labor_cost
  FROM expenses
  WHERE expense_date = p_date AND category = 'labor';

  -- Expenses breakdown
  SELECT COALESCE(jsonb_object_agg(category, total), '{}'::JSONB)
  INTO v_expenses_breakdown
  FROM (
    SELECT category, SUM(amount) AS total
    FROM expenses
    WHERE expense_date = p_date
    GROUP BY category
  ) sub;

  SELECT COALESCE(SUM(amount), 0) INTO v_expenses_total
  FROM expenses
  WHERE expense_date = p_date;

  v_expected_cash := v_starting_cash + v_cash_total - v_expenses_total;

  v_result := jsonb_build_object(
    'report_date', p_date,
    'sales', jsonb_build_object(
      'total_revenue', v_total_revenue,
      'total_orders', v_total_orders,
      'aov', v_aov,
      'items_sold', v_items_sold
    ),
    'payments', jsonb_build_object(
      'cash_total', v_cash_total,
      'card_total', v_card_total,
      'tips_total', v_tips_total,
      'discounts_total', v_discounts_total
    ),
    'voids', jsonb_build_object(
      'count', v_voids_count,
      'amount', v_voids_amount
    ),
    'cash_drawer', jsonb_build_object(
      'starting_cash', v_starting_cash,
      'expected_cash', v_expected_cash,
      'cash_received', v_cash_total
    ),
    'costs', jsonb_build_object(
      'cogs', v_cogs,
      'labor_cost', v_labor_cost,
      'total_expenses', v_expenses_total,
      'expenses_breakdown', v_expenses_breakdown
    ),
    'profit', jsonb_build_object(
      'gross', v_total_revenue - v_cogs,
      'net', v_total_revenue - v_cogs - v_labor_cost - v_expenses_total
    )
  );

  RETURN v_result;
END;
$function$;

GRANT ALL ON FUNCTION public.get_z_report(date) TO anon;

GRANT ALL ON FUNCTION public.get_z_report(date) TO authenticated;

GRANT ALL ON FUNCTION public.get_z_report(date) TO service_role;