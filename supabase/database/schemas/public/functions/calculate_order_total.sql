CREATE FUNCTION public.calculate_order_total (
  p_items           jsonb,
  p_campaign_id     uuid    DEFAULT NULL::uuid,
  p_discount_amount numeric DEFAULT 0,
  p_discount_type   text    DEFAULT NULL::text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  AS $function$
DECLARE
  v_item JSONB;
  v_subtotal NUMERIC := 0;
  v_item_discount NUMERIC := 0;
  v_discount NUMERIC := 0;
BEGIN
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_subtotal := v_subtotal
      + COALESCE(
          (v_item->>'original_unit_price')::NUMERIC,
          (v_item->>'unit_price')::NUMERIC,
          0
        ) * COALESCE((v_item->>'quantity')::INT, 1);
    v_item_discount := v_item_discount
      + GREATEST(
          0,
          COALESCE(
            (v_item->>'original_unit_price')::NUMERIC,
            (v_item->>'unit_price')::NUMERIC,
            0
          ) - COALESCE((v_item->>'unit_price')::NUMERIC, 0)
        ) * COALESCE((v_item->>'quantity')::INT, 1);
  END LOOP;

  v_discount := LEAST(GREATEST(COALESCE(p_discount_amount, 0), 0), v_subtotal);

  RETURN jsonb_build_object(
    'success', true,
    'subtotal', ROUND(v_subtotal, 2),
    'item_discount', ROUND(v_item_discount, 2),
    'discount', ROUND(v_discount, 2),
    'total', ROUND(GREATEST(0, v_subtotal - v_discount), 2)
  );
END;
$function$;

GRANT ALL ON FUNCTION public.calculate_order_total(jsonb, uuid, numeric, text) TO anon;

GRANT ALL ON FUNCTION public.calculate_order_total(jsonb, uuid, numeric, text) TO authenticated;

GRANT ALL ON FUNCTION public.calculate_order_total(jsonb, uuid, numeric, text) TO service_role;