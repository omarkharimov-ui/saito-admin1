CREATE FUNCTION public.update_stock_on_log()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  AS $function$
DECLARE
  v_current  NUMERIC;
  v_avg_cost NUMERIC;
  v_new_stock NUMERIC;
BEGIN
  SELECT current_stock, average_cost_per_unit
    INTO v_current, v_avg_cost
    FROM ingredients WHERE id = NEW.ingredient_id;

  IF NEW.type = 'stock_in' THEN
    v_new_stock := v_current + NEW.quantity;
    -- Ortalama maya dəyəri: weighted average
    IF NEW.cost_per_unit IS NOT NULL AND NEW.cost_per_unit > 0 THEN
      v_avg_cost := CASE
        WHEN v_current = 0 THEN NEW.cost_per_unit
        ELSE (v_current * v_avg_cost + NEW.quantity * NEW.cost_per_unit) / v_new_stock
      END;
    END IF;
  ELSE
    -- waste / adjustment / order_consumption → azalt
    v_new_stock := GREATEST(v_current - NEW.quantity, 0);
  END IF;

  UPDATE ingredients SET
    current_stock         = v_new_stock,
    average_cost_per_unit = v_avg_cost,
    updated_at            = now()
  WHERE id = NEW.ingredient_id;

  RETURN NEW;
END;
$function$;

GRANT ALL ON FUNCTION public.update_stock_on_log() TO anon;

GRANT ALL ON FUNCTION public.update_stock_on_log() TO authenticated;

GRANT ALL ON FUNCTION public.update_stock_on_log() TO service_role;