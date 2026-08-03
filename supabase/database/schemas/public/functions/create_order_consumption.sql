CREATE FUNCTION public.create_order_consumption (
  p_ingredient_name text,
  p_quantity        numeric,
  p_order_id        uuid,
  p_reason          text    DEFAULT 'Test sifarişi'::text
)
  RETURNS void
  LANGUAGE plpgsql
  AS $function$
DECLARE
  v_ingredient_id UUID;
  v_unit_cost NUMERIC;
BEGIN
  SELECT id, average_cost_per_unit INTO v_ingredient_id, v_unit_cost
  FROM ingredients WHERE name = p_ingredient_name;

  IF v_ingredient_id IS NULL THEN
    RAISE WARNING 'Ingredient tapılmadı: %', p_ingredient_name;
    RETURN;
  END IF;

  INSERT INTO inventory_logs (ingredient_id, type, quantity, cost_per_unit, reason, order_id, created_at)
  VALUES (v_ingredient_id, 'order_consumption', p_quantity, v_unit_cost, p_reason, p_order_id, NOW());

  UPDATE ingredients SET
    current_stock = GREATEST(0, current_stock - ABS(p_quantity)),
    theoretical_stock = GREATEST(0, theoretical_stock - ABS(p_quantity))
  WHERE id = v_ingredient_id;
END;
$function$;

GRANT ALL ON FUNCTION public.create_order_consumption(text, numeric, uuid, text) TO anon;

GRANT ALL ON FUNCTION public.create_order_consumption(text, numeric, uuid, text) TO authenticated;

GRANT ALL ON FUNCTION public.create_order_consumption(text, numeric, uuid, text) TO service_role;