CREATE FUNCTION public.cancel_order_items (
  p_order_id uuid,
  p_items    jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
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
$function$;

GRANT ALL ON FUNCTION public.cancel_order_items(uuid, jsonb) TO anon;

GRANT ALL ON FUNCTION public.cancel_order_items(uuid, jsonb) TO authenticated;

GRANT ALL ON FUNCTION public.cancel_order_items(uuid, jsonb) TO service_role;