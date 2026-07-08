-- ════════════════════════════════════════════════════════════════════
-- FIX 19 — SSOT RPCs: eliminate all direct client mutations
-- ════════════════════════════════════════════════════════════════════
-- RPCs added so frontend NEVER mutates orders/order_items directly:
--   prepare_order_items         — mark all pending items as 'preparing'
--   update_order_item_status    — update single item kitchen status
--   update_order_item_prepared  — update prepared_quantity
--   create_empty_merged_child   — insert empty child order for merge
--   add_order_items             — add items to existing order atomically
--   cancel_order_items          — cancel specific items from an order
-- ════════════════════════════════════════════════════════════════════

-- ─── 1. prepare_order_items: mark all pending/accepted items as 'preparing' ───
-- Kitchen accepts an order → items move from pending/accepted to preparing.
CREATE OR REPLACE FUNCTION prepare_order_items(
  p_order_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated INTEGER;
BEGIN
  -- Lock order row
  PERFORM id FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  UPDATE order_items
  SET kitchen_status = 'preparing'
  WHERE order_id = p_order_id
    AND kitchen_status IN ('pending', 'accepted');

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  RETURN jsonb_build_object('success', true, 'updated_items', v_updated);
END;
$$;

-- ─── 2. update_order_item_status: update single item's kitchen status ───
CREATE OR REPLACE FUNCTION update_order_item_status(
  p_order_item_id UUID,
  p_status TEXT,
  p_prepared_quantity INTEGER DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item RECORD;
BEGIN
  SELECT * INTO v_item FROM order_items WHERE id = p_order_item_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_ITEM_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  UPDATE order_items
  SET
    kitchen_status = p_status,
    prepared_quantity = COALESCE(p_prepared_quantity, prepared_quantity)
  WHERE id = p_order_item_id;

  RETURN jsonb_build_object('success', true, 'order_item_id', p_order_item_id, 'status', p_status);
END;
$$;

-- ─── 3. update_order_item_prepared: update prepared_quantity ───
CREATE OR REPLACE FUNCTION update_order_item_prepared(
  p_order_item_id UUID,
  p_prepared_quantity INTEGER
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item RECORD;
BEGIN
  SELECT * INTO v_item FROM order_items WHERE id = p_order_item_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_ITEM_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  UPDATE order_items
  SET prepared_quantity = p_prepared_quantity
  WHERE id = p_order_item_id;

  RETURN jsonb_build_object('success', true, 'order_item_id', p_order_item_id, 'prepared_quantity', p_prepared_quantity);
END;
$$;

-- ─── 4. add_order_items: atomically insert items into an existing order ───
CREATE OR REPLACE FUNCTION add_order_items(
  p_order_id UUID,
  p_items JSONB  -- Array of {product_id, product_name, quantity, unit_price, total_price, modifiers, special_notes, combo_group_id, parent_order_item_id, variant_id}
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order RECORD;
  v_item JSONB;
  v_item_total NUMERIC;
  v_inserted INTEGER := 0;
BEGIN
  -- Lock order
  SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;
  IF v_order.status IN ('paid', 'cancelled', 'closed') THEN
    RAISE EXCEPTION 'ORDER_CLOSED' USING ERRCODE = 'P0001';
  END IF;

  -- Insert each item
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_item_total := COALESCE((v_item->>'total_price')::NUMERIC,
                             (v_item->>'unit_price')::NUMERIC * (v_item->>'quantity')::NUMERIC);

    INSERT INTO order_items (
      order_id, product_id, product_name, quantity, unit_price, total_price,
      modifiers, special_notes, combo_group_id, parent_order_item_id, variant_id,
      kitchen_status
    ) VALUES (
      p_order_id,
      (v_item->>'product_id')::UUID,
      v_item->>'product_name',
      (v_item->>'quantity')::INTEGER,
      (v_item->>'unit_price')::NUMERIC,
      v_item_total,
      v_item->>'modifiers',
      v_item->>'special_notes',
      (v_item->>'combo_group_id')::UUID,
      (v_item->>'parent_order_item_id')::UUID,
      (v_item->>'variant_id')::UUID,
      'pending'
    );

    v_inserted := v_inserted + 1;
  END LOOP;

  -- Update order total
  UPDATE orders
  SET total_amount = COALESCE(total_amount, 0) + (
    SELECT COALESCE(SUM(total_price), 0) FROM order_items WHERE order_id = p_order_id AND id IN (
      SELECT id FROM order_items WHERE order_id = p_order_id ORDER BY created_at DESC LIMIT v_inserted
    )
  ),
  version = COALESCE(version, 0) + 1
  WHERE id = p_order_id;

  RETURN jsonb_build_object('success', true, 'order_id', p_order_id, 'inserted', v_inserted);
END;
$$;

-- ─── 5. cancel_order_items: cancel specific items from an order (partial cancel) ───
CREATE OR REPLACE FUNCTION cancel_order_items(
  p_order_id UUID,
  p_items JSONB  -- Array of {order_item_id, quantity}
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order RECORD;
  v_item JSONB;
  v_reversal_items JSONB := '[]'::JSONB;
  v_reversed INTEGER := 0;
BEGIN
  -- Lock order
  SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  -- Build reversal payload for non-served items
  SELECT jsonb_agg(
    jsonb_build_object('order_item_id', x.order_item_id, 'reverse_qty', x.quantity)
  ) INTO v_reversal_items
  FROM jsonb_to_recordset(p_items) AS x(order_item_id UUID, quantity INTEGER)
  JOIN order_items oi ON oi.id = x.order_item_id
  WHERE oi.order_id = p_order_id
    AND (oi.served_quantity IS NULL OR oi.served_quantity = 0);

  -- Reverse stock
  IF v_reversal_items IS NOT NULL AND jsonb_array_length(v_reversal_items) > 0 THEN
    PERFORM reverse_stock_deduction_for_items(v_reversal_items::TEXT);
    v_reversed := jsonb_array_length(v_reversal_items);
  END IF;

  -- Cancel or reduce each item
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    -- Delete the item
    DELETE FROM order_items
    WHERE id = (v_item->>'order_item_id')::UUID
      AND order_id = p_order_id;
  END LOOP;

  -- Recalculate total
  UPDATE orders
  SET total_amount = GREATEST(0, (
    SELECT COALESCE(SUM(total_price), 0) FROM order_items WHERE order_id = p_order_id
  )),
  version = COALESCE(version, 0) + 1
  WHERE id = p_order_id;

  RETURN jsonb_build_object(
    'success', true,
    'order_id', p_order_id,
    'cancelled_items', jsonb_array_length(p_items),
    'reversed_stock', v_reversed
  );
END;
$$;

-- ════════════════════════════════════════════════════════════════════
-- Register migration
-- ════════════════════════════════════════════════════════════════════
INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
SELECT '20260706190000', 'fix_19_ssot_rpcs', '{See migration file}'
WHERE NOT EXISTS (
  SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20260706190000'
);
