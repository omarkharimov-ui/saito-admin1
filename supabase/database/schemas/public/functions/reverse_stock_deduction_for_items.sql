CREATE FUNCTION public.reverse_stock_deduction_for_items (
  p_items text
)
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
DECLARE
  v_item JSONB;
  v_reverse_qty NUMERIC;
  v_log RECORD;
  v_total_reversed INTEGER := 0;
  v_order_item_id UUID;
  v_proportion NUMERIC;
BEGIN
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items::JSONB)
  LOOP
    v_order_item_id := (v_item->>'order_item_id')::UUID;
    v_reverse_qty := (v_item->>'reverse_qty')::NUMERIC;

    -- For each inventory_log entry matching this order_item_id,
    -- reverse proportionally: per-unit consumption = ABS(quantity) / item_quantity
    FOR v_log IN
      SELECT id, ingredient_id, quantity, unit_cost, item_quantity
      FROM inventory_logs
      WHERE order_item_id = v_order_item_id
        AND item_quantity > 0
      FOR UPDATE
    LOOP
      v_proportion := v_reverse_qty / v_log.item_quantity;
      -- Restore stock: ABS(v_log.quantity) * v_proportion → add back
      UPDATE ingredients
      SET current_stock = COALESCE(current_stock, 0) + (ABS(v_log.quantity) * v_proportion)
      WHERE id = v_log.ingredient_id;

      -- Update inventory_log to show partial reversal
      UPDATE inventory_logs
      SET quantity = quantity + (ABS(v_log.quantity) * v_proportion * -1)
      WHERE id = v_log.id;

      v_total_reversed := v_total_reversed + 1;
    END LOOP;
  END LOOP;

  RETURN v_total_reversed;
END;
$function$;

GRANT ALL ON FUNCTION public.reverse_stock_deduction_for_items(text) TO anon;

GRANT ALL ON FUNCTION public.reverse_stock_deduction_for_items(text) TO authenticated;

GRANT ALL ON FUNCTION public.reverse_stock_deduction_for_items(text) TO service_role;