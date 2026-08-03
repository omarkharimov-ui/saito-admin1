CREATE FUNCTION public.calculate_cart_pricing (
  p_items        jsonb,
  p_current_time timestamp with time zone DEFAULT now()
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  AS $function$
DECLARE
  v_item JSONB;
  v_result JSONB := '[]'::JSONB;
  v_pricing JSONB;
  v_subtotal NUMERIC := 0;
  v_total_discount NUMERIC := 0;
  v_total NUMERIC := 0;
BEGIN
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_pricing := calculate_effective_price(
      (v_item->>'product_id')::UUID,
      COALESCE((v_item->>'quantity')::INTEGER, 1),
      (v_item->>'category_id')::UUID,
      p_current_time
    );

    v_subtotal := v_subtotal + (v_pricing->>'base_price')::NUMERIC * COALESCE((v_item->>'quantity')::INTEGER, 1);
    v_total := v_total + (v_pricing->>'effective_price')::NUMERIC * COALESCE((v_item->>'quantity')::INTEGER, 1);
    v_total_discount := v_total_discount + (v_pricing->>'discount_amount')::NUMERIC * COALESCE((v_item->>'quantity')::INTEGER, 1);

    v_result := v_result || jsonb_build_object(
      'product_id', v_pricing->>'product_id',
      'quantity', COALESCE((v_item->>'quantity')::INTEGER, 1),
      'base_price', v_pricing->>'base_price',
      'effective_price', v_pricing->>'effective_price',
      'discount_amount', v_pricing->>'discount_amount',
      'discount_type', v_pricing->>'discount_type',
      'campaign_id', v_pricing->>'campaign_id',
      'campaign_label', v_pricing->>'campaign_label',
      'campaign_badge', v_pricing->>'campaign_badge'
    );
  END LOOP;

  RETURN jsonb_build_object(
    'items', v_result,
    'subtotal', v_subtotal,
    'total_discount', v_total_discount,
    'total', v_total
  );
END;
$function$;

GRANT ALL ON FUNCTION public.calculate_cart_pricing(jsonb, timestamp WITH time zone) TO anon;

GRANT ALL ON FUNCTION public.calculate_cart_pricing(jsonb, timestamp WITH time zone) TO authenticated;

GRANT ALL ON FUNCTION public.calculate_cart_pricing(jsonb, timestamp WITH time zone) TO service_role;