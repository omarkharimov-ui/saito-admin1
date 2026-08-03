CREATE FUNCTION public.apply_wac_on_stock_in()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  AS $function$
DECLARE
  v_old_stock numeric;
  v_old_avg_cost numeric;
  v_wac numeric;
BEGIN
  -- Yalnız stock_in tipində işlə
  IF NEW.type != 'stock_in' THEN
    RETURN NEW;
  END IF;

  -- Mövcud stoku və ortalama dəyəri oxu
  SELECT COALESCE(current_stock, 0), COALESCE(average_cost_per_unit, 0)
  INTO v_old_stock, v_old_avg_cost
  FROM ingredients WHERE id = NEW.ingredient_id;

  -- WAC = (köhnə miqdar × köhnə ortalama + təzə miqdar × təzə qiymət) / (köhnə + təzə)
  IF (v_old_stock + NEW.quantity) > 0 THEN
    v_wac := (v_old_stock * v_old_avg_cost + NEW.quantity * COALESCE(NEW.cost_per_unit, 0)) / (v_old_stock + NEW.quantity);
  ELSE
    v_wac := COALESCE(NEW.cost_per_unit, v_old_avg_cost);
  END IF;

  -- WAC-i yenilə — bu, trg_recalculate_costs trigger-ini işə salacaq
  UPDATE ingredients
  SET average_cost_per_unit = ROUND(v_wac, 6),
      purchase_price = COALESCE(NEW.cost_per_unit, purchase_price),
      updated_at = now()
  WHERE id = NEW.ingredient_id;

  RETURN NEW;
END;
$function$;

GRANT ALL ON FUNCTION public.apply_wac_on_stock_in() TO anon;

GRANT ALL ON FUNCTION public.apply_wac_on_stock_in() TO authenticated;

GRANT ALL ON FUNCTION public.apply_wac_on_stock_in() TO service_role;