CREATE FUNCTION public.process_stock_in (
  p_ingredient_id  uuid,
  p_quantity       numeric,
  p_unit_cost      numeric DEFAULT NULL::numeric,
  p_reason         text    DEFAULT 'stock_in'::text,
  p_reference_type text    DEFAULT NULL::text,
  p_reference_id   uuid    DEFAULT NULL::uuid,
  p_performed_by   uuid    DEFAULT NULL::uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  AS $function$
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
$function$;

GRANT ALL ON FUNCTION public.process_stock_in(uuid, numeric, numeric, text, text, uuid, uuid) TO anon;

GRANT ALL ON FUNCTION public.process_stock_in(uuid, numeric, numeric, text, text, uuid, uuid) TO authenticated;

GRANT ALL ON FUNCTION public.process_stock_in(uuid, numeric, numeric, text, text, uuid, uuid) TO service_role;