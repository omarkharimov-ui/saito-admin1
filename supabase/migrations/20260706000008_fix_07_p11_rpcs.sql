-- ============================================================================
-- FIX 7/8: P11 — Stock automation RPCs
-- ============================================================================

-- 7a: process_stock_in
CREATE OR REPLACE FUNCTION process_stock_in(
  p_ingredient_id UUID,
  p_quantity NUMERIC,
  p_unit_cost NUMERIC DEFAULT NULL,
  p_reason TEXT DEFAULT 'stock_in',
  p_reference_type TEXT DEFAULT NULL,
  p_reference_id UUID DEFAULT NULL,
  p_performed_by UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_old_stock NUMERIC;
  v_old_avg_cost NUMERIC;
  v_ingredient RECORD;
BEGIN
  SELECT * INTO v_ingredient FROM ingredients WHERE id = p_ingredient_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'INGREDIENT_NOT_FOUND' USING ERRCODE = 'P0001'; END IF;

  v_old_stock := COALESCE(v_ingredient.current_stock, 0);
  v_old_avg_cost := COALESCE(v_ingredient.average_cost_per_unit, 0);

  UPDATE ingredients SET
    current_stock = v_old_stock + p_quantity,
    average_cost_per_unit = CASE WHEN p_unit_cost IS NOT NULL AND p_unit_cost > 0
      THEN (v_old_avg_cost * v_old_stock + p_unit_cost * p_quantity) / (v_old_stock + p_quantity)
      ELSE average_cost_per_unit END,
    purchase_price = COALESCE(p_unit_cost, purchase_price),
    updated_at = now()
  WHERE id = p_ingredient_id;

  INSERT INTO inventory_logs (ingredient_id, type, quantity, cost_per_unit, reason, reference_type, reference_id, notes, created_at)
  VALUES (p_ingredient_id, 'stock_in', p_quantity, p_unit_cost, p_reason,
    p_reference_type, p_reference_id,
    'Stock in: +' || p_quantity || ' @ ' || COALESCE(p_unit_cost::TEXT, '0'), now());

  RETURN jsonb_build_object('success', true, 'ingredient_id', p_ingredient_id,
    'previous_stock', v_old_stock, 'new_stock', v_old_stock + p_quantity,
    'new_avg_cost', (SELECT average_cost_per_unit FROM ingredients WHERE id = p_ingredient_id));
END;
$$;

-- 7b: apply_stock_count
CREATE OR REPLACE FUNCTION apply_stock_count(
  p_count_id UUID,
  p_performed_by UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
AS $$
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
$$;

-- 7c: process_supplier_return
CREATE OR REPLACE FUNCTION process_supplier_return(
  p_return_id UUID,
  p_performed_by UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_return RECORD;
  v_item RECORD;
  v_total NUMERIC(12,2) := 0;
BEGIN
  SELECT * INTO v_return FROM supplier_returns WHERE id = p_return_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'RETURN_NOT_FOUND' USING ERRCODE = 'P0001'; END IF;
  IF v_return.status != 'draft' THEN RAISE EXCEPTION 'RETURN_ALREADY_PROCESSED' USING ERRCODE = 'P0001'; END IF;

  FOR v_item IN
    SELECT sri.*, i.name, i.current_stock
    FROM supplier_return_items sri
    JOIN ingredients i ON i.id = sri.ingredient_id
    WHERE sri.supplier_return_id = p_return_id
    FOR UPDATE OF i
  LOOP
    UPDATE ingredients SET current_stock = GREATEST(0, COALESCE(current_stock, 0) - v_item.quantity), updated_at = now()
    WHERE id = v_item.ingredient_id;

    INSERT INTO inventory_logs (ingredient_id, type, quantity, cost_per_unit, reason, reference_type, reference_id, notes, created_at)
    VALUES (v_item.ingredient_id, 'waste', -v_item.quantity, v_item.unit_cost,
      'return_to_supplier', 'supplier_return', p_return_id,
      'Returned to supplier: ' || v_item.quantity || ' x ' || COALESCE(v_item.unit_cost, 0), now());

    v_total := v_total + v_item.total_cost;
  END LOOP;

  UPDATE supplier_returns SET status = 'completed', total_amount = v_total, returned_at = now(), updated_at = now()
  WHERE id = p_return_id;

  INSERT INTO notifications (type, title, body, data, created_at)
  VALUES ('stock', 'Təchizatçıya geri qaytarılma',
    v_return.return_number || ' — ' || v_total || ' AZN',
    jsonb_build_object('return_id', p_return_id, 'supplier_id', v_return.supplier_id, 'total_amount', v_total), now());

  RETURN jsonb_build_object('success', true, 'return_id', p_return_id, 'total_amount', v_total, 'return_number', v_return.return_number);
END;
$$;

-- 7d: check_stock_thresholds
CREATE OR REPLACE FUNCTION check_stock_thresholds()
RETURNS TABLE(ingredient_id UUID, ingredient_name TEXT, current_stock NUMERIC, critical_limit NUMERIC, unit TEXT)
LANGUAGE plpgsql
AS $$
DECLARE
  v_ingredient RECORD;
BEGIN
  FOR v_ingredient IN SELECT * FROM ingredients WHERE current_stock <= critical_limit AND critical_limit > 0 LOOP
    IF NOT EXISTS (SELECT 1 FROM discrepancy_alerts WHERE source_id = v_ingredient.id AND source_table = 'ingredients' AND type = 'stock_vs_sales' AND status = 'open') THEN
      INSERT INTO discrepancy_alerts (type, severity, title, description, source_id, source_table, value, expected_value, variance_pct, status, created_at)
      VALUES ('stock_vs_sales',
        CASE WHEN v_ingredient.current_stock <= 0 THEN 'critical' WHEN v_ingredient.current_stock <= v_ingredient.critical_limit * 0.5 THEN 'high' ELSE 'medium' END,
        'Low stock: ' || v_ingredient.name,
        'Current: ' || v_ingredient.current_stock || ' ' || v_ingredient.unit || ' (threshold: ' || v_ingredient.critical_limit || ')',
        v_ingredient.id, 'ingredients', v_ingredient.current_stock, v_ingredient.critical_limit,
        GREATEST(0, (1 - v_ingredient.current_stock / NULLIF(v_ingredient.critical_limit, 0)) * 100), 'open', now());
    END IF;

    INSERT INTO notifications (type, title, body, data, created_at)
    VALUES ('stock', 'Ehtiyat azalıb: ' || v_ingredient.name,
      'Cari: ' || v_ingredient.current_stock || ' ' || v_ingredient.unit || ' (limit: ' || v_ingredient.critical_limit || ')',
      jsonb_build_object('ingredient_id', v_ingredient.id, 'current_stock', v_ingredient.current_stock, 'critical_limit', v_ingredient.critical_limit, 'unit', v_ingredient.unit), now());
  END LOOP;

  RETURN QUERY SELECT i.id, i.name::TEXT, i.current_stock, i.critical_limit, i.unit
    FROM ingredients i WHERE i.current_stock <= i.critical_limit AND i.critical_limit > 0;
END;
$$;
