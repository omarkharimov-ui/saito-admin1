CREATE FUNCTION public.atomic_receive_goods (
  p_purchase_order_id uuid,
  p_stock_updates     jsonb,
  p_reviews           jsonb,
  p_invoice_id        uuid  DEFAULT NULL::uuid,
  p_po_status         text  DEFAULT 'partial'::text,
  p_order_number      text  DEFAULT ''::text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  AS $function$
DECLARE
  v_item JSONB;
  v_matched INT := 0;
  v_total INT;
BEGIN
  v_total := jsonb_array_length(p_stock_updates);

  -- Update stock for matched items
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_stock_updates)
  LOOP
    UPDATE ingredients
    SET current_stock = COALESCE(current_stock, 0) + (v_item->>'quantity')::NUMERIC
    WHERE id = (v_item->>'ingredient_id')::UUID;

    INSERT INTO inventory_logs (ingredient_id, type, quantity, cost_per_unit, reason, order_id)
    VALUES (
      (v_item->>'ingredient_id')::UUID,
      'stock_in',
      (v_item->>'quantity')::NUMERIC,
      (v_item->>'cost_per_unit')::NUMERIC,
      'Auto-receive from PO ' || p_order_number,
      p_purchase_order_id
    );

    v_matched := v_matched + 1;
  END LOOP;

  -- Insert reviews
  IF jsonb_array_length(p_reviews) > 0 THEN
    INSERT INTO procurement_reviews (purchase_order_id, invoice_id, product_name, quantity, unit, unit_cost, suggested_ingredient_id, status, severity)
    SELECT
      p_purchase_order_id,
      p_invoice_id,
      (v_item->>'product_name')::TEXT,
      (v_item->>'quantity')::NUMERIC,
      COALESCE((v_item->>'unit')::TEXT, 'gram'),
      (v_item->>'unit_cost')::NUMERIC,
      (v_item->>'suggested_ingredient_id')::UUID,
      'pending',
      'medium'
    FROM jsonb_array_elements(p_reviews) AS v_item;
  END IF;

  -- Update PO status
  UPDATE purchase_orders
  SET status = p_po_status, received_at = NOW()
  WHERE id = p_purchase_order_id;

  -- Log transaction
  INSERT INTO transaction_logs (operation, status, details)
  VALUES ('atomic_receive_goods', 'completed',
    'PO:' || p_purchase_order_id || ' matched:' || v_matched || '/' || v_total);

  RETURN jsonb_build_object(
    'success', true,
    'matched', v_matched,
    'total', v_total,
    'reviews', jsonb_array_length(p_reviews)
  );
END;
$function$;

GRANT ALL ON FUNCTION public.atomic_receive_goods(uuid, jsonb, jsonb, uuid, text, text) TO anon;

GRANT ALL ON FUNCTION public.atomic_receive_goods(uuid, jsonb, jsonb, uuid, text, text) TO authenticated;

GRANT ALL ON FUNCTION public.atomic_receive_goods(uuid, jsonb, jsonb, uuid, text, text) TO service_role;