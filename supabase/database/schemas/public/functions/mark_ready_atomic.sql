CREATE FUNCTION public.mark_ready_atomic (
  p_order_id                 uuid,
  p_performed_by             uuid    DEFAULT NULL::uuid,
  p_performed_by_terminal_id text    DEFAULT NULL::text,
  p_complete                 boolean DEFAULT false
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  AS $function$
DECLARE
  v_order RECORD;
  v_item RECORD;
  v_recipe RECORD;
  v_deducted INT := 0;
  v_final_kitchen_status TEXT := 'ready';
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;

  IF p_complete THEN
    IF v_order.kitchen_status NOT IN ('preparing', 'accepted', 'pending', 'ready') THEN
      RETURN jsonb_build_object('success', false, 'error', 'Order cannot be completed from current status');
    END IF;
    v_final_kitchen_status := 'served';
  ELSE
    IF v_order.kitchen_status NOT IN ('preparing', 'accepted', 'pending') THEN
      RETURN jsonb_build_object('success', false, 'error', 'Order cannot be marked ready');
    END IF;
    v_final_kitchen_status := 'ready';
  END IF;

  IF p_complete AND v_order.status != 'paid' THEN
    FOR v_item IN 
      SELECT oi.id, oi.product_id, oi.quantity, p.is_ready_product, p.direct_ingredient_id
      FROM public.order_items oi
      JOIN public.products p ON p.id = oi.product_id
      WHERE oi.order_id = p_order_id
      FOR UPDATE
    LOOP
      IF v_item.is_ready_product AND v_item.direct_ingredient_id IS NOT NULL THEN
        INSERT INTO public.inventory_transactions (
          order_item_id, ingredient_id, quantity, unit, transaction_type,
          reference_type, reference_id, performed_by, created_at
        ) VALUES (
          v_item.id, v_item.direct_ingredient_id, v_item.quantity, 'piece', 'order_consumption',
          'order', p_order_id, p_performed_by, NOW()
        );
        v_deducted := v_deducted + 1;
      ELSE
        FOR v_recipe IN 
          SELECT r.ingredient_id, r.quantity_required, r.quantity_brutto, i.unit
          FROM public.recipes r
          JOIN public.ingredients i ON i.id = r.ingredient_id
          WHERE r.menu_item_id = v_item.product_id
        LOOP
          INSERT INTO public.inventory_transactions (
            order_item_id, ingredient_id, quantity, unit, transaction_type,
            reference_type, reference_id, performed_by, created_at
          ) VALUES (
            v_item.id, v_recipe.ingredient_id, 
            COALESCE(v_recipe.quantity_brutto, v_recipe.quantity_required) * v_item.quantity,
            v_recipe.unit, 'order_consumption', 'order', p_order_id, p_performed_by, NOW()
          );
          v_deducted := v_deducted + 1;
        END LOOP;
      END IF;
    END LOOP;
  END IF;

  UPDATE public.orders SET
    kitchen_status = v_final_kitchen_status,
    kitchen_ready_at = CASE WHEN v_final_kitchen_status IN ('ready', 'served') THEN NOW() ELSE kitchen_ready_at END,
    status = CASE WHEN p_complete THEN 'completed' ELSE status END,
    completed_at = CASE WHEN p_complete THEN NOW() ELSE completed_at END,
    updated_at = NOW(),
    version = COALESCE(version, 0) + 1,
    updated_by_terminal_id = p_performed_by_terminal_id
  WHERE id = p_order_id;

  UPDATE public.order_items SET
    kitchen_status = CASE WHEN p_complete THEN 'served' ELSE 'ready' END,
    updated_at = NOW()
  WHERE order_id = p_order_id AND kitchen_status NOT IN ('cancelled', 'comped', 'wasted', 'served');

  IF v_order.table_number IS NOT NULL THEN
    UPDATE public.table_floors SET
      kitchen_status = v_final_kitchen_status,
      updated_at = NOW()
    WHERE table_number = v_order.table_number;
  END IF;

  INSERT INTO public.operation_logs (
    table_number, order_id, action, old_values, new_values, performed_by
  ) VALUES (
    v_order.table_number, p_order_id, 'mark_ready',
    jsonb_build_object('kitchen_status', v_order.kitchen_status, 'status', v_order.status),
    jsonb_build_object('kitchen_status', v_final_kitchen_status, 'status', CASE WHEN p_complete THEN 'completed' ELSE v_order.status END, 'inventory_deducted', v_deducted),
    p_performed_by
  );

  RETURN jsonb_build_object('success', true, 'inventory_deducted', v_deducted);
END;
$function$;

CREATE FUNCTION public.mark_ready_atomic (
  p_order_id     uuid,
  p_performed_by uuid DEFAULT NULL::uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  AS $function$
DECLARE
  v_order RECORD;
  v_item RECORD;
  v_recipe RECORD;
  v_deducted INT := 0;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;

  IF v_order.kitchen_status NOT IN ('preparing', 'accepted', 'pending', 'service') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order cannot be marked ready from current status');
  END IF;

  IF v_order.kitchen_status = 'service' THEN
    UPDATE public.order_items SET kitchen_status = 'ready', updated_at = NOW() WHERE order_id = p_order_id AND kitchen_status = 'service';
  END IF;

  IF v_order.status != 'paid' THEN
    FOR v_item IN 
      SELECT oi.id, oi.product_id, oi.quantity, p.is_ready_product, p.direct_ingredient_id
      FROM public.order_items oi
      JOIN public.products p ON p.id = oi.product_id
      WHERE oi.order_id = p_order_id
      FOR UPDATE
    LOOP
      IF v_item.is_ready_product AND v_item.direct_ingredient_id IS NOT NULL THEN
        INSERT INTO public.inventory_transactions (
          order_item_id, ingredient_id, quantity, unit, transaction_type,
          reference_type, reference_id, performed_by, created_at
        ) VALUES (
          v_item.id, v_item.direct_ingredient_id, v_item.quantity, 'piece', 'order_consumption',
          'order', p_order_id, p_performed_by, NOW()
        );
        v_deducted := v_deducted + 1;
      ELSE
        FOR v_recipe IN 
          SELECT r.ingredient_id, r.quantity_required, r.quantity_brutto, i.unit
          FROM public.recipes r
          JOIN public.ingredients i ON i.id = r.ingredient_id
          WHERE r.menu_item_id = v_item.product_id
        LOOP
          INSERT INTO public.inventory_transactions (
            order_item_id, ingredient_id, quantity, unit, transaction_type,
            reference_type, reference_id, performed_by, created_at
          ) VALUES (
            v_item.id, v_recipe.ingredient_id, 
            COALESCE(v_recipe.quantity_brutto, v_recipe.quantity_required) * v_item.quantity,
            v_recipe.unit, 'order_consumption', 'order', p_order_id, p_performed_by, NOW()
          );
          v_deducted := v_deducted + 1;
        END LOOP;
      END IF;
    END LOOP;
  END IF;

  UPDATE public.orders SET
    kitchen_status = 'ready',
    kitchen_ready_at = NOW(),
    updated_at = NOW()
  WHERE id = p_order_id;

  IF v_order.table_number IS NOT NULL THEN
    UPDATE public.table_floors SET
      kitchen_status = 'ready',
      updated_at = NOW()
    WHERE table_number = v_order.table_number;
  END IF;

  INSERT INTO public.operation_logs (
    table_number, order_id, action, old_values, new_values, performed_by
  ) VALUES (
    v_order.table_number, p_order_id, 'mark_ready',
    jsonb_build_object('kitchen_status', v_order.kitchen_status),
    jsonb_build_object('kitchen_status', 'ready', 'inventory_deducted', v_deducted),
    p_performed_by
  );

  RETURN jsonb_build_object('success', true, 'inventory_deducted', v_deducted);
END;
$function$;

GRANT ALL ON FUNCTION public.mark_ready_atomic(uuid, uuid, text, boolean) TO anon;

GRANT ALL ON FUNCTION public.mark_ready_atomic(uuid, uuid, text, boolean) TO authenticated;

GRANT ALL ON FUNCTION public.mark_ready_atomic(uuid, uuid, text, boolean) TO service_role;

GRANT ALL ON FUNCTION public.mark_ready_atomic(uuid, uuid) TO anon;

GRANT ALL ON FUNCTION public.mark_ready_atomic(uuid, uuid) TO authenticated;

GRANT ALL ON FUNCTION public.mark_ready_atomic(uuid, uuid) TO service_role;