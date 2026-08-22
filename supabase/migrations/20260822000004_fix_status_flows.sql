-- Fix order lifecycle state transitions and auto-advance status on kitchen actions

-- 1. Remove invalid transitions that skip required steps
-- Takeaway must go through confirmed before in_kitchen/ready/paid
DELETE FROM public.state_transitions WHERE entity = 'order' AND from_status = 'new' AND to_status = 'paid';
-- Takeaway must not return to kitchen after payment
DELETE FROM public.state_transitions WHERE entity = 'order' AND from_status = 'paid' AND to_status = 'in_kitchen';
-- Dine-in must serve before payment
DELETE FROM public.state_transitions WHERE entity = 'order' AND from_status = 'in_kitchen' AND to_status = 'paid';
DELETE FROM public.state_transitions WHERE entity = 'order' AND from_status = 'ready' AND to_status = 'paid';

-- 2. Modify prepare_order_items to auto-advance order.status for dine-in/takeaway
CREATE OR REPLACE FUNCTION public.prepare_order_items (
  p_order_id uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
DECLARE
  v_updated INTEGER;
  v_order RECORD;
BEGIN
  SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  UPDATE order_items
  SET kitchen_status = 'preparing'
  WHERE order_id = p_order_id
    AND kitchen_status IN ('pending', 'accepted', 'reserved');

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated > 0 THEN
    UPDATE orders SET
      kitchen_status = 'preparing',
      kitchen_accepted_at = now()
    WHERE id = p_order_id
      AND kitchen_status IS DISTINCT FROM 'preparing';

    -- Auto-advance order.status for dine-in/takeaway: confirmed → in_kitchen
    IF v_order.order_source IN ('dine_in', 'takeaway') AND v_order.status = 'confirmed' THEN
      PERFORM transition_order_status(p_order_id, 'in_kitchen', NULL::uuid, NULL::text, NULL::text, NULL::jsonb);
    END IF;
  END IF;

  RETURN jsonb_build_object('success', true, 'updated_items', v_updated);
END;
$function$;

GRANT ALL ON FUNCTION public.prepare_order_items(uuid) TO anon;
GRANT ALL ON FUNCTION public.prepare_order_items(uuid) TO authenticated;
GRANT ALL ON FUNCTION public.prepare_order_items(uuid) TO service_role;


-- 3. Modify mark_order_ready to auto-advance order.status for dine-in and use SSOT for takeaway
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

  -- Auto-advance status for takeaway orders via SSOT
  IF v_order.order_source = 'takeaway' AND v_order.status IN ('confirmed', 'in_kitchen') AND v_order.status <> 'ready' THEN
    PERFORM transition_order_status(p_order_id, 'ready', NULL::uuid, NULL::text, NULL::text, NULL::jsonb);
  END IF;

  -- Auto-advance status for dine-in orders: in_kitchen/partially_ready → ready
  IF v_order.order_source = 'dine_in' AND v_order.status IN ('in_kitchen', 'partially_ready') AND v_order.status <> 'ready' THEN
    PERFORM transition_order_status(p_order_id, 'ready', NULL::uuid, NULL::text, NULL::text, NULL::jsonb);
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
