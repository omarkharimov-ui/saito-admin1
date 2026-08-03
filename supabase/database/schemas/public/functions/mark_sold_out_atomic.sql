CREATE FUNCTION public.mark_sold_out_atomic (
  p_product_id               uuid,
  p_product_name             text DEFAULT NULL::text,
  p_performed_by             uuid DEFAULT NULL::uuid,
  p_performed_by_terminal_id text DEFAULT NULL::text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  AS $function$
DECLARE
  v_product RECORD;
  v_ingredient_id UUID;
  v_current_stock NUMERIC := 0;
  v_ingredients_updated INT := 0;
BEGIN
  SELECT * INTO v_product FROM public.products WHERE id = p_product_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Product not found');
  END IF;

  IF v_product.is_ready_product AND v_product.direct_ingredient_id IS NOT NULL THEN
    SELECT current_stock INTO v_current_stock FROM public.ingredients WHERE id = v_product.direct_ingredient_id;
    IF v_current_stock IS NULL THEN v_current_stock := 0; END IF;

    INSERT INTO public.inventory_logs (
      ingredient_id, type, quantity, reason, reference_type, reference_id, created_at
    ) VALUES (
      v_product.direct_ingredient_id, 'adjustment', -v_current_stock,
      COALESCE(p_product_name, v_product.name, 'Unknown') || ' sold out — full stock zeroed',
      'sold_out', p_product_id, NOW()
    );

    UPDATE public.ingredients SET
      current_stock = 0,
      updated_at = NOW()
    WHERE id = v_product.direct_ingredient_id;

    v_ingredients_updated := v_ingredients_updated + 1;
  ELSE
    FOR v_ingredient_id IN
      SELECT r.ingredient_id FROM public.recipes r WHERE r.menu_item_id = p_product_id
    LOOP
      SELECT current_stock INTO v_current_stock FROM public.ingredients WHERE id = v_ingredient_id;
      IF v_current_stock IS NULL THEN v_current_stock := 0; END IF;

      INSERT INTO public.inventory_logs (
        ingredient_id, type, quantity, reason, reference_type, reference_id, created_at
      ) VALUES (
        v_ingredient_id, 'adjustment', -v_current_stock,
        COALESCE(p_product_name, v_product.name, 'Unknown') || ' sold out — full stock zeroed',
        'sold_out', p_product_id, NOW()
      );

      UPDATE public.ingredients SET
        current_stock = 0,
        updated_at = NOW()
      WHERE id = v_ingredient_id;

      v_ingredients_updated := v_ingredients_updated + 1;
    END LOOP;
  END IF;

  UPDATE public.products SET
    is_available = false,
    updated_at = NOW()
  WHERE id = p_product_id;

  INSERT INTO public.operation_logs (
    action, old_values, new_values, performed_by
  ) VALUES (
    'mark_sold_out',
    jsonb_build_object('product_id', p_product_id, 'is_available', v_product.is_available),
    jsonb_build_object('product_id', p_product_id, 'is_available', false, 'ingredients_updated', v_ingredients_updated),
    p_performed_by
  );

  RETURN jsonb_build_object('success', true, 'ingredients_updated', v_ingredients_updated);
END;
$function$;

GRANT ALL ON FUNCTION public.mark_sold_out_atomic(uuid, text, uuid, text) TO anon;

GRANT ALL ON FUNCTION public.mark_sold_out_atomic(uuid, text, uuid, text) TO authenticated;

GRANT ALL ON FUNCTION public.mark_sold_out_atomic(uuid, text, uuid, text) TO service_role;