CREATE OR REPLACE FUNCTION public.deduct_inventory_atomic (
  p_order_id     uuid,
  p_performed_by uuid DEFAULT NULL::uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  AS $function$
  DECLARE
  v_item RECORD;
  v_recipe RECORD;
  v_deducted INT := 0;
BEGIN
  PERFORM public.validate_actor(p_performed_by);
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

  INSERT INTO public.operation_logs (
    order_id, action, new_values, performed_by
  ) VALUES (
    p_order_id, 'deduct_inventory',
    jsonb_build_object('deducted_items', v_deducted),
    p_performed_by
  );

  RETURN jsonb_build_object('success', true, 'deducted_items', v_deducted);
END;
$function$;



