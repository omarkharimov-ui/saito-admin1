-- ============================================================================
-- FIX 3/8: P10 — Pricing RPCs (calculate_effective_price,
--            calculate_cart_pricing, calculate_combo_pricing)
-- ============================================================================

CREATE OR REPLACE FUNCTION calculate_effective_price(
  p_product_id UUID,
  p_quantity INTEGER DEFAULT 1,
  p_category_id UUID DEFAULT NULL,
  p_current_time TIMESTAMPTZ DEFAULT now()
) RETURNS JSONB
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  v_product RECORD;
  v_campaign RECORD;
  v_base_price NUMERIC;
  v_effective_price NUMERIC;
  v_discount_amount NUMERIC := 0;
  v_discount_type TEXT;
BEGIN
  SELECT id, price, category_id INTO v_product FROM products WHERE id = p_product_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('product_id', p_product_id, 'base_price', 0, 'effective_price', 0, 'discount_amount', 0);
  END IF;

  v_base_price := COALESCE(v_product.price, 0);

  SELECT * INTO v_campaign FROM campaigns
  WHERE status = 'active'
    AND (start_date IS NULL OR start_date <= p_current_time::DATE)
    AND (end_date IS NULL OR end_date >= p_current_time::DATE)
    AND (start_time IS NULL OR start_time <= p_current_time::TIME)
    AND (end_time IS NULL OR end_time >= p_current_time::TIME)
    AND (max_uses IS NULL OR max_uses = 0 OR current_uses < max_uses)
    AND (
      (target_type = 'product' AND target_id = p_product_id)
      OR (target_type = 'category' AND (target_id = p_category_id OR target_id = v_product.category_id::TEXT))
      OR (target_type = 'all')
      OR (target_type = 'combo')
    )
  ORDER BY priority DESC, created_at DESC
  LIMIT 1;

  IF FOUND THEN
    IF v_campaign.type IN ('PERCENTAGE', 'HAPPY_HOUR') THEN
      v_discount_amount := v_base_price * (COALESCE(v_campaign.discount_value, 0) / 100);
    ELSIF v_campaign.type = 'FIXED_AMOUNT' THEN
      v_discount_amount := COALESCE(v_campaign.discount_value, 0);
    ELSIF v_campaign.type = 'BOGO' THEN
      v_discount_amount := v_base_price * 0.5;
    ELSIF v_campaign.type = 'BUY2GET1' THEN
      v_discount_amount := v_base_price / 3;
    END IF;

    IF v_campaign.max_discount_amount IS NOT NULL AND v_discount_amount > v_campaign.max_discount_amount THEN
      v_discount_amount := v_campaign.max_discount_amount;
    END IF;

    v_discount_type := v_campaign.type;
  END IF;

  v_effective_price := GREATEST(0, v_base_price - v_discount_amount);

  RETURN jsonb_build_object(
    'product_id', p_product_id,
    'base_price', v_base_price,
    'effective_price', v_effective_price,
    'discount_amount', v_discount_amount,
    'discount_type', v_discount_type,
    'campaign_id', CASE WHEN v_campaign.id IS NOT NULL THEN v_campaign.id ELSE NULL END,
    'campaign_label', v_campaign.label,
    'campaign_badge', v_campaign.badge_color
  );
END;
$$;

CREATE OR REPLACE FUNCTION calculate_cart_pricing(
  p_items JSONB,
  p_current_time TIMESTAMPTZ DEFAULT now()
) RETURNS JSONB
LANGUAGE plpgsql STABLE
AS $$
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
$$;

CREATE OR REPLACE FUNCTION calculate_combo_pricing(
  p_combo_id UUID,
  p_current_time TIMESTAMPTZ DEFAULT now()
) RETURNS JSONB
LANGUAGE plpgsql STABLE
AS $$
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
$$;
