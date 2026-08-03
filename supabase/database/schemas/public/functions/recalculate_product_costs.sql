CREATE FUNCTION public.recalculate_product_costs()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  AS $function$
DECLARE
  v_product RECORD;
  v_total_cost numeric;
  v_margin numeric;
BEGIN
  FOR v_product IN
    SELECT DISTINCT p.id, p.price
    FROM products p
    JOIN recipes r ON r.menu_item_id = p.id
    WHERE r.ingredient_id = NEW.id AND r.is_ai_suggested = false
  LOOP
    -- Maya dəyəri = Σ(quantity_brutto × average_cost_per_unit)
    -- quantity_brutto cold waste-i əhatə edir
    SELECT COALESCE(SUM(COALESCE(r2.quantity_brutto, r2.quantity_required) * i2.average_cost_per_unit), 0)
    INTO v_total_cost
    FROM recipes r2
    JOIN ingredients i2 ON i2.id = r2.ingredient_id
    WHERE r2.menu_item_id = v_product.id AND r2.is_ai_suggested = false;

    IF v_product.price > 0 THEN
      v_margin := ((v_product.price - v_total_cost) / v_product.price) * 100;
    ELSE
      v_margin := 0;
    END IF;

    UPDATE products
    SET cost_price = ROUND(v_total_cost, 2),
        profit_margin = ROUND(v_margin, 1)
    WHERE id = v_product.id;
  END LOOP;

  RETURN NEW;
END;
$function$;

GRANT ALL ON FUNCTION public.recalculate_product_costs() TO anon;

GRANT ALL ON FUNCTION public.recalculate_product_costs() TO authenticated;

GRANT ALL ON FUNCTION public.recalculate_product_costs() TO service_role;