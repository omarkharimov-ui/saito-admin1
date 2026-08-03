CREATE FUNCTION public.perform_stock_audit (
  p_ingredient_id uuid,
  p_actual_qty    numeric,
  p_reason        text    DEFAULT 'physical_count'::text,
  p_performed_by  uuid    DEFAULT NULL::uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
DECLARE
  v_ingredient RECORD;
  v_variance NUMERIC;
  v_variance_pct NUMERIC;
  v_alert_id UUID;
BEGIN
  SELECT * INTO v_ingredient FROM ingredients WHERE id = p_ingredient_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'INGREDIENT_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  v_variance := p_actual_qty - COALESCE(v_ingredient.current_stock, 0);
  v_variance_pct := CASE
    WHEN COALESCE(v_ingredient.current_stock, 0) > 0
    THEN ABS(v_variance) / v_ingredient.current_stock * 100
    ELSE 0
  END;

  INSERT INTO inventory_logs (
    ingredient_id, type, quantity, cost_per_unit, reason,
    reference_type, reference_id
  ) VALUES (
    p_ingredient_id, 'adjustment', v_variance, v_ingredient.average_cost_per_unit,
    'Audit: ' || COALESCE(p_reason, 'physical_count'),
    'audit', gen_random_uuid()::TEXT
  );

  UPDATE ingredients SET
    current_stock = GREATEST(0, p_actual_qty),
    theoretical_stock = GREATEST(0, p_actual_qty),
    updated_at = now()
  WHERE id = p_ingredient_id;

  v_variance_pct := CASE
    WHEN COALESCE(v_ingredient.current_stock, 0) > 0
    THEN ABS(v_variance) / v_ingredient.current_stock * 100
    ELSE 0
  END;

  IF v_variance_pct > 10 THEN
    INSERT INTO notifications (type, title, body, data, created_at)
    VALUES (
      'alert',
      'Böyük stok fərqi',
      v_ingredient.name || ' — fərq: ' || ROUND(ABS(v_variance), 2) || ' (' || ROUND(v_variance_pct, 1) || '%)',
      jsonb_build_object('ingredient_id', p_ingredient_id, 'variance', v_variance, 'variance_pct', v_variance_pct),
      now()
    )
    RETURNING id INTO v_alert_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'ingredient_id', p_ingredient_id,
    'variance', v_variance,
    'variance_pct', v_variance_pct,
    'new_stock', GREATEST(0, p_actual_qty),
    'alert_id', v_alert_id
  );
END;
$function$;

GRANT ALL ON FUNCTION public.perform_stock_audit(uuid, numeric, text, uuid) TO anon;

GRANT ALL ON FUNCTION public.perform_stock_audit(uuid, numeric, text, uuid) TO authenticated;

GRANT ALL ON FUNCTION public.perform_stock_audit(uuid, numeric, text, uuid) TO service_role;