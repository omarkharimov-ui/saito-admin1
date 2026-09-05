-- ============================================================
-- 0.4-B Part 2: Canonical atomic item operations
--   add_item_atomic    – server-sourced price/tax/modifier snapshot, idempotent
--   edit_item_atomic   – edit-rule envelope (cart ↔ sent ↔ production)
--   void_item_atomic   – registry+permission+manager-override void
--   restore_item_atomic– undo void/cancel (manager-gated)
-- Every op: row-locks order (serialize), audits (order_events,
-- operation_logs, outbox), never mutates money post-SENT.
-- ============================================================

BEGIN;

-- Helper: manager-override gate (0.3-H manager_overrides) — same semantics
-- as transition_order_atomic. Returns silently or RAISEs.
CREATE OR REPLACE FUNCTION ensure_manager_override(
  p_staff_id uuid, p_permission text, p_location_id uuid, p_from text, p_to text
) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  v_approver_key text;
  v_has boolean := false;
  v_over boolean := false;
BEGIN
  v_approver_key := CASE WHEN p_permission LIKE '%refund%' THEN 'refund.approve' ELSE 'void.approve' END;
  SELECT COALESCE(has_permission(p_staff_id, v_approver_key), false) INTO v_has;
  IF NOT v_has THEN
    SELECT EXISTS(
      SELECT 1 FROM manager_overrides mo
      WHERE mo.requested_by = p_staff_id
        AND mo.permission = p_permission
        AND mo.location_id = p_location_id
        AND mo.status = 'APPROVED'
        AND mo.expires_at > now()
    ) INTO v_over;
    IF NOT v_over THEN
      RAISE EXCEPTION 'MANAGER_OVERRIDE_REQUIRED: % → % (approver perm [%])',
        p_from, p_to, v_approver_key USING ERRCODE = 'P0001';
    END IF;
  END IF;
END;
$$;

-- 1. ADD ITEM (canonical server-priced snapshot, idempotent)
CREATE OR REPLACE FUNCTION add_item_atomic(
  p_token text,
  p_order_id uuid,
  p_product_id uuid,
  p_quantity integer DEFAULT 1,
  p_modifiers jsonb DEFAULT '[]'::jsonb,
  p_course text DEFAULT 'main',
  p_seat_number integer DEFAULT NULL,
  p_special_notes text DEFAULT NULL,
  p_tax_rate numeric DEFAULT 0,
  p_idempotency_key text DEFAULT NULL,
  p_correlation_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_staff_id uuid;
  v_order RECORD;
  v_product RECORD;
  v_mod RECORD;
  v_mod_rec jsonb;
  v_mod_total numeric := 0;
  v_unit numeric;
  v_total numeric;
  v_tax numeric;
  v_snapshot jsonb;
  v_mod_json jsonb := '[]'::jsonb;
  v_allowed jsonb;
  v_item_id uuid;
  prev_item RECORD;
BEGIN
  PERFORM set_session_staff(p_token);
  v_staff_id := current_staff_id();

  IF p_quantity <= 0 THEN
    RAISE EXCEPTION 'INVALID_QTY: quantity must be > 0' USING ERRCODE = 'P0001';
  END IF;

  -- serialized on the order row
  SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_NOT_FOUND' USING ERRCODE = 'P0001'; END IF;
  IF v_order.status IN ('paid','closed','cancelled') THEN
    RAISE EXCEPTION 'ORDER_FINALIZED' USING ERRCODE = 'P0001';
  END IF;

  v_allowed := authorize(p_token, 'orders.create', v_order.location_id);
  IF NOT (v_allowed->>'allowed')::boolean THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: orders.create at % (reason: %)',
      v_order.location_id, v_allowed->>'reason' USING ERRCODE = 'P0001';
  END IF;

  -- idempotency dedupe
  IF p_idempotency_key IS NOT NULL THEN
    SELECT * INTO prev_item FROM order_items WHERE idempotency_key = p_idempotency_key;
    IF FOUND THEN
      RETURN jsonb_build_object('success', true, 'duplicate', true,
        'order_item_id', prev_item.id, 'item_added', false);
    END IF;
  END IF;

  -- server-sourced product price
  SELECT * INTO v_product FROM products WHERE id = p_product_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PRODUCT_NOT_FOUND: %', p_product_id USING ERRCODE = 'P0001';
  END IF;

  v_unit := CASE WHEN v_product.discount_price IS NOT NULL AND v_product.discount_price > 0
                 THEN v_product.discount_price ELSE v_product.price END;

  -- modifier validation + server prices
  FOR v_mod_rec IN SELECT * FROM jsonb_array_elements(COALESCE(p_modifiers,'[]'::jsonb))
  LOOP
    SELECT * INTO v_mod FROM product_modifiers
    WHERE id = COALESCE((v_mod_rec->>'id')::uuid, (v_mod_rec->>'modifier_id')::uuid)
      AND product_id = p_product_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'INVALID_MODIFIER: % for product %',
        COALESCE((v_mod_rec->>'id'), (v_mod_rec->>'modifier_id')), p_product_id USING ERRCODE = 'P0001';
    END IF;
    v_mod_json := v_mod_json || jsonb_build_array(jsonb_build_object(
      'id', v_mod.id, 'name', COALESCE(v_mod.name_az, v_mod.name),
      'price', v_mod.price,
      'quantity', COALESCE((v_mod_rec->>'quantity')::int, 1)
    ));
  END LOOP;

  SELECT COALESCE(sum((el->>'price')::numeric * (el->>'quantity')::int), 0)
    INTO v_mod_total FROM jsonb_array_elements(v_mod_json) el;

  v_unit := v_unit + v_mod_total;
  v_total := v_unit * p_quantity;
  v_tax := round(v_total * COALESCE(p_tax_rate, 0) / 100, 2);

  v_snapshot := jsonb_build_object(
    'schema', 'v1',
    'product_id', p_product_id,
    'product_name', v_product.name,
    'base_unit_price', v_product.price,
    'discount_price', NULLIF(v_product.discount_price, 0),
    'applied_discount', ROUND((v_product.price - CASE WHEN v_product.discount_price > 0 THEN v_product.discount_price ELSE v_product.price END)::numeric, 2),
    'unit_price', v_unit,
    'modifiers', v_mod_json,
    'modifier_total', v_mod_total,
    'tax_rate', COALESCE(p_tax_rate, 0),
    'tax_amount', v_tax,
    'currency', 'AZN',
    'total_price', v_total,
    'snapshot_at', now()
  );

  INSERT INTO order_items (
    order_id, product_id, product_name, quantity, unit_price, total_price,
    modifiers, course, seat_number, special_notes,
    kitchen_status, tax_rate, tax_amount, price_snapshot,
    station_id, idempotency_key, correlation_id
  ) VALUES (
    p_order_id, p_product_id, v_product.name, p_quantity, v_unit, v_total,
    v_mod_json, COALESCE(p_course, 'main'), p_seat_number, p_special_notes,
    'pending', COALESCE(p_tax_rate, 0), v_tax, v_snapshot,
    v_product.station_id,
    p_idempotency_key,
    COALESCE(p_correlation_id, gen_random_uuid())
  )
  RETURNING id INTO v_item_id;

  UPDATE orders SET
    total_amount = COALESCE(total_amount, 0) + v_total,
    version = COALESCE(version, 0) + 1,
    updated_at = now()
  WHERE id = p_order_id;

  PERFORM log_order_event(p_order_id, 'item_added',
    NULL,
    jsonb_build_object('order_item_id', v_item_id, 'product_name', v_product.name,
      'quantity', p_quantity, 'unit_price', v_unit, 'total_price', v_total,
      'tax_amount', v_tax),
    jsonb_build_object('idempotency_key', p_idempotency_key,
      'correlation_id', COALESCE(p_correlation_id, gen_random_uuid())),
    v_staff_id, NULL, NULL, NULL);

  INSERT INTO operation_logs (operation, order_id, performed_by, reason, old_state, new_state,
                              location_id, organization_id, metadata)
  VALUES ('order_item.add', p_order_id, v_staff_id, p_special_notes, '{}'::jsonb,
          jsonb_build_object('item', v_item_id, 'product', p_product_id, 'qty', p_quantity, 'total', v_total),
          v_order.location_id, v_order.organization_id,
          jsonb_build_object('idempotency_key', p_idempotency_key, 'correlation_id', COALESCE(p_correlation_id, gen_random_uuid())));

  INSERT INTO outbox_events (aggregate_type, aggregate_id, event_type, payload, status)
  VALUES ('order_item', v_item_id, 'order_item.added',
    jsonb_build_object('order_id', p_order_id, 'product_id', p_product_id,
      'quantity', p_quantity, 'unit_price', v_unit, 'total_price', v_total,
      'tax_amount', v_tax, 'performed_by', v_staff_id),
    'pending');

  RETURN jsonb_build_object('success', true, 'order_item_id', v_item_id,
    'unit_price', v_unit, 'total_price', v_total, 'tax_amount', v_tax,
    'modifier_total', v_mod_total, 'price_snapshot', v_snapshot);
END;
$$;

-- 2. EDIT ITEM (edit-rule envelope)
CREATE OR REPLACE FUNCTION edit_item_atomic(
  p_token text,
  p_item_id uuid,
  p_quantity integer DEFAULT NULL,
  p_course text DEFAULT NULL,
  p_seat_number integer DEFAULT NULL,
  p_special_notes text DEFAULT NULL,
  p_reason text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_staff_id uuid;
  v_item RECORD;
  v_order RECORD;
  v_allowed jsonb;
  v_old_total numeric;
  v_new_total numeric;
  v_now timestamptz := now();
BEGIN
  PERFORM set_session_staff(p_token);
  v_staff_id := current_staff_id();

  SELECT * INTO v_item FROM order_items WHERE id = p_item_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_ITEM_NOT_FOUND' USING ERRCODE = 'P0001'; END IF;

  SELECT * INTO v_order FROM orders WHERE id = v_item.order_id FOR UPDATE;
  IF v_order.status IN ('paid','closed','cancelled') THEN
    RAISE EXCEPTION 'ORDER_FINALIZED' USING ERRCODE = 'P0001';
  END IF;

  v_allowed := authorize(p_token, 'orders.edit', v_order.location_id);
  IF NOT (v_allowed->>'allowed')::boolean THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: orders.edit at % (reason: %)',
      v_order.location_id, v_allowed->>'reason' USING ERRCODE = 'P0001';
  END IF;

  -- edit rules by state
  IF v_item.kitchen_status IN ('voided','cancelled','comped','wasted','recalled') THEN
    RAISE EXCEPTION 'ITEM_EDIT_FROZEN: item is terminal (%) — use void+re-add', v_item.kitchen_status USING ERRCODE='P0001';
  END IF;

  IF p_quantity IS NOT NULL THEN
    IF p_quantity <= 0 THEN
      RAISE EXCEPTION 'INVALID_QTY: quantity must be > 0' USING ERRCODE = 'P0001';
    END IF;
    IF v_item.kitchen_status IN ('sent','accepted') AND p_quantity > v_item.quantity THEN
      RAISE EXCEPTION 'ITEM_QTY_FROZEN: item sent to kitchen — quantity can only be reduced (was %)', v_item.quantity USING ERRCODE='P0001';
    END IF;
    IF v_item.kitchen_status IN ('preparing','ready','served','completed','hot','bar','sushi') THEN
      RAISE EXCEPTION 'ITEM_QTY_FROZEN: in production (%) — correction via void+re-add', v_item.kitchen_status USING ERRCODE='P0001';
    END IF;
  END IF;

  v_old_total := COALESCE(v_item.total_price, v_item.unit_price * v_item.quantity);
  v_new_total := v_old_total;

  UPDATE order_items SET
    quantity    = COALESCE(p_quantity, quantity),
    total_price = CASE WHEN p_quantity IS NOT NULL THEN unit_price * p_quantity ELSE total_price END,
    course      = COALESCE(p_course, course),
    seat_number = COALESCE(p_seat_number, seat_number),
    special_notes = COALESCE(p_special_notes, special_notes),
    updated_at  = v_now
  WHERE id = p_item_id
  RETURNING total_price INTO v_new_total;

  IF v_new_total IS DISTINCT FROM v_old_total THEN
    UPDATE orders SET
      total_amount = GREATEST(0, COALESCE(total_amount, 0) + (v_new_total - v_old_total)),
      version = COALESCE(version, 0) + 1,
      updated_at = v_now
    WHERE id = v_order.id;
  END IF;

  PERFORM log_order_event(v_order.id,
    CASE WHEN p_quantity IS NOT NULL AND p_quantity <> v_item.quantity
         THEN 'quantity_changed' ELSE 'item_modified' END,
    jsonb_build_object('old_qty', v_item.quantity, 'old_total', v_old_total),
    jsonb_build_object('new_qty', COALESCE(p_quantity, v_item.quantity), 'new_total', v_new_total),
    jsonb_build_object('reason', p_reason),
    v_staff_id, NULL, NULL, NULL);

  INSERT INTO outbox_events (aggregate_type, aggregate_id, event_type, payload, status)
  VALUES ('order_item', p_item_id, 'order_item.edited',
    jsonb_build_object('order_id', v_order.id, 'old_total', v_old_total,
      'new_total', v_new_total, 'performed_by', v_staff_id, 'reason', p_reason), 'pending');

  RETURN jsonb_build_object('success', true, 'order_item_id', p_item_id,
    'quantity', COALESCE(p_quantity, v_item.quantity), 'total_price', v_new_total);
END;
$$;

-- 3. VOID ITEM (registry + permission + manager override)
CREATE OR REPLACE FUNCTION void_item_atomic(
  p_token text,
  p_item_id uuid,
  p_reason text DEFAULT NULL,
  p_metadata jsonb DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_staff_id uuid;
  v_item RECORD;
  v_order RECORD;
  v_rule jsonb;
  v_allowed jsonb;
  v_void_total numeric;
BEGIN
  PERFORM set_session_staff(p_token);
  v_staff_id := current_staff_id();

  SELECT * INTO v_item FROM order_items WHERE id = p_item_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_ITEM_NOT_FOUND' USING ERRCODE = 'P0001'; END IF;

  SELECT * INTO v_order FROM orders WHERE id = v_item.order_id FOR UPDATE;
  IF v_order.status IN ('paid','closed','refunded','partially_refunded') THEN
    RAISE EXCEPTION 'ORDER_FINALIZED: use refund/reversal workflow for paid orders' USING ERRCODE='P0001';
  END IF;

  v_rule := validate_transition('item', v_item.kitchen_status, 'voided');
  IF NOT (v_rule->>'valid')::boolean THEN
    RAISE EXCEPTION 'INVALID_ITEM_TRANSITION: %', v_rule->>'error' USING ERRCODE='P0001';
  END IF;

  v_allowed := authorize(p_token, COALESCE(v_rule->>'requires_permission', 'order.void'), v_order.location_id);
  IF NOT (v_allowed->>'allowed')::boolean THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: % at % (reason: %)',
      COALESCE(v_rule->>'requires_permission','order.void'), v_order.location_id,
      v_allowed->>'reason' USING ERRCODE='P0001';
  END IF;

  IF COALESCE(v_rule->>'requires_manager_override','false')::boolean THEN
    PERFORM ensure_manager_override(v_staff_id,
      COALESCE(v_rule->>'requires_permission','order.void'),
      v_order.location_id, v_item.kitchen_status, 'voided');
  END IF;

  v_void_total := COALESCE(v_item.total_price, v_item.unit_price * v_item.quantity);

  UPDATE order_items SET
    kitchen_status = 'voided',
    total_price = 0,
    served_at = NULL,
    updated_at = now()
  WHERE id = p_item_id;

  UPDATE orders SET
    total_amount = GREATEST(0, COALESCE(total_amount, 0) - v_void_total),
    version = COALESCE(version, 0) + 1,
    updated_at = now()
  WHERE id = v_order.id;

  PERFORM log_order_event(v_order.id, 'item_voided',
    jsonb_build_object('item', p_item_id, 'total', v_void_total),
    jsonb_build_object('total', 0, 'reason', p_reason),
    COALESCE(p_metadata, '{}'::jsonb), v_staff_id, NULL, NULL, NULL);

  INSERT INTO operation_logs (operation, order_id, performed_by, reason, old_state, new_state,
                              location_id, organization_id, metadata)
  VALUES ('order_item.void', v_order.id, v_staff_id, p_reason,
    jsonb_build_object('item', p_item_id, 'status', v_item.kitchen_status, 'total', v_void_total),
    jsonb_build_object('status', 'voided', 'total', 0),
    v_order.location_id, v_order.organization_id, COALESCE(p_metadata, '{}'::jsonb));

  INSERT INTO outbox_events (aggregate_type, aggregate_id, event_type, payload, status)
  VALUES ('order_item', p_item_id, 'order_item.voided',
    jsonb_build_object('order_id', v_order.id, 'old_total', v_void_total,
      'new_total', 0, 'reason', p_reason, 'performed_by', v_staff_id), 'pending');

  RETURN jsonb_build_object('success', true, 'order_item_id', p_item_id,
    'voided_total', v_void_total, 'item_status', 'voided');
END;
$$;

-- 4. RESTORE ITEM (undo void/cancel — manager-gated)
CREATE OR REPLACE FUNCTION restore_item_atomic(
  p_token text,
  p_item_id uuid,
  p_reason text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_staff_id uuid;
  v_item RECORD;
  v_order RECORD;
  v_rule jsonb;
  v_allowed jsonb;
  v_restore_total numeric;
BEGIN
  PERFORM set_session_staff(p_token);
  v_staff_id := current_staff_id();

  SELECT * INTO v_item FROM order_items WHERE id = p_item_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_ITEM_NOT_FOUND' USING ERRCODE = 'P0001'; END IF;
  IF v_item.kitchen_status NOT IN ('voided','cancelled') THEN
    RAISE EXCEPTION 'ITEM_NOT_VOIDED: item is % — only voided/cancelled items are restorable', v_item.kitchen_status USING ERRCODE='P0001';
  END IF;

  SELECT * INTO v_order FROM orders WHERE id = v_item.order_id FOR UPDATE;
  IF v_order.status IN ('paid','closed','refunded','partially_refunded') THEN
    RAISE EXCEPTION 'ORDER_FINALIZED' USING ERRCODE='P0001';
  END IF;

  v_rule := validate_transition('item', v_item.kitchen_status, 'pending');
  IF NOT (v_rule->>'valid')::boolean THEN
    RAISE EXCEPTION 'INVALID_ITEM_TRANSITION: %', v_rule->>'error' USING ERRCODE='P0001';
  END IF;

  v_allowed := authorize(p_token, COALESCE(v_rule->>'requires_permission','orders.edit'), v_order.location_id);
  IF NOT (v_allowed->>'allowed')::boolean THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: % at % (reason: %)',
      COALESCE(v_rule->>'requires_permission','orders.edit'), v_order.location_id,
      v_allowed->>'reason' USING ERRCODE='P0001';
  END IF;

  IF COALESCE(v_rule->>'requires_manager_override','false')::boolean THEN
    PERFORM ensure_manager_override(v_staff_id,
      COALESCE(v_rule->>'requires_permission','orders.edit'),
      v_order.location_id, v_item.kitchen_status, 'pending');
  END IF;

  v_restore_total := v_item.unit_price * v_item.quantity;

  UPDATE order_items SET
    kitchen_status = 'pending',
    total_price = v_restore_total,
    updated_at = now()
  WHERE id = p_item_id;

  UPDATE orders SET
    total_amount = COALESCE(total_amount, 0) + v_restore_total,
    version = COALESCE(version, 0) + 1,
    updated_at = now()
  WHERE id = v_order.id;

  PERFORM log_order_event(v_order.id, 'kitchen_status_changed',
    jsonb_build_object('item', p_item_id, 'status_before', v_item.kitchen_status),
    jsonb_build_object('status', 'pending', 'total', v_restore_total, 'reason', p_reason),
    '{}'::jsonb, v_staff_id, NULL, NULL, NULL);

  INSERT INTO outbox_events (aggregate_type, aggregate_id, event_type, payload, status)
  VALUES ('order_item', p_item_id, 'order_item.restored',
    jsonb_build_object('order_id', v_order.id, 'total', v_restore_total,
      'reason', p_reason, 'performed_by', v_staff_id), 'pending');

  RETURN jsonb_build_object('success', true, 'order_item_id', p_item_id,
    'restored_total', v_restore_total, 'item_status', 'pending');
END;
$$;

COMMIT;