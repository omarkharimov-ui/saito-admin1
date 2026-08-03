-- calculate_order_total: compute order total with discounts and campaigns
CREATE OR REPLACE FUNCTION public.calculate_order_total(
  p_items JSONB,
  p_campaign_id UUID DEFAULT NULL,
  p_discount_amount NUMERIC DEFAULT 0,
  p_discount_type TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_total NUMERIC := 0;
  v_item JSONB;
  v_subtotal NUMERIC := 0;
  v_discount NUMERIC := 0;
  v_campaign_discount NUMERIC := 0;
BEGIN
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_subtotal := v_subtotal + COALESCE((v_item->>'unit_price')::NUMERIC, 0) * COALESCE((v_item->>'quantity')::INT, 1);
  END LOOP;

  v_total := v_subtotal;

  IF p_campaign_id IS NOT NULL THEN
    SELECT COALESCE(discount_percentage, 0) INTO v_campaign_discount
    FROM public.campaigns WHERE id = p_campaign_id AND active = true;
    v_total := v_total * (1 - v_campaign_discount / 100);
  END IF;

  IF p_discount_amount > 0 THEN
    IF p_discount_type = 'percentage' THEN
      v_discount := v_total * (p_discount_amount / 100);
    ELSE
      v_discount := p_discount_amount;
    END IF;
    v_total := GREATEST(0, v_total - v_discount);
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'subtotal', v_subtotal,
    'campaign_discount', v_campaign_discount,
    'discount', v_discount,
    'total', ROUND(v_total::NUMERIC, 2)
  );
END;
$$;
