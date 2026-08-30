CREATE OR REPLACE FUNCTION public.close_day_atomic (
  p_report_date  date,
  p_daily_report jsonb,
  p_shift        jsonb,
  p_cash_drawer  jsonb,
  p_audit_log    jsonb DEFAULT NULL::jsonb,
  p_performed_by uuid  DEFAULT NULL::uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  AS $function$
  DECLARE
  v_report_id UUID;
  v_shift_id UUID;
BEGIN
  PERFORM public.validate_actor(p_performed_by);
  INSERT INTO public.daily_reports (
    report_date, total_revenue, total_orders, aov, cash_total, card_total,
    tips_total, discounts_total, voids_count, voids_amount, tax_collected,
    starting_cash, expected_cash, actual_cash, cash_difference, cogs,
    labor_cost, items_sold, raw_data, closed_at, closed_by, notes
  ) VALUES (
    p_report_date,
    COALESCE(p_daily_report->>'total_revenue', '0')::NUMERIC,
    COALESCE(p_daily_report->>'total_orders', '0')::INTEGER,
    COALESCE(p_daily_report->>'aov', '0')::NUMERIC,
    COALESCE(p_daily_report->>'cash_total', '0')::NUMERIC,
    COALESCE(p_daily_report->>'card_total', '0')::NUMERIC,
    COALESCE(p_daily_report->>'tips_total', '0')::NUMERIC,
    COALESCE(p_daily_report->>'discounts_total', '0')::NUMERIC,
    COALESCE(p_daily_report->>'voids_count', '0')::INTEGER,
    COALESCE(p_daily_report->>'voids_amount', '0')::NUMERIC,
    COALESCE(p_daily_report->>'tax_collected', '0')::NUMERIC,
    COALESCE(p_daily_report->>'starting_cash', '0')::NUMERIC,
    COALESCE(p_daily_report->>'expected_cash', '0')::NUMERIC,
    COALESCE(p_daily_report->>'actual_cash', '0')::NUMERIC,
    COALESCE(p_daily_report->>'cash_difference', '0')::NUMERIC,
    COALESCE(p_daily_report->>'cogs', '0')::NUMERIC,
    COALESCE(p_daily_report->>'labor_cost', '0')::NUMERIC,
    COALESCE(p_daily_report->>'items_sold', '0')::INTEGER,
    COALESCE(p_daily_report->'raw_data', '{}'::jsonb),
    NOW(),
    p_performed_by,
    p_daily_report->>'notes'
  ) RETURNING id INTO v_report_id;

  INSERT INTO public.shifts (
    id, report_id, report_date, staff_id, opened_at, closed_at,
    starting_cash, expected_cash, actual_cash, difference, notes
  ) VALUES (
    COALESCE(p_shift->>'id', gen_random_uuid()),
    v_report_id,
    p_report_date,
    COALESCE(p_shift->>'staff_id', p_performed_by),
    COALESCE((p_shift->>'opened_at')::TIMESTAMPTZ, NOW()),
    COALESCE((p_shift->>'closed_at')::TIMESTAMPTZ, NOW()),
    COALESCE(p_shift->>'starting_cash', '0')::NUMERIC,
    COALESCE(p_shift->>'expected_cash', '0')::NUMERIC,
    COALESCE(p_shift->>'actual_cash', '0')::NUMERIC,
    COALESCE(p_shift->>'difference', '0')::NUMERIC,
    p_shift->>'notes'
  ) RETURNING id INTO v_shift_id;

  INSERT INTO public.cash_drawer_logs (
    shift_id, staff_id, action, amount, description,
    starting_cash, expected_cash, actual_cash, difference,
    opened_at, closed_at, notes
  ) VALUES (
    v_shift_id,
    COALESCE(p_cash_drawer->>'staff_id', p_performed_by),
    COALESCE(p_cash_drawer->>'action', 'close_day'),
    COALESCE(p_cash_drawer->>'amount', '0')::NUMERIC,
    p_cash_drawer->>'description',
    COALESCE(p_cash_drawer->>'starting_cash', '0')::NUMERIC,
    COALESCE(p_cash_drawer->>'expected_cash', '0')::NUMERIC,
    COALESCE(p_cash_drawer->>'actual_cash', '0')::NUMERIC,
    COALESCE(p_cash_drawer->>'difference', '0')::NUMERIC,
    COALESCE((p_cash_drawer->>'opened_at')::TIMESTAMPTZ, NOW()),
    COALESCE((p_cash_drawer->>'closed_at')::TIMESTAMPTZ, NOW()),
    p_cash_drawer->>'notes'
  );

  IF p_audit_log IS NOT NULL THEN
    INSERT INTO public.operation_logs (
      action, old_values, new_values, performed_by
    ) VALUES (
      COALESCE(p_audit_log->>'action', 'close_day'),
      COALESCE(p_audit_log->>'old_values', '{}'::jsonb),
      COALESCE(p_audit_log->>'new_values', jsonb_build_object('report_id', v_report_id, 'shift_id', v_shift_id)),
      p_performed_by
    );
  END IF;

  RETURN jsonb_build_object('success', true, 'report_id', v_report_id, 'shift_id', v_shift_id);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$function$;



