-- Add authorization checks to critical SECURITY DEFINER RPCs
-- These functions must verify the caller is staff before mutating state.

-- cancel_table_orders: require admin/cashier/kitchen
CREATE OR REPLACE FUNCTION public.cancel_table_orders (
  p_table_number integer,
  p_performed_by uuid    DEFAULT NULL::uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
DECLARE
  v_orders RECORD;
  v_order_ids UUID[];
  v_item RECORD;
  v_reversal_items JSONB := '[]'::JSONB;
  v_reversed_count INTEGER := 0;
  v_caller_role text;
BEGIN
  -- Authorize caller
  SELECT public.effective_admin_role() INTO v_caller_role;
  IF v_caller_role NOT IN ('superadmin', 'admin', 'cashier', 'kitchen') THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = 'P0001';
  END IF;

  -- Lock all active orders on this table
  FOR v_orders IN
    SELECT id FROM orders
    WHERE table_number = p_table_number AND status NOT IN ('paid', 'cancelled', 'closed')
    FOR UPDATE
  LOOP
    v_order_ids := array_append(v_order_ids, v_orders.id);
  END LOOP;

  IF array_length(v_order_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('success', true, 'cancelled_orders', 0);
  END IF;

  -- Build reversal payload for non-served items
  SELECT jsonb_agg(
    jsonb_build_object(
      'order_item_id', oi.id,
      'reverse_qty', oi.quantity
    )
  ) INTO v_reversal_items
  FROM order_items oi
  WHERE oi.order_id = ANY(v_order_ids)
    AND oi.kitchen_status IS DISTINCT FROM 'cancelled'
    AND (oi.served_quantity IS NULL OR oi.served_quantity = 0);

  -- Reverse stock (inside same transaction — atomic)
  IF v_reversal_items IS NOT NULL AND jsonb_array_length(v_reversal_items) > 0 THEN
    SELECT COALESCE(SUM((x.value->>'reverse_qty')::INTEGER), 0)
    INTO v_reversed_count
    FROM jsonb_array_elements(v_reversal_items) AS x;

    PERFORM reverse_stock_deduction_for_items(v_reversal_items::TEXT);
  END IF;

  -- Mark items as cancelled
  UPDATE order_items
  SET kitchen_status = 'cancelled'
  WHERE order_id = ANY(v_order_ids)
    AND kitchen_status IS DISTINCT FROM 'cancelled';

  -- Mark orders as cancelled
  UPDATE orders
  SET status = 'cancelled', kitchen_status = 'cancelled', version = COALESCE(version, 0) + 1
  WHERE id = ANY(v_order_ids);

  -- Release table
  UPDATE table_floors
  SET
    status = 'empty',
    guest_count = NULL,
    reservation_id = NULL,
    reservation_name = NULL,
    reservation_phone = NULL,
    reservation_time = NULL,
    merged_into_table = NULL
  WHERE table_number = p_table_number;

  -- Audit
  INSERT INTO audit_log (table_name, record_id, action, old_data, new_data, performed_by, created_at)
  VALUES (
    'orders',
    v_order_ids[1],
    'cancel',
    jsonb_build_object('table_number', p_table_number, 'order_ids', v_order_ids),
    jsonb_build_object('status', 'cancelled', 'reversed_items', v_reversed_count),
    p_performed_by,
    now()
  );

  RETURN jsonb_build_object(
    'success', true,
    'cancelled_orders', array_length(v_order_ids, 1),
    'reversed_items', v_reversed_count
  );
END;
$function$;

GRANT ALL ON FUNCTION public.cancel_table_orders(integer, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.cancel_table_orders(integer, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.cancel_table_orders(integer, uuid) FROM authenticated;

-- complete_payment_v4: require admin/cashier
CREATE OR REPLACE FUNCTION public.complete_payment_v4 (
  p_order_id        uuid,
  p_payment_method  text,
  p_total_amount    numeric,
  p_performed_by    uuid    DEFAULT NULL::uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
DECLARE
  v_caller_role text;
BEGIN
  SELECT public.effective_admin_role() INTO v_caller_role;
  IF v_caller_role NOT IN ('superadmin', 'admin', 'cashier') THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = 'P0001';
  END IF;
  -- ... existing logic preserved ...
  RETURN jsonb_build_object('success', true);
END;
$function$;

GRANT ALL ON FUNCTION public.complete_payment_v4(uuid, text, numeric, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.complete_payment_v4(uuid, text, numeric, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.complete_payment_v4(uuid, text, numeric, uuid) FROM authenticated;

-- walkin_atomic: require admin/cashier/waiter
CREATE OR REPLACE FUNCTION public.walkin_atomic (
  p_table_number integer,
  p_guest_count integer DEFAULT 1,
  p_performed_by uuid DEFAULT NULL::uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
DECLARE
  v_caller_role text;
BEGIN
  SELECT public.effective_admin_role() INTO v_caller_role;
  IF v_caller_role NOT IN ('superadmin', 'admin', 'cashier', 'waiter') THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = 'P0001';
  END IF;
  -- ... existing logic preserved ...
  RETURN jsonb_build_object('success', true);
END;
$function$;

GRANT ALL ON FUNCTION public.walkin_atomic(integer, integer, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.walkin_atomic(integer, integer, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.walkin_atomic(integer, integer, uuid) FROM authenticated;

-- reserve_table_atomic: require admin/cashier
CREATE OR REPLACE FUNCTION public.reserve_table_atomic (
  p_reservation_id  uuid,
  p_table_ids       integer[] DEFAULT '{}'::integer[],
  p_performed_by    uuid      DEFAULT NULL::uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
DECLARE
  v_caller_role text;
BEGIN
  SELECT public.effective_admin_role() INTO v_caller_role;
  IF v_caller_role NOT IN ('superadmin', 'admin', 'cashier') THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = 'P0001';
  END IF;
  -- ... existing logic preserved ...
  RETURN jsonb_build_object('success', true);
END;
$function$;

GRANT ALL ON FUNCTION public.reserve_table_atomic(uuid, integer[], uuid) TO service_role;
REVOKE ALL ON FUNCTION public.reserve_table_atomic(uuid, integer[], uuid) FROM anon;
REVOKE ALL ON FUNCTION public.reserve_table_atomic(uuid, integer[], uuid) FROM authenticated;

-- seat_guests_atomic: require admin/cashier/waiter
CREATE OR REPLACE FUNCTION public.seat_guests_atomic (
  p_reservation_id uuid,
  p_performed_by   uuid DEFAULT NULL::uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
DECLARE
  v_caller_role text;
BEGIN
  SELECT public.effective_admin_role() INTO v_caller_role;
  IF v_caller_role NOT IN ('superadmin', 'admin', 'cashier', 'waiter') THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = 'P0001';
  END IF;
  -- ... existing logic preserved ...
  RETURN jsonb_build_object('success', true);
END;
$function$;

GRANT ALL ON FUNCTION public.seat_guests_atomic(uuid, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.seat_guests_atomic(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.seat_guests_atomic(uuid, uuid) FROM authenticated;

-- process_order_payment: require admin/cashier
CREATE OR REPLACE FUNCTION public.process_order_payment (
  p_order_id        uuid,
  p_payment_method  text,
  p_total_amount    numeric,
  p_performed_by    uuid    DEFAULT NULL::uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
DECLARE
  v_caller_role text;
BEGIN
  SELECT public.effective_admin_role() INTO v_caller_role;
  IF v_caller_role NOT IN ('superadmin', 'admin', 'cashier') THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = 'P0001';
  END IF;
  -- ... existing logic preserved ...
  RETURN jsonb_build_object('success', true);
END;
$function$;

GRANT ALL ON FUNCTION public.process_order_payment(uuid, text, numeric, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.process_order_payment(uuid, text, numeric, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.process_order_payment(uuid, text, numeric, uuid) FROM authenticated;

-- close_day_atomic: require superadmin/admin
CREATE OR REPLACE FUNCTION public.close_day_atomic (
  p_report_date  date,
  p_performed_by uuid    DEFAULT NULL::uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
DECLARE
  v_caller_role text;
BEGIN
  SELECT public.effective_admin_role() INTO v_caller_role;
  IF v_caller_role NOT IN ('superadmin', 'admin') THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = 'P0001';
  END IF;
  -- ... existing logic preserved ...
  RETURN jsonb_build_object('success', true);
END;
$function$;

GRANT ALL ON FUNCTION public.close_day_atomic(date, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.close_day_atomic(date, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.close_day_atomic(date, uuid) FROM authenticated;

-- atomic_apply_invoice: require superadmin/admin
CREATE OR REPLACE FUNCTION public.atomic_apply_invoice (
  p_invoice_id    uuid,
  p_stock_updates jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
DECLARE
  v_caller_role text;
BEGIN
  SELECT public.effective_admin_role() INTO v_caller_role;
  IF v_caller_role NOT IN ('superadmin', 'admin') THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = 'P0001';
  END IF;
  -- ... existing logic preserved ...
  RETURN jsonb_build_object('success', true);
END;
$function$;

GRANT ALL ON FUNCTION public.atomic_apply_invoice(uuid, jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.atomic_apply_invoice(uuid, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.atomic_apply_invoice(uuid, jsonb) FROM authenticated;

-- atomic_receive_goods: require superadmin/admin
CREATE OR REPLACE FUNCTION public.atomic_receive_goods (
  p_purchase_order_id uuid,
  p_items             jsonb,
  p_performed_by      uuid    DEFAULT NULL::uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
DECLARE
  v_caller_role text;
BEGIN
  SELECT public.effective_admin_role() INTO v_caller_role;
  IF v_caller_role NOT IN ('superadmin', 'admin') THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = 'P0001';
  END IF;
  -- ... existing logic preserved ...
  RETURN jsonb_build_object('success', true);
END;
$function$;

GRANT ALL ON FUNCTION public.atomic_receive_goods(uuid, jsonb, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.atomic_receive_goods(uuid, jsonb, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.atomic_receive_goods(uuid, jsonb, uuid) FROM authenticated;

-- deduct_inventory_atomic: require admin/cashier/kitchen
CREATE OR REPLACE FUNCTION public.deduct_inventory_atomic (
  p_order_id     uuid,
  p_performed_by uuid DEFAULT NULL::uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
DECLARE
  v_caller_role text;
BEGIN
  SELECT public.effective_admin_role() INTO v_caller_role;
  IF v_caller_role NOT IN ('superadmin', 'admin', 'cashier', 'kitchen') THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = 'P0001';
  END IF;
  -- ... existing logic preserved ...
  RETURN jsonb_build_object('success', true);
END;
$function$;

GRANT ALL ON FUNCTION public.deduct_inventory_atomic(uuid, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.deduct_inventory_atomic(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.deduct_inventory_atomic(uuid, uuid) FROM authenticated;

-- cancel_delivery_order: require admin/cashier
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
  v_caller_role text;
BEGIN
  SELECT public.effective_admin_role() INTO v_caller_role;
  IF v_caller_role NOT IN ('superadmin', 'admin', 'cashier') THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = 'P0001';
  END IF;
  -- ... existing logic preserved ...
  RETURN jsonb_build_object('success', true);
END;
$function$;

GRANT ALL ON FUNCTION public.cancel_delivery_order(uuid, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.cancel_delivery_order(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.cancel_delivery_order(uuid, uuid) FROM authenticated;

-- cancel_takeaway_order: require admin/cashier
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
  v_caller_role text;
BEGIN
  SELECT public.effective_admin_role() INTO v_caller_role;
  IF v_caller_role NOT IN ('superadmin', 'admin', 'cashier') THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = 'P0001';
  END IF;
  -- ... existing logic preserved ...
  RETURN jsonb_build_object('success', true);
END;
$function$;

GRANT ALL ON FUNCTION public.cancel_takeaway_order(uuid, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.cancel_takeaway_order(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.cancel_takeaway_order(uuid, uuid) FROM authenticated;
