-- ============================================================
-- 0.4-D: Canonical Item Correction Workflow
--   correct_item_atomic – single atomic engine:
--     VOID original (registry-aware + manager override) +
--     RE-ADD corrected replacement (server-sourced snapshot),
--     linked via item_corrections (audit lineage).
--   Covers: D4 void+re-add, D5 quantity, D6 modifiers,
--           D7 price/tax, D8 manager override, D9 finalized
--           restrictions, D10 inventory reversal boundary
--           (outbox only, no direct stock mutation),
--           D11 kitchen compensation (kitchen_aware flag +
--           order_item.voided/order_item.kitchen_compensation),
--           D12 audit/reason, D13 idempotency.
--   Correction type drift (current product price vs original)
--   is logged in delta + reason. Replacement starts 'pending'
--   and re-runs the canonical lifecycle.
-- ============================================================

BEGIN;

-- 1. Correction lineage contract
CREATE TABLE IF NOT EXISTS item_corrections (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id             uuid NOT NULL REFERENCES orders(id),
  original_item_id     uuid NOT NULL REFERENCES order_items(id),
  replacement_item_id  uuid REFERENCES order_items(id),
  correction_type      text NOT NULL CHECK (correction_type IN
                         ('quantity','modifiers','price_tax','void_readd')),
  reason               text,
  status               text NOT NULL DEFAULT 'completed'
                         CHECK (status IN ('completed','voided')),
  performed_by         uuid NOT NULL REFERENCES staff(id),
  idempotency_key      text UNIQUE,
  old_total            numeric(12,2) NOT NULL DEFAULT 0,
  new_total            numeric(12,2) NOT NULL DEFAULT 0,
  delta                numeric(12,2) NOT NULL DEFAULT 0,
  created_at           timestamptz NOT NULL DEFAULT now(),
  closed_at            timestamptz
);
CREATE INDEX IF NOT EXISTS idx_item_corrections_order    ON item_corrections(order_id);
CREATE INDEX IF NOT EXISTS idx_item_corrections_original ON item_corrections(original_item_id);
CREATE INDEX IF NOT EXISTS idx_item_corrections_replaced ON item_corrections(replacement_item_id);

COMMENT ON TABLE item_corrections IS
  '0.4-D correction lineage: VOID original + RE-ADD replacement, one row per correction op.';

-- first-class correction event type (idempotent enum extension)
DO $$
BEGIN
  ALTER TYPE order_event_type ADD VALUE IF NOT EXISTS 'item_corrected';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. Server-side replacement pricing (mirrors add_item_atomic, correction-flagged)
CREATE OR REPLACE FUNCTION _price_replacement_snapshot(
  p_product_id uuid, p_quantity int, p_modifiers jsonb, p_tax_rate numeric
) RETURNS jsonb
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_product RECORD;
  v_mod RECORD;
  v_mod_rec jsonb;
  v_mod_json jsonb := '[]'::jsonb;
  v_mod_total numeric := 0;
  v_unit numeric;
  v_total numeric;
  v_tax numeric;
  v_snapshot jsonb;
BEGIN
  SELECT * INTO v_product FROM products WHERE id = p_product_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'PRODUCT_NOT_FOUND: %', p_product_id USING ERRCODE = 'P0001'; END IF;

  v_unit := CASE WHEN v_product.discount_price IS NOT NULL AND v_product.discount_price > 0
                 THEN v_product.discount_price ELSE v_product.price END;

  FOR v_mod_rec IN SELECT * FROM jsonb_array_elements(COALESCE(p_modifiers, '[]'::jsonb))
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
      'price', v_mod.price, 'quantity', COALESCE((v_mod_rec->>'quantity')::int, 1)
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
    'applied_discount', ROUND((v_product.price - CASE WHEN v_product.discount_price > 0
                 THEN v_product.discount_price ELSE v_product.price END)::numeric, 2),
    'unit_price', v_unit,
    'modifiers', v_mod_json,
    'modifier_total', v_mod_total,
    'tax_rate', COALESCE(p_tax_rate, 0),
    'tax_amount', v_tax,
    'currency', 'AZN',
    'total_price', v_total,
    'snapshot_at', now(),
    'correction', true
  );

  RETURN jsonb_build_object(
    'product_name', v_product.name,
    'station_id', v_product.station_id,
    'unit_price', v_unit,
    'modifier_total', v_mod_total,
    'total_price', v_total,
    'tax_amount', v_tax,
    'modifiers', v_mod_json,
    'snapshot', v_snapshot
  );
END;
$$;

-- 3. Correction engine: VOID original + RE-ADD replacement, single transaction
CREATE OR REPLACE FUNCTION correct_item_atomic(
  p_token text,
  p_item_id uuid,
  p_correction jsonb,
  p_reason text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL,
  p_metadata jsonb DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_staff_id uuid;
  v_item RECORD;
  v_order RECORD;
  v_rule jsonb;
  v_allowed jsonb;
  v_type text;
  v_qty int;
  v_mods jsonb;
  v_tax numeric;
  v_course text;
  v_seat int;
  v_notes text;
  v_old_total numeric;
  v_void_total numeric;
  v_pricing jsonb;
  v_new_total numeric;
  v_delta numeric;
  v_new_item uuid;
  v_corr uuid;
  v_corr_key text;
  v_prev RECORD;
  v_production boolean;
  v_stock_consumed boolean;
BEGIN
  PERFORM set_session_staff(p_token);
  v_staff_id := current_staff_id();

  v_type := COALESCE(p_correction->>'type','void_readd');

  -- correction type contract
  IF v_type NOT IN ('quantity','modifiers','price_tax','void_readd') THEN
    RAISE EXCEPTION 'UNKNOWN_CORRECTION_TYPE: % (quantity|modifiers|price_tax|void_readd)', v_type USING ERRCODE='P0001';
  END IF;
  v_qty  := COALESCE((p_correction->>'quantity')::int, NULL);
  v_mods := COALESCE(p_correction->'modifiers', NULL);
  v_tax  := COALESCE((p_correction->>'tax_rate')::numeric, NULL);
  v_course := p_correction->>'course';
  v_seat := NULLIF((p_correction->>'seat_number')::int, NULL);
  v_notes := p_correction->>'special_notes';

  IF v_type = 'quantity' AND v_qty IS NULL THEN
    RAISE EXCEPTION 'CORRECTION_REQUIRES_QTY: quantity correction needs quantity' USING ERRCODE='P0001';
  END IF;
  IF v_type = 'modifiers' AND v_mods IS NULL THEN
    RAISE EXCEPTION 'CORRECTION_REQUIRES_MODIFIERS' USING ERRCODE='P0001';
  END IF;
  IF v_type = 'price_tax' AND v_tax IS NULL THEN
    RAISE EXCEPTION 'CORRECTION_REQUIRES_TAX_RATE' USING ERRCODE='P0001';
  END IF;
  IF v_qty IS NOT NULL AND v_qty <= 0 THEN
    RAISE EXCEPTION 'INVALID_QTY: quantity must be > 0' USING ERRCODE='P0001';
  END IF;
  IF v_tax IS NOT NULL AND (v_tax < 0 OR v_tax > 100) THEN
    RAISE EXCEPTION 'INVALID_TAX_RATE: % (0..100)', v_tax USING ERRCODE='P0001';
  END IF;

  -- idempotency dedupe (same logical correction submitted twice)
  v_corr_key := COALESCE(p_idempotency_key, 'corr-' || v_staff_id || '-' || p_item_id || '-' || to_jsonb(p_correction)::text);
  SELECT * INTO v_prev FROM item_corrections WHERE idempotency_key = v_corr_key;
  IF FOUND THEN
    RETURN jsonb_build_object('success', true, 'duplicate', true,
      'correction_id', v_prev.id, 'original_item_id', v_prev.original_item_id,
      'replacement_item_id', v_prev.replacement_item_id);
  END IF;

  -- serialized: resolve order_id, then lock ORDER FIRST, then ITEM
  SELECT * INTO v_order FROM orders WHERE id = (SELECT order_id FROM order_items WHERE id = p_item_id) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_ITEM_NOT_FOUND' USING ERRCODE='P0001'; END IF;

  SELECT * INTO v_item FROM order_items WHERE id = p_item_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_ITEM_NOT_FOUND' USING ERRCODE='P0001'; END IF;

  -- D9: finalized order restricts any correction
  IF v_order.status IN ('paid','closed','cancelled','refunded','partially_refunded') THEN
    RAISE EXCEPTION 'ORDER_FINALIZED: corrections not allowed on % orders — use refund/reversal workflow', v_order.status USING ERRCODE='P0001';
  END IF;

  -- terminal items cannot be corrected again
  IF v_item.kitchen_status IN ('voided','cancelled','comped','wasted','recalled') THEN
    RAISE EXCEPTION 'ITEM_CORRECTION_FROZEN: item is terminal (%) — correct the replacement item instead', v_item.kitchen_status USING ERRCODE='P0001';
  END IF;

  -- void path from registry (consistent manager/permission gates)
  v_rule := validate_transition('item', v_item.kitchen_status, 'voided');
  IF NOT (v_rule->>'valid')::boolean THEN
    RAISE EXCEPTION 'INVALID_ITEM_TRANSITION: %', v_rule->>'error' USING ERRCODE='P0001';
  END IF;

  v_allowed := authorize(p_token, COALESCE(v_rule->>'requires_permission','order.void'), v_order.location_id);
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

  -- D10/D11 context
  v_production := v_item.kitchen_status IN ('sent','accepted','preparing','ready','served','completed');
  v_stock_consumed := v_item.kitchen_status IN ('ready','served','completed');

  -- server-sourced replacement pricing
  v_pricing := _price_replacement_snapshot(v_item.product_id,
    COALESCE(v_qty, v_item.quantity),
    COALESCE(v_mods, COALESCE(v_item.modifiers, '[]'::jsonb)),
    COALESCE(v_tax, COALESCE(v_item.tax_rate, 0)));

  v_old_total  := COALESCE(v_item.total_price, v_item.unit_price * v_item.quantity);
  v_void_total := v_old_total;
  v_new_total  := (v_pricing->>'total_price')::numeric;
  v_delta      := round(v_new_total - v_void_total, 2);

  v_corr := gen_random_uuid();

  -- VOID LEG
  UPDATE order_items SET
    kitchen_status = 'voided',
    total_price = 0,
    served_at = NULL,
    updated_at = now()
  WHERE id = p_item_id;

  UPDATE orders SET
    total_amount = GREATEST(0, COALESCE(total_amount, 0) - v_void_total),
    version = COALESCE(version, 0) + 1
  WHERE id = v_order.id;

  -- RE-ADD LEG (replacement starts pending, correlation = correction id)
  INSERT INTO order_items (
    order_id, product_id, product_name, quantity, unit_price, total_price,
    modifiers, course, seat_number, special_notes,
    kitchen_status, tax_rate, tax_amount, price_snapshot,
    station_id, idempotency_key, correlation_id
  ) VALUES (
    v_order.id, v_item.product_id, v_pricing->>'product_name', COALESCE(v_qty, v_item.quantity),
    (v_pricing->>'unit_price')::numeric, v_new_total,
    v_pricing->'modifiers',
    COALESCE(v_course, v_item.course),
    COALESCE(v_seat, v_item.seat_number),
    COALESCE(v_notes, v_item.special_notes),
    'pending', COALESCE(v_tax, COALESCE(v_item.tax_rate, 0)),
    (v_pricing->>'tax_amount')::numeric, v_pricing->'snapshot',
    (v_pricing->>'station_id')::uuid,
    NULL, v_corr
  ) RETURNING id INTO v_new_item;

  UPDATE orders SET
    total_amount = COALESCE(total_amount, 0) + v_new_total,
    version = COALESCE(version, 0) + 1,
    updated_at = now()
  WHERE id = v_order.id;

  -- lineage row
  INSERT INTO item_corrections (
    id, order_id, original_item_id, replacement_item_id, correction_type,
    reason, performed_by, idempotency_key, old_total, new_total, delta, closed_at
  ) VALUES (
    v_corr, v_order.id, p_item_id, v_new_item, v_type,
    p_reason, v_staff_id, v_corr_key, v_void_total, v_new_total, v_delta, now()
  );

  -- D12 AUDIT
  PERFORM log_order_event(v_order.id, 'item_voided',
    jsonb_build_object('item', p_item_id, 'total', v_void_total, 'status_before', v_item.kitchen_status, 'correction_type', v_type),
    jsonb_build_object('total', 0, 'reason', p_reason, 'replacement_item_id', v_new_item),
    COALESCE(p_metadata, jsonb_build_object('correction_id', v_corr)),
    v_staff_id, NULL, NULL, NULL);

  PERFORM log_order_event(v_order.id, 'item_added',
    NULL,
    jsonb_build_object('order_item_id', v_new_item, 'product_name', v_pricing->>'product_name',
      'quantity', COALESCE(v_qty, v_item.quantity), 'unit_price', (v_pricing->>'unit_price')::numeric,
      'total_price', v_new_total, 'tax_amount', (v_pricing->>'tax_amount')::numeric, 'replacement_of', p_item_id),
    jsonb_build_object('correction_id', v_corr, 'correction_type', v_type),
    v_staff_id, NULL, NULL, NULL);

  PERFORM log_order_event(v_order.id, 'item_corrected',
    jsonb_build_object('original_item_id', p_item_id, 'old_total', v_void_total),
    jsonb_build_object('replacement_item_id', v_new_item, 'new_total', v_new_total, 'delta', v_delta),
    jsonb_build_object('correction_type', v_type, 'reason', p_reason, 'correction_id', v_corr),
    v_staff_id, NULL, NULL, NULL);

  INSERT INTO operation_logs (operation, order_id, performed_by, reason, old_state, new_state,
                              location_id, organization_id, metadata)
  VALUES ('order_item.correct', v_order.id, v_staff_id, p_reason,
    jsonb_build_object('item', p_item_id, 'status', v_item.kitchen_status, 'total', v_void_total, 'correction_type', v_type),
    jsonb_build_object('replacement', v_new_item, 'status', 'pending', 'total', v_new_total, 'delta', v_delta),
    v_order.location_id, v_order.organization_id,
    COALESCE(p_metadata, '{}'::jsonb) || jsonb_build_object('correction_id', v_corr));

  -- outbox
  INSERT INTO outbox_events (aggregate_type, aggregate_id, event_type, payload, status)
  VALUES ('order_item', p_item_id, 'order_item.voided',
    jsonb_build_object('order_id', v_order.id, 'old_total', v_void_total, 'new_total', 0,
      'reason', p_reason, 'performed_by', v_staff_id, 'correction', true,
      'correction_type', v_type, 'replacement_item_id', v_new_item,
      'kitchen_aware', v_production, 'status_before', v_item.kitchen_status),
    'pending');

  INSERT INTO outbox_events (aggregate_type, aggregate_id, event_type, payload, status)
  VALUES ('order_item', v_new_item, 'order_item.added',
    jsonb_build_object('order_id', v_order.id, 'product_id', v_item.product_id,
      'quantity', COALESCE(v_qty, v_item.quantity), 'unit_price', (v_pricing->>'unit_price')::numeric,
      'total_price', v_new_total, 'tax_amount', (v_pricing->>'tax_amount')::numeric,
      'performed_by', v_staff_id, 'replacement_of', p_item_id, 'correction_id', v_corr),
    'pending');

  INSERT INTO outbox_events (aggregate_type, aggregate_id, event_type, payload, status)
  VALUES ('order_item', v_new_item, 'order_item.corrected',
    jsonb_build_object('order_id', v_order.id, 'original_item_id', p_item_id,
      'old_total', v_void_total, 'new_total', v_new_total, 'delta', v_delta,
      'correction_type', v_type, 'reason', p_reason, 'performed_by', v_staff_id),
    'pending');

  IF v_production THEN
    -- D11: KDS must mark the original as corrected/crossed out and show the replacement
    INSERT INTO outbox_events (aggregate_type, aggregate_id, event_type, payload, status)
    VALUES ('order_item', p_item_id, 'order_item.kitchen_compensation',
      jsonb_build_object('order_id', v_order.id, 'item_id', p_item_id,
        'replacement_item_id', v_new_item, 'status_before', v_item.kitchen_status,
        'reason', p_reason),
      'pending');
  END IF;

  IF v_stock_consumed THEN
    -- D10: inventory reversal is BOUNDED — we never mutate stock directly,
    -- only emit a reversal request for the inventory layer (0.4-H) to consume.
    INSERT INTO outbox_events (aggregate_type, aggregate_id, event_type, payload, status)
    VALUES ('order_item', p_item_id, 'inventory.reversal_requested',
      jsonb_build_object('order_id', v_order.id, 'item_id', p_item_id,
        'product_id', v_item.product_id, 'quantity', v_item.quantity,
        'kitchen_status_before', v_item.kitchen_status, 'correction_id', v_corr),
      'pending');
  END IF;

  RETURN jsonb_build_object('success', true,
    'correction_id', v_corr,
    'original_item_id', p_item_id,
    'replacement_item_id', v_new_item,
    'correction_type', v_type,
    'voided_total', v_void_total,
    'new_total', v_new_total,
    'delta', v_delta,
    'replacement_status', 'pending');
END;
$$;

COMMIT;