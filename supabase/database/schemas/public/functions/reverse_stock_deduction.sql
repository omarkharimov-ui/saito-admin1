CREATE FUNCTION public.reverse_stock_deduction (
  p_order_id uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
DECLARE
  v_reversed INTEGER := 0;
  v_log RECORD;
BEGIN
  FOR v_log IN
    SELECT ingredient_id, SUM(quantity) AS total_qty
    FROM inventory_logs
    WHERE reference_type = 'order'
      AND reference_id = p_order_id
      AND type = 'order_consumption'
    GROUP BY ingredient_id
  LOOP
    -- Restore stock
    UPDATE ingredients
    SET current_stock = COALESCE(current_stock, 0) + ABS(v_log.total_qty)
    WHERE id = v_log.ingredient_id;

    v_reversed := v_reversed + 1;
  END LOOP;

  -- Record reversal in inventory_logs for audit trail
  INSERT INTO inventory_logs (ingredient_id, type, quantity, reference_type, reference_id, order_id, notes, created_at)
  SELECT
    ingredient_id,
    'adjustment',
    ABS(SUM(quantity)),
    'reversal',
    p_order_id,
    p_order_id,
    'Auto: Cancel reversal for order ' || p_order_id::TEXT,
    now()
  FROM inventory_logs
  WHERE reference_type = 'order'
    AND reference_id = p_order_id
    AND type = 'order_consumption'
  GROUP BY ingredient_id;

  RETURN jsonb_build_object(
    'success', true,
    'order_id', p_order_id,
    'ingredients_reversed', v_reversed
  );
END;
$function$;

GRANT ALL ON FUNCTION public.reverse_stock_deduction(uuid) TO anon;

GRANT ALL ON FUNCTION public.reverse_stock_deduction(uuid) TO authenticated;

GRANT ALL ON FUNCTION public.reverse_stock_deduction(uuid) TO service_role;