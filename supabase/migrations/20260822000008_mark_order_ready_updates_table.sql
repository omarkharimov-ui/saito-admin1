-- Update mark_order_ready to also set table_floors.status = 'ready'
-- This ensures the POS table map reflects kitchen-ready state automatically

CREATE OR REPLACE FUNCTION public.mark_order_ready (
  p_order_id uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
DECLARE
  v_order RECORD;
  v_deducted INTEGER := 0;
BEGIN
  SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'ORDER_NOT_FOUND');
  END IF;

  UPDATE order_items
  SET kitchen_status = 'ready'
  WHERE order_id = p_order_id
    AND kitchen_status IN ('pending', 'preparing', 'cooking', 'accepted');

  UPDATE orders SET
    kitchen_status = 'ready',
    kitchen_ready_at = now(),
    version = COALESCE(version, 0) + 1
  WHERE id = p_order_id;

  -- Auto-advance delivery_status for delivery orders
  IF v_order.order_source = 'delivery' AND COALESCE(v_order.delivery_status, 'pending') IN ('pending', 'confirmed', 'preparing') THEN
    UPDATE orders SET delivery_status = 'ready', updated_at = now() WHERE id = p_order_id;
  END IF;

  -- Auto-advance status for takeaway orders
  IF v_order.order_source = 'takeaway' AND v_order.status IN ('confirmed', 'in_kitchen') THEN
    UPDATE orders SET status = 'ready', updated_at = now() WHERE id = p_order_id;
  END IF;

  -- Update table_floors status to ready for dine-in orders
  IF v_order.order_source = 'dine_in' AND v_order.table_number IS NOT NULL AND v_order.table_number > 0 THEN
    UPDATE public.table_floors
    SET status = 'ready', updated_at = now()
    WHERE table_number = v_order.table_number;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM inventory_logs
    WHERE reference_type = 'order' AND reference_id = p_order_id
    LIMIT 1
  ) THEN
    INSERT INTO inventory_logs (ingredient_id, type, quantity, unit_cost, reference_type, reference_id, order_id, notes, created_at)
    SELECT
      r.ingredient_id, 'order_consumption',
      (r.quantity_required * oi.quantity),
      COALESCE(i.average_cost_per_unit, 0),
      'order', p_order_id, p_order_id,
      'Ready: Order ' || p_order_id::TEXT, now()
    FROM order_items oi
    JOIN products p ON p.id = oi.product_id
    JOIN recipes r ON r.menu_item_id = p.id
    JOIN ingredients i ON i.id = r.ingredient_id
    WHERE oi.order_id = p_order_id
      AND (oi.kitchen_status IS DISTINCT FROM 'cancelled')
      AND (p.is_ready_product IS NOT TRUE);

    GET DIAGNOSTICS v_deducted = ROW_COUNT;

    INSERT INTO inventory_logs (ingredient_id, type, quantity, unit_cost, reference_type, reference_id, order_id, notes, created_at)
    SELECT
      p.direct_ingredient_id, 'order_consumption',
      oi.quantity, COALESCE(i.average_cost_per_unit, 0),
      'order', p_order_id, p_order_id,
      'Ready: Order ' || p_order_id::TEXT, now()
    FROM order_items oi
    JOIN products p ON p.id = oi.product_id
    LEFT JOIN ingredients i ON i.id = p.direct_ingredient_id
    WHERE oi.order_id = p_order_id
      AND (oi.kitchen_status IS DISTINCT FROM 'cancelled')
      AND p.is_ready_product = TRUE
      AND p.direct_ingredient_id IS NOT NULL;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'order_id', p_order_id,
    'status', 'ready',
    'deducted_ingredients', v_deducted
  );
END;
$function$;

GRANT ALL ON FUNCTION public.mark_order_ready(uuid) TO anon;
GRANT ALL ON FUNCTION public.mark_order_ready(uuid) TO authenticated;
GRANT ALL ON FUNCTION public.mark_order_ready(uuid) TO service_role;
