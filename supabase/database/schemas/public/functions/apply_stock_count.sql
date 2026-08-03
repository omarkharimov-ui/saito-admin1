CREATE FUNCTION public.apply_stock_count (
  p_count_id     uuid,
  p_performed_by uuid DEFAULT NULL::uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  AS $function$
DECLARE
  v_item RECORD;
  v_count RECORD;
  v_total_variance NUMERIC(12,2) := 0;
  v_variance_pct NUMERIC;
  v_alert_id UUID;
BEGIN
  SELECT * INTO v_count FROM stock_counts WHERE id = p_count_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'COUNT_NOT_FOUND' USING ERRCODE = 'P0001'; END IF;
  IF v_count.status != 'completed' THEN RAISE EXCEPTION 'COUNT_NOT_COMPLETED' USING ERRCODE = 'P0001'; END IF;
  IF v_count.status = 'cancelled' THEN RAISE EXCEPTION 'COUNT_CANCELLED' USING ERRCODE = 'P0001'; END IF;

  FOR v_item IN
    SELECT sci.*, i.name AS ingredient_name, i.current_stock, i.average_cost_per_unit
    FROM stock_count_items sci
    JOIN ingredients i ON i.id = sci.ingredient_id
    WHERE sci.stock_count_id = p_count_id
    FOR UPDATE OF i
  LOOP
    v_variance_pct := CASE WHEN v_item.system_qty > 0 THEN ABS(v_item.variance) / v_item.system_qty * 100 ELSE 0 END;

    INSERT INTO inventory_logs (ingredient_id, type, quantity, cost_per_unit, reason, reference_type, reference_id, notes, created_at)
    VALUES (v_item.ingredient_id, 'adjustment', v_item.variance, v_item.average_cost_per_unit,
      'stock_count', 'stock_count', p_count_id,
      'Stock count: ' || v_item.actual_qty || ' (system: ' || v_item.system_qty || ')', now());

    UPDATE ingredients SET current_stock = GREATEST(0, v_item.actual_qty), theoretical_stock = v_item.actual_qty, updated_at = now()
    WHERE id = v_item.ingredient_id;

    v_total_variance := v_total_variance + ABS(v_item.variance_cost);

    IF v_variance_pct > 10 AND ABS(v_item.variance) > 0 THEN
      INSERT INTO discrepancy_alerts (type, severity, title, description, source_id, source_table, value, expected_value, variance_pct, status, created_at)
      VALUES ('stock_vs_sales',
        CASE WHEN v_variance_pct > 50 THEN 'critical' WHEN v_variance_pct > 25 THEN 'high' ELSE 'medium' END,
        'Stock count variance: ' || v_item.ingredient_name,
        'Count ' || v_item.actual_qty || ' vs system ' || v_item.system_qty || ' (' || ROUND(v_variance_pct, 1) || '%)',
        v_item.ingredient_id, 'ingredients', v_item.actual_qty, v_item.system_qty, v_variance_pct, 'open', now());
    END IF;
  END LOOP;

  UPDATE stock_counts SET total_variance = v_total_variance, updated_at = now() WHERE id = p_count_id;

  RETURN jsonb_build_object('success', true, 'count_id', p_count_id, 'total_variance', v_total_variance, 'count_number', v_count.count_number);
END;
$function$;

GRANT ALL ON FUNCTION public.apply_stock_count(uuid, uuid) TO anon;

GRANT ALL ON FUNCTION public.apply_stock_count(uuid, uuid) TO authenticated;

GRANT ALL ON FUNCTION public.apply_stock_count(uuid, uuid) TO service_role;