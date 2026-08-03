CREATE FUNCTION public.atomic_apply_invoice (
  p_invoice_id    uuid,
  p_stock_updates jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  AS $function$
DECLARE
  v_item JSONB;
  v_applied INT := 0;
BEGIN
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_stock_updates)
  LOOP
    UPDATE ingredients
    SET current_stock = COALESCE(current_stock, 0) + (v_item->>'quantity')::NUMERIC
    WHERE id = (v_item->>'ingredient_id')::UUID;

    INSERT INTO inventory_logs (ingredient_id, type, quantity, cost_per_unit, reason)
    VALUES (
      (v_item->>'ingredient_id')::UUID,
      'stock_in',
      (v_item->>'quantity')::NUMERIC,
      (v_item->>'cost_per_unit')::NUMERIC,
      'Invoice apply: ' || (v_item->>'product_name')::TEXT
    );

    v_applied := v_applied + 1;
  END LOOP;

  UPDATE invoices SET status = 'applied', applied_at = NOW()
  WHERE id = p_invoice_id;

  INSERT INTO transaction_logs (operation, status, details)
  VALUES ('atomic_apply_invoice', 'completed',
    'Invoice:' || p_invoice_id || ' applied:' || v_applied || ' items');

  RETURN jsonb_build_object('success', true, 'applied', v_applied);
END;
$function$;

GRANT ALL ON FUNCTION public.atomic_apply_invoice(uuid, jsonb) TO anon;

GRANT ALL ON FUNCTION public.atomic_apply_invoice(uuid, jsonb) TO authenticated;

GRANT ALL ON FUNCTION public.atomic_apply_invoice(uuid, jsonb) TO service_role;