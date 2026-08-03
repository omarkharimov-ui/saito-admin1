CREATE FUNCTION public.deduct_stock_on_order (
  p_order_id uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  AS $function$
DECLARE
  v_item RECORD;
  v_deduct_qty NUMERIC;
  v_ingredient_id UUID;
  v_notes TEXT;
  v_total_deducted INTEGER := 0;
  v_errors TEXT[] := '{}';
BEGIN
  -- Idempotency: skip if already deducted
  IF EXISTS (SELECT 1 FROM inventory_logs WHERE reference_type = 'order' AND reference_id = p_order_id LIMIT 1) THEN
    RETURN jsonb_build_object('success', true, 'order_id', p_order_id, 'deductions', 0, 'skipped', true);
  END IF;

  FOR v_item IN
    SELECT oi.id, oi.product_id, oi.quantity, oi.product_name,
           p.is_ready_product, p.direct_ingredient_id
    FROM order_items oi
    JOIN products p ON p.id = oi.product_id
    WHERE oi.order_id = p_order_id
      AND (oi.kitchen_status IS DISTINCT FROM 'cancelled')
  LOOP
    IF v_item.is_ready_product AND v_item.direct_ingredient_id IS NOT NULL THEN
      v_ingredient_id := v_item.direct_ingredient_id;
      v_deduct_qty := v_item.quantity;
      v_notes := 'Ready-product: ' || COALESCE(v_item.product_name, '?');
      INSERT INTO inventory_logs (ingredient_id, type, quantity, unit_cost, reference_type, reference_id, order_id, notes, created_at)
      SELECT v_ingredient_id, 'order_consumption'::inventory_log_type, v_deduct_qty, COALESCE(i.average_cost_per_unit, 0), 'order', p_order_id, p_order_id, v_notes, now()
      FROM ingredients i WHERE i.id = v_ingredient_id;
      IF NOT FOUND THEN
        INSERT INTO inventory_logs (ingredient_id, type, quantity, unit_cost, reference_type, reference_id, order_id, notes, created_at)
        VALUES (v_ingredient_id, 'order_consumption'::inventory_log_type, v_deduct_qty, 0, 'order', p_order_id, p_order_id, v_notes, now());
      END IF;
      v_total_deducted := v_total_deducted + 1;
    ELSIF NOT v_item.is_ready_product OR v_item.is_ready_product IS NULL THEN
      FOR v_ingredient_id, v_deduct_qty IN
        SELECT r.ingredient_id, COALESCE(r.quantity_brutto, r.quantity_required) * v_item.quantity
        FROM recipes r
        WHERE r.menu_item_id = v_item.product_id
      LOOP
        v_notes := 'Recipe: ' || COALESCE(v_item.product_name, '?');
        INSERT INTO inventory_logs (ingredient_id, type, quantity, unit_cost, reference_type, reference_id, order_id, notes, created_at)
        SELECT v_ingredient_id, 'order_consumption'::inventory_log_type, v_deduct_qty, COALESCE(i.average_cost_per_unit, 0), 'order', p_order_id, p_order_id, v_notes, now()
        FROM ingredients i WHERE i.id = v_ingredient_id;
        IF NOT FOUND THEN
          INSERT INTO inventory_logs (ingredient_id, type, quantity, unit_cost, reference_type, reference_id, order_id, notes, created_at)
          VALUES (v_ingredient_id, 'order_consumption'::inventory_log_type, v_deduct_qty, 0, 'order', p_order_id, p_order_id, v_notes, now());
        END IF;
        v_total_deducted := v_total_deducted + 1;
      END LOOP;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'order_id', p_order_id, 'deductions', v_total_deducted);
END;
$function$;

GRANT ALL ON FUNCTION public.deduct_stock_on_order(uuid) TO anon;

GRANT ALL ON FUNCTION public.deduct_stock_on_order(uuid) TO authenticated;

GRANT ALL ON FUNCTION public.deduct_stock_on_order(uuid) TO service_role;