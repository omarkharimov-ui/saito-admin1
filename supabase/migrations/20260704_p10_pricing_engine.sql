-- ============================================================================
-- P10: SERVER-SIDE PRICING ENGINE
-- Campaign engine owns all pricing. Removes discount_price from products.
-- ============================================================================

-- ─── 1. Deprecate discount_price on products (campaign engine owns pricing) ───
COMMENT ON COLUMN products.discount_price IS 'DEPRECATED — Use campaign engine instead';

-- ─── 2. Add campaign scheduling columns if missing ───
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS start_date DATE;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS priority INTEGER DEFAULT 0;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS min_purchase_amount NUMERIC(10,2) DEFAULT 0;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS min_items INTEGER DEFAULT 0;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS applicable_categories TEXT[] DEFAULT '{}';
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS applicable_products TEXT[] DEFAULT '{}';
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS combo_id UUID;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS max_discount_amount NUMERIC(10,2);
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS current_uses INTEGER DEFAULT 0;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS max_uses INTEGER DEFAULT 0;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS label TEXT;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS badge_color TEXT DEFAULT '#D4AF37';

-- ─── 3. Ensure combo_items table is properly defined ───
CREATE TABLE IF NOT EXISTS combo_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  combo_id UUID NOT NULL REFERENCES combos(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_combo_items_combo ON combo_items(combo_id);
CREATE INDEX IF NOT EXISTS idx_combo_items_product ON combo_items(product_id);

-- ─── 4. Pricing RPC: compute effective price for a product ───
-- Returns the base price and any active campaign discount
CREATE OR REPLACE FUNCTION calculate_effective_price(
  p_product_id UUID,
  p_quantity INTEGER DEFAULT 1,
  p_category_id UUID DEFAULT NULL,
  p_current_time TIMESTAMPTZ DEFAULT now()
) RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_product RECORD;
  v_effective_price NUMERIC;
  v_base_price NUMERIC;
  v_campaign RECORD;
  v_discount_amount NUMERIC := 0;
  v_discount_type TEXT := NULL;
  v_campaign_id UUID := NULL;
  v_campaign_label TEXT := NULL;
  v_campaign_badge TEXT := NULL;
BEGIN
  -- Get product base price
  SELECT * INTO v_product FROM products WHERE id = p_product_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Product not found');
  END IF;

  v_base_price := v_product.price;
  v_effective_price := v_base_price;

  -- Find best active campaign for this product
  SELECT * INTO v_campaign
  FROM campaigns
  WHERE status = 'active'
    AND (start_date IS NULL OR start_date <= p_current_time::DATE)
    AND (end_date IS NULL OR end_date >= p_current_time::DATE)
    AND (start_time IS NULL OR start_time <= p_current_time::TIME)
    AND (end_time IS NULL OR end_time >= p_current_time::TIME)
    AND (max_uses = 0 OR current_uses < max_uses)
    AND (
      target_type IS NULL
      OR (target_type = 'product' AND target_id = p_product_id::TEXT)
      OR (target_type = 'category' AND target_id = p_category_id::TEXT)
      OR (target_type = 'all')
      OR (target_type = 'combo' AND combo_id IS NOT NULL)
    )
  ORDER BY priority DESC, created_at DESC
  LIMIT 1;

  IF FOUND THEN
    v_campaign_id := v_campaign.id;
    v_campaign_label := v_campaign.label;
    v_campaign_badge := v_campaign.badge_color;

    IF v_campaign.discount_type = 'percentage' THEN
      v_discount_amount := ROUND(v_base_price * v_campaign.discount_value / 100, 2);
      v_discount_type := 'percentage';
    ELSIF v_campaign.discount_type = 'fixed' THEN
      v_discount_amount := LEAST(v_campaign.discount_value, v_base_price);
      v_discount_type := 'fixed';
    END IF;

    -- Apply max discount cap
    IF v_campaign.max_discount_amount IS NOT NULL AND v_discount_amount > v_campaign.max_discount_amount THEN
      v_discount_amount := v_campaign.max_discount_amount;
    END IF;

    v_effective_price := v_base_price - v_discount_amount;
    IF v_effective_price < 0 THEN
      v_effective_price := 0;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'product_id', p_product_id,
    'base_price', v_base_price,
    'effective_price', v_effective_price,
    'discount_amount', v_discount_amount,
    'discount_type', v_discount_type,
    'campaign_id', v_campaign_id,
    'campaign_label', v_campaign_label,
    'campaign_badge', v_campaign_badge
  );
END;
$$;

-- ─── 5. Cart pricing RPC: compute prices for an entire cart ───
-- Accepts array of {product_id, quantity, category_id} items
-- Returns each item with effective price and any combo discounts
CREATE OR REPLACE FUNCTION calculate_cart_pricing(
  p_items JSONB,
  p_current_time TIMESTAMPTZ DEFAULT now()
) RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_item JSONB;
  v_result JSONB := '[]'::JSONB;
  v_pricing JSONB;
  v_subtotal NUMERIC := 0;
  v_total_discount NUMERIC := 0;
  v_total NUMERIC := 0;
BEGIN
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_pricing := calculate_effective_price(
      (v_item->>'product_id')::UUID,
      COALESCE((v_item->>'quantity')::INTEGER, 1),
      (v_item->>'category_id')::UUID,
      p_current_time
    );

    v_subtotal := v_subtotal + (v_pricing->>'base_price')::NUMERIC * COALESCE((v_item->>'quantity')::INTEGER, 1);
    v_total := v_total + (v_pricing->>'effective_price')::NUMERIC * COALESCE((v_item->>'quantity')::INTEGER, 1);

    v_result := v_result || jsonb_build_object(
      'product_id', v_pricing->>'product_id',
      'quantity', COALESCE((v_item->>'quantity')::INTEGER, 1),
      'base_price', v_pricing->>'base_price',
      'effective_price', v_pricing->>'effective_price',
      'discount_amount', v_pricing->>'discount_amount',
      'discount_type', v_pricing->>'discount_type',
      'campaign_id', v_pricing->>'campaign_id',
      'campaign_label', v_pricing->>'campaign_label',
      'campaign_badge', v_pricing->>'campaign_badge',
      'line_total', (v_pricing->>'effective_price')::NUMERIC * COALESCE((v_item->>'quantity')::INTEGER, 1)
    );
  END LOOP;

  v_total_discount := v_subtotal - v_total;

  RETURN jsonb_build_object(
    'items', v_result,
    'subtotal', v_subtotal,
    'total_discount', v_total_discount,
    'total', v_total
  );
END;
$$;

-- ─── 6. Combo pricing RPC: expand combo into items and calculate price ───
CREATE OR REPLACE FUNCTION calculate_combo_pricing(
  p_combo_id UUID,
  p_current_time TIMESTAMPTZ DEFAULT now()
) RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_combo RECORD;
  v_items JSONB := '[]'::JSONB;
  v_item_pricing JSONB;
  v_original_total NUMERIC := 0;
  v_combo_price NUMERIC;
BEGIN
  SELECT * INTO v_combo FROM combos WHERE id = p_combo_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Combo not found');
  END IF;

  v_combo_price := v_combo.price;

  -- Expand each combo item
  FOR v_item_pricing IN
    SELECT calculate_effective_price(ci.product_id, ci.quantity, NULL, p_current_time)
    FROM combo_items ci
    WHERE ci.combo_id = p_combo_id
    ORDER BY ci.sort_order
  LOOP
    v_original_total := v_original_total + (v_item_pricing->>'base_price')::NUMERIC;
    v_items := v_items || v_item_pricing;
  END LOOP;

  RETURN jsonb_build_object(
    'combo_id', p_combo_id,
    'combo_name', v_combo.name,
    'combo_price', v_combo_price,
    'original_total', v_original_total,
    'you_save', GREATEST(0, v_original_total - v_combo_price),
    'items', v_items
  );
END;
$$;
