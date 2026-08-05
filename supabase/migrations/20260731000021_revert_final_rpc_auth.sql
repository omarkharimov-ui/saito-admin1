-- Revert auth checks in final set of SECURITY DEFINER RPCs
-- close_day_atomic, atomic_apply_invoice, atomic_receive_goods, deduct_inventory_atomic
-- cancel_delivery_order, cancel_takeaway_order

-- close_day_atomic
CREATE OR REPLACE FUNCTION public.close_day_atomic (
  p_report_date  date,
  p_daily_report jsonb,
  p_shift        jsonb,
  p_cash_drawer  jsonb,
  p_audit_log    jsonb DEFAULT NULL::jsonb,
  p_performed_by uuid  DEFAULT NULL::uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  AS $function$
DECLARE
  v_report_id UUID;
  v_shift_id UUID;
BEGIN
  INSERT INTO public.daily_reports (
    report_date, total_revenue, total_orders, aov, cash_total, card_total,
    tips_total, discounts_total, voids_count, voids_amount, tax_collected,
    starting_cash, expected_cash, actual_cash, cash_difference, cogs,
    labor_cost, items_sold, raw_data, closed_at, closed_by, notes
  ) VALUES (
    p_report_date,
    COALESCE(p_daily_report->>'total_revenue', '0')::NUMERIC,
    COALESCE(p_daily_report->>'total_orders', '0')::INTEGER,
    COALESCE(p_daily_report->>'aov', '0')::NUMERIC,
    COALESCE(p_daily_report->>'cash_total', '0')::NUMERIC,
    COALESCE(p_daily_report->>'card_total', '0')::NUMERIC,
    COALESCE(p_daily_report->>'tips_total', '0')::NUMERIC,
    COALESCE(p_daily_report->>'discounts_total', '0')::NUMERIC,
    COALESCE(p_daily_report->>'voids_count', '0')::INTEGER,
    COALESCE(p_daily_report->>'voids_amount', '0')::NUMERIC,
    COALESCE(p_daily_report->>'tax_collected', '0')::NUMERIC,
    COALESCE(p_daily_report->>'starting_cash', '0')::NUMERIC,
    COALESCE(p_daily_report->>'expected_cash', '0')::NUMERIC,
    COALESCE(p_daily_report->>'actual_cash', '0')::NUMERIC,
    COALESCE(p_daily_report->>'cash_difference', '0')::NUMERIC,
    COALESCE(p_daily_report->>'cogs', '0')::NUMERIC,
    COALESCE(p_daily_report->>'labor_cost', '0')::NUMERIC,
    COALESCE(p_daily_report->>'items_sold', '0')::INTEGER,
    COALESCE(p_daily_report->'raw_data', '{}'::jsonb),
    NOW(),
    p_performed_by,
    p_daily_report->>'notes'
  ) RETURNING id INTO v_report_id;

  INSERT INTO public.shifts (
    id, report_id, report_date, staff_id, opened_at, closed_at,
    starting_cash, expected_cash, actual_cash, difference, notes
  ) VALUES (
    COALESCE(p_shift->>'id', gen_random_uuid()),
    v_report_id,
    p_report_date,
    COALESCE(p_shift->>'staff_id', p_performed_by),
    COALESCE((p_shift->>'opened_at')::TIMESTAMPTZ, NOW()),
    COALESCE((p_shift->>'closed_at')::TIMESTAMPTZ, NOW()),
    COALESCE(p_shift->>'starting_cash', '0')::NUMERIC,
    COALESCE(p_shift->>'expected_cash', '0')::NUMERIC,
    COALESCE(p_shift->>'actual_cash', '0')::NUMERIC,
    COALESCE(p_shift->>'difference', '0')::NUMERIC,
    p_shift->>'notes'
  ) RETURNING id INTO v_shift_id;

  INSERT INTO public.cash_drawer_logs (
    shift_id, staff_id, action, amount, description,
    starting_cash, expected_cash, actual_cash, difference,
    opened_at, closed_at, notes
  ) VALUES (
    v_shift_id,
    COALESCE(p_cash_drawer->>'staff_id', p_performed_by),
    COALESCE(p_cash_drawer->>'action', 'close_day'),
    COALESCE(p_cash_drawer->>'amount', '0')::NUMERIC,
    p_cash_drawer->>'description',
    COALESCE(p_cash_drawer->>'starting_cash', '0')::NUMERIC,
    COALESCE(p_cash_drawer->>'expected_cash', '0')::NUMERIC,
    COALESCE(p_cash_drawer->>'actual_cash', '0')::NUMERIC,
    COALESCE(p_cash_drawer->>'difference', '0')::NUMERIC,
    COALESCE((p_cash_drawer->>'opened_at')::TIMESTAMPTZ, NOW()),
    COALESCE((p_cash_drawer->>'closed_at')::TIMESTAMPTZ, NOW()),
    p_cash_drawer->>'notes'
  );

  IF p_audit_log IS NOT NULL THEN
    INSERT INTO public.operation_logs (
      action, old_values, new_values, performed_by
    ) VALUES (
      COALESCE(p_audit_log->>'action', 'close_day'),
      COALESCE(p_audit_log->>'old_values', '{}'::jsonb),
      COALESCE(p_audit_log->>'new_values', jsonb_build_object('report_id', v_report_id, 'shift_id', v_shift_id)),
      p_performed_by
    );
  END IF;

  RETURN jsonb_build_object('success', true, 'report_id', v_report_id, 'shift_id', v_shift_id);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$function$;

GRANT ALL ON FUNCTION public.close_day_atomic(date, jsonb, jsonb, jsonb, jsonb, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.close_day_atomic(date, jsonb, jsonb, jsonb, jsonb, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.close_day_atomic(date, jsonb, jsonb, jsonb, jsonb, uuid) FROM authenticated;

-- atomic_apply_invoice
CREATE OR REPLACE FUNCTION public.atomic_apply_invoice (
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

GRANT ALL ON FUNCTION public.atomic_apply_invoice(uuid, jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.atomic_apply_invoice(uuid, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.atomic_apply_invoice(uuid, jsonb) FROM authenticated;

-- atomic_receive_goods
CREATE OR REPLACE FUNCTION public.atomic_receive_goods (
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

  UPDATE purchase_orders
  SET status = p_po_status, received_at = NOW()
  WHERE id = p_purchase_order_id;

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

GRANT ALL ON FUNCTION public.atomic_receive_goods(uuid, jsonb, jsonb, uuid, text, text) TO service_role;
REVOKE ALL ON FUNCTION public.atomic_receive_goods(uuid, jsonb, jsonb, uuid, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.atomic_receive_goods(uuid, jsonb, jsonb, uuid, text, text) FROM authenticated;

-- deduct_inventory_atomic
CREATE OR REPLACE FUNCTION public.deduct_inventory_atomic (
  p_order_id     uuid,
  p_performed_by uuid DEFAULT NULL::uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  AS $function$
DECLARE
  v_item RECORD;
  v_recipe RECORD;
  v_deducted INT := 0;
BEGIN
  FOR v_item IN 
    SELECT oi.id, oi.product_id, oi.quantity, p.is_ready_product, p.direct_ingredient_id
    FROM public.order_items oi
    JOIN public.products p ON p.id = oi.product_id
    WHERE oi.order_id = p_order_id
    FOR UPDATE
  LOOP
    IF v_item.is_ready_product AND v_item.direct_ingredient_id IS NOT NULL THEN
      INSERT INTO public.inventory_transactions (
        order_item_id, ingredient_id, quantity, unit, transaction_type,
        reference_type, reference_id, performed_by, created_at
      ) VALUES (
        v_item.id, v_item.direct_ingredient_id, v_item.quantity, 'piece', 'order_consumption',
        'order', p_order_id, p_performed_by, NOW()
      );
      v_deducted := v_deducted + 1;
    ELSE
      FOR v_recipe IN 
        SELECT r.ingredient_id, r.quantity_required, r.quantity_brutto, i.unit
        FROM public.recipes r
        JOIN public.ingredients i ON i.id = r.ingredient_id
        WHERE r.menu_item_id = v_item.product_id
      LOOP
        INSERT INTO public.inventory_transactions (
          order_item_id, ingredient_id, quantity, unit, transaction_type,
          reference_type, reference_id, performed_by, created_at
        ) VALUES (
          v_item.id, v_recipe.ingredient_id, 
          COALESCE(v_recipe.quantity_brutto, v_recipe.quantity_required) * v_item.quantity,
          v_recipe.unit, 'order_consumption', 'order', p_order_id, p_performed_by, NOW()
        );
        v_deducted := v_deducted + 1;
      END LOOP;
    END IF;
  END LOOP;

  INSERT INTO public.operation_logs (
    order_id, action, new_values, performed_by
  ) VALUES (
    p_order_id, 'deduct_inventory',
    jsonb_build_object('deducted_items', v_deducted),
    p_performed_by
  );

  RETURN jsonb_build_object('success', true, 'deducted_items', v_deducted);
END;
$function$;

GRANT ALL ON FUNCTION public.deduct_inventory_atomic(uuid, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.deduct_inventory_atomic(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.deduct_inventory_atomic(uuid, uuid) FROM authenticated;

-- cancel_delivery_order
CREATE OR REPLACE FUNCTION public.cancel_delivery_order (
  p_order_id     uuid,
  p_performed_by uuid DEFAULT NULL::uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
DECLARE
  v_order RECORD;
BEGIN
  SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;
  IF v_order.status NOT IN ('new', 'confirmed', 'preparing') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order cannot be cancelled in current status');
  END IF;
  UPDATE orders SET status = 'cancelled', updated_at = now() WHERE id = p_order_id;
  INSERT INTO operation_logs (table_name, record_id, action, old_values, new_values, performed_by)
  VALUES ('orders', p_order_id, 'cancel_delivery', jsonb_build_object('status', v_order.status), jsonb_build_object('status', 'cancelled'), p_performed_by);
  RETURN jsonb_build_object('success', true);
END;
$function$;

GRANT ALL ON FUNCTION public.cancel_delivery_order(uuid, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.cancel_delivery_order(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.cancel_delivery_order(uuid, uuid) FROM authenticated;

-- cancel_takeaway_order
CREATE OR REPLACE FUNCTION public.cancel_takeaway_order (
  p_order_id     uuid,
  p_performed_by uuid DEFAULT NULL::uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
DECLARE
  v_order RECORD;
BEGIN
  SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;
  IF v_order.status NOT IN ('new', 'confirmed', 'preparing') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order cannot be cancelled in current status');
  END IF;
  UPDATE orders SET status = 'cancelled', updated_at = now() WHERE id = p_order_id;
  INSERT INTO operation_logs (table_name, record_id, action, old_values, new_values, performed_by)
  VALUES ('orders', p_order_id, 'cancel_takeaway', jsonb_build_object('status', v_order.status), jsonb_build_object('status', 'cancelled'), p_performed_by);
  RETURN jsonb_build_object('success', true);
END;
$function$;

GRANT ALL ON FUNCTION public.cancel_takeaway_order(uuid, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.cancel_takeaway_order(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.cancel_takeaway_order(uuid, uuid) FROM authenticated;
