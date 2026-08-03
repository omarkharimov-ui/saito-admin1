-- mark_ready_atomic: kitchen marks order as ready, deduct inventory if not already paid
CREATE OR REPLACE FUNCTION public.mark_ready_atomic(
  p_order_id UUID,
  p_performed_by UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
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

  IF v_order.kitchen_status NOT IN ('preparing', 'accepted', 'pending') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order cannot be marked ready');
  END IF;

  -- Deduct inventory only if order is not already paid (payment already deducted)
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
$$;
