CREATE FUNCTION public.recalculate_cost_for_recipe()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  AS $function$
DECLARE
  v_product_id uuid;
  v_total_cost numeric;
  v_price numeric;
  v_margin numeric;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_product_id := OLD.menu_item_id;
  ELSE
    v_product_id := NEW.menu_item_id;
  END IF;

  SELECT price INTO v_price FROM products WHERE id = v_product_id;

  -- quantity_brutto istifadə et (cold waste daxil)
  SELECT COALESCE(SUM(COALESCE(r.quantity_brutto, r.quantity_required) * i.average_cost_per_unit), 0)
  INTO v_total_cost
  FROM recipes r
  JOIN ingredients i ON i.id = r.ingredient_id
  WHERE r.menu_item_id = v_product_id AND r.is_ai_suggested = false;

  IF v_price > 0 THEN
    v_margin := ((v_price - v_total_cost) / v_price) * 100;
  ELSE
    v_margin := 0;
  END IF;

  UPDATE products
  SET cost_price = ROUND(v_total_cost, 2),
      profit_margin = ROUND(v_margin, 1)
  WHERE id = v_product_id;

  RETURN COALESCE(NEW, OLD);
END;
$function$;

GRANT ALL ON FUNCTION public.recalculate_cost_for_recipe() TO anon;

GRANT ALL ON FUNCTION public.recalculate_cost_for_recipe() TO authenticated;

GRANT ALL ON FUNCTION public.recalculate_cost_for_recipe() TO service_role;