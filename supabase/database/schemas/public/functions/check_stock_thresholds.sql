CREATE FUNCTION public.check_stock_thresholds()
  RETURNS TABLE (
    ingredient_id   uuid,
    ingredient_name text,
    current_stock   numeric,
    critical_limit  numeric,
    unit            text
  )
  LANGUAGE plpgsql
  AS $function$
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
$function$;

GRANT ALL ON FUNCTION public.check_stock_thresholds() TO anon;

GRANT ALL ON FUNCTION public.check_stock_thresholds() TO authenticated;

GRANT ALL ON FUNCTION public.check_stock_thresholds() TO service_role;