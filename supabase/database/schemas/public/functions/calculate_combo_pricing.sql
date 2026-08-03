CREATE FUNCTION public.calculate_combo_pricing (
  p_combo_id     uuid,
  p_current_time timestamp with time zone DEFAULT now()
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  AS $function$
DECLARE
  v_combo RECORD;
  v_item RECORD;
  v_pricing JSONB;
  v_original_total NUMERIC := 0;
  v_combo_total NUMERIC := 0;
  v_items JSONB := '[]'::JSONB;
BEGIN
  SELECT * INTO v_combo FROM combos WHERE id = p_combo_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('combo_id', p_combo_id, 'error', 'Combo not found');
  END IF;

  FOR v_item IN
    SELECT ci.*, p.price, p.category_id
    FROM combo_items ci
    JOIN products p ON p.id = ci.product_id
    WHERE ci.combo_id = p_combo_id
    ORDER BY ci.sort_order
  LOOP
    v_pricing := calculate_effective_price(v_item.product_id, v_item.quantity, v_item.category_id, p_current_time);
    v_original_total := v_original_total + (v_pricing->>'base_price')::NUMERIC * v_item.quantity;
    v_combo_total := v_combo_total + (v_pricing->>'effective_price')::NUMERIC * v_item.quantity;

    v_items := v_items || jsonb_build_object(
      'product_id', v_item.product_id,
      'quantity', v_item.quantity,
      'base_price', v_pricing->>'base_price',
      'effective_price', v_pricing->>'effective_price'
    );
  END LOOP;

  RETURN jsonb_build_object(
    'combo_id', p_combo_id,
    'combo_name', v_combo.name,
    'combo_price', COALESCE(v_combo.price, v_combo_total),
    'original_total', v_original_total,
    'combo_total', v_combo_total,
    'you_save', GREATEST(0, v_original_total - v_combo_total),
    'items', v_items
  );
END;
$function$;

GRANT ALL ON FUNCTION public.calculate_combo_pricing(uuid, timestamp WITH time zone) TO anon;

GRANT ALL ON FUNCTION public.calculate_combo_pricing(uuid, timestamp WITH time zone) TO authenticated;

GRANT ALL ON FUNCTION public.calculate_combo_pricing(uuid, timestamp WITH time zone) TO service_role;