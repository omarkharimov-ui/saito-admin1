CREATE FUNCTION public.process_supplier_return (
  p_return_id    uuid,
  p_performed_by uuid DEFAULT NULL::uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  AS $function$
DECLARE
  v_return RECORD;
  v_item RECORD;
  v_total NUMERIC(12,2) := 0;
BEGIN
  SELECT * INTO v_return FROM supplier_returns WHERE id = p_return_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'RETURN_NOT_FOUND' USING ERRCODE = 'P0001'; END IF;
  IF v_return.status != 'draft' THEN RAISE EXCEPTION 'RETURN_ALREADY_PROCESSED' USING ERRCODE = 'P0001'; END IF;

  FOR v_item IN
    SELECT sri.*, i.name, i.current_stock
    FROM supplier_return_items sri
    JOIN ingredients i ON i.id = sri.ingredient_id
    WHERE sri.supplier_return_id = p_return_id
    FOR UPDATE OF i
  LOOP
    UPDATE ingredients SET current_stock = GREATEST(0, COALESCE(current_stock, 0) - v_item.quantity), updated_at = now()
    WHERE id = v_item.ingredient_id;

    INSERT INTO inventory_logs (ingredient_id, type, quantity, cost_per_unit, reason, reference_type, reference_id, notes, created_at)
    VALUES (v_item.ingredient_id, 'waste', -v_item.quantity, v_item.unit_cost,
      'return_to_supplier', 'supplier_return', p_return_id,
      'Returned to supplier: ' || v_item.quantity || ' x ' || COALESCE(v_item.unit_cost, 0), now());

    v_total := v_total + v_item.total_cost;
  END LOOP;

  UPDATE supplier_returns SET status = 'completed', total_amount = v_total, returned_at = now(), updated_at = now()
  WHERE id = p_return_id;

  INSERT INTO notifications (type, title, body, data, created_at)
  VALUES ('stock', 'Təchizatçıya geri qaytarılma',
    v_return.return_number || ' — ' || v_total || ' AZN',
    jsonb_build_object('return_id', p_return_id, 'supplier_id', v_return.supplier_id, 'total_amount', v_total), now());

  RETURN jsonb_build_object('success', true, 'return_id', p_return_id, 'total_amount', v_total, 'return_number', v_return.return_number);
END;
$function$;

GRANT ALL ON FUNCTION public.process_supplier_return(uuid, uuid) TO anon;

GRANT ALL ON FUNCTION public.process_supplier_return(uuid, uuid) TO authenticated;

GRANT ALL ON FUNCTION public.process_supplier_return(uuid, uuid) TO service_role;