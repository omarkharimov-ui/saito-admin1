CREATE OR REPLACE FUNCTION public.process_order_payment (
  p_order_id        uuid,
  p_payment_method  text    DEFAULT 'card'::text,
  p_paid_amount     numeric DEFAULT NULL::numeric,
  p_tip_amount      numeric DEFAULT 0,
  p_campaign_id     uuid    DEFAULT NULL::uuid,
  p_discount_amount numeric DEFAULT 0,
  p_discount_type   text    DEFAULT NULL::text,
  p_performed_by    uuid    DEFAULT NULL::uuid,
  p_cash_amount     numeric DEFAULT NULL::numeric,
  p_card_amount     numeric DEFAULT NULL::numeric
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  AS $function$
  DECLARE
  v_order RECORD;
  v_new_paid numeric;
  v_total_paid numeric;
  v_profit numeric;
  v_cogs numeric := 0;
  v_fully_paid boolean;
  v_result jsonb;
  v_now timestamptz := now();
  v_ingredient RECORD;
  v_already_deducted boolean := false;
BEGIN
  PERFORM public.validate_actor(p_performed_by);
  SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order % not found', p_order_id;
  END IF;
  IF v_order.status = 'paid' THEN
    SELECT COALESCE(SUM(amount), 0) INTO v_total_paid FROM order_payments WHERE order_id = p_order_id;
    RETURN jsonb_build_object('success', false, 'duplicate', true, 'message', 'Order already paid', 'total_paid', v_total_paid, 'cogs', 0, 'profit', 0, 'fully_paid', true);
  END IF;
  v_new_paid := COALESCE(p_paid_amount, 0);
  v_total_paid := v_new_paid;
  v_total_paid := LEAST(v_total_paid, v_order.total_amount);
  IF v_new_paid > v_order.total_amount THEN
    RAISE EXCEPTION 'OVERPAYMENT: paid % exceeds total %', v_new_paid, v_order.total_amount;
  END IF;
  SELECT EXISTS (SELECT 1 FROM inventory_logs WHERE type = 'order_consumption' AND order_id = p_order_id) INTO v_already_deducted;
  IF v_already_deducted THEN
    SELECT COALESCE(SUM(quantity * unit_cost), 0) INTO v_cogs FROM inventory_logs WHERE type = 'order_consumption' AND order_id = p_order_id;
  ELSE
    FOR v_ingredient IN
      SELECT oi.product_id, oi.quantity, r.ingredient_id,
             COALESCE(r.quantity_brutto, r.quantity_required) AS ingred_qty,
             i.average_cost_per_unit, i.current_stock, i.unit
      FROM order_items oi
      JOIN recipes r ON r.menu_item_id = oi.product_id
      JOIN ingredients i ON i.id = r.ingredient_id
      WHERE oi.order_id = p_order_id
    LOOP
      INSERT INTO inventory_logs (ingredient_id, quantity, type, unit_cost, reference_type, reference_id, created_at)
      VALUES (v_ingredient.ingredient_id, -(v_ingredient.ingred_qty * v_ingredient.quantity), 'order_consumption'::inventory_log_type, v_ingredient.average_cost_per_unit, 'order', p_order_id, v_now);
      v_cogs := v_cogs + (v_ingredient.average_cost_per_unit * v_ingredient.ingred_qty * v_ingredient.quantity);
    END LOOP;
  END IF;
  v_profit := v_total_paid - v_cogs;
  IF p_cash_amount IS NOT NULL AND p_cash_amount > 0 THEN
    INSERT INTO order_payments (order_id, payment_method, amount, created_at) VALUES (p_order_id, 'cash', p_cash_amount, v_now);
  END IF;
  IF p_card_amount IS NOT NULL AND p_card_amount > 0 THEN
    INSERT INTO order_payments (order_id, payment_method, amount, created_at) VALUES (p_order_id, 'card', p_card_amount, v_now);
  END IF;
  IF p_cash_amount IS NULL AND p_card_amount IS NULL THEN
    INSERT INTO order_payments (order_id, payment_method, amount, created_at) VALUES (p_order_id, p_payment_method, v_new_paid, v_now);
  END IF;
  UPDATE orders SET status = 'paid', paid_amount = v_total_paid, payment_method = p_payment_method, tip_amount = COALESCE(p_tip_amount, 0), cash_amount = COALESCE(p_cash_amount, 0), card_amount = COALESCE(p_card_amount, 0), cogs = v_cogs, profit = v_profit, paid_at = v_now, inventory_deducted = true, discount_amount = COALESCE(p_discount_amount, 0), discount_type = p_discount_type, campaign_id = p_campaign_id, updated_at = v_now WHERE id = p_order_id;
  IF COALESCE(v_order.order_source, 'dine_in') = 'dine_in' AND v_order.table_number IS NOT NULL THEN
    UPDATE table_floors SET status = 'dirty', total_amount = 0, guest_count = NULL, order_count = 0, bill_requested = false WHERE table_number = v_order.table_number;
  END IF;
  INSERT INTO audit_log (table_name, record_id, action, old_data, new_data, performed_by) VALUES ('orders', p_order_id, 'payment', jsonb_build_object('status', v_order.status), jsonb_build_object('status', 'paid', 'amount', v_total_paid, 'cogs', v_cogs, 'profit', v_profit, 'method', p_payment_method, 'discount_type', p_discount_type, 'discount_amount', p_discount_amount, 'tip', p_tip_amount, 'total_paid', v_total_paid), p_performed_by);
  INSERT INTO notifications (title, body, type, created_at) VALUES ('Ödəniş qəbul edildi', CASE WHEN v_order.table_number IS NOT NULL THEN 'Masa ' || v_order.table_number || ' - ' || v_total_paid || ' AZN (cogs: ' || v_cogs || ', profit: ' || v_profit || ')' ELSE v_total_paid || ' AZN ödəniş qəbul edildi' END, 'payment', v_now);
  SELECT jsonb_build_object('success', true, 'cogs', v_cogs, 'profit', v_profit, 'fully_paid', v_total_paid >= v_order.total_amount, 'paid_amount', v_new_paid, 'total_paid', v_total_paid, 'duplicate', false) INTO v_result;
  RETURN v_result;
END;
$function$;



