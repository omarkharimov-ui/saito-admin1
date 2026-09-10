-- ═════════════════════════════════════════════════════════════════════
-- Migration 20260910000003  (task 1.5 / D-9 + Q1)
-- TOTAL SSOT + VAT — canonical server-side engine
-- ═════════════════════════════════════════════════════════════════════
-- DESIGN: D15_TOTAL_SSOT_VAT_DESIGN.md (repo root).
--
-- Decisions (user-locked 2026-09-10):
--   Q1: Tax-EXCLUSIVE default. Opt-in VAT. Settings:
--        vat_enabled (default false) / vat_percentage (default 18) /
--        auto_apply_vat (default false).
--   Q2: POS VAT toggle requires MANAGER PIN. QR (customer) toggle free.
--
-- Canonical formula (single source of truth — client NEVER computes):
--   Subtotal = Σ order_items.total_price WHERE kitchen_status
--              NOT IN ('cancelled','voided')
--   VAT      = p_apply_vat AND settings.vat_enabled
--              ? ROUND(Subtotal × settings.vat_percentage/100, 2) : 0
--   Service  = p_apply_service AND settings.receipt_show_service_fee
--              ? ROUND(Subtotal × settings.receipt_service_fee_pct/100, 2) : 0
--   Total    = max(0, Subtotal + VAT + Service − orders.discount_amount)
-- R1 (user-locked): Service on SUBTOTAL (no tax-on-tax, Baku practice).
--
-- Behavior compatibility:
--   • New orders are created with apply_vat=settings.auto_apply_vat
--     (default false) and service OFF → totals are IDENTICAL to today
--     (items only). Toggling is explicit (UI).
--   • orders.tax_pct/tax_amount/service_charge_pct/service_charge_amount
--     columns ALREADY EXIST (def=0) — now populated by the engine.
--   • complete_payment_atomic_v2 (FROZEN) untouched — it reads total_amount.
--   • recalculate_order_payment_state (D-8) untouched — refund path.
-- ═════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────
-- 1) settings: VAT config (idempotent ADD COLUMN)
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS vat_enabled      boolean DEFAULT false;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS vat_percentage   numeric DEFAULT 18.00;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS auto_apply_vat   boolean DEFAULT false;

-- ─────────────────────────────────────────────────────────────────────────
-- 2) orders: per-order VAT flag (audit/reprint)
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS apply_vat boolean DEFAULT false;

-- ─────────────────────────────────────────────────────────────────────────
-- 3) calculate_order_total_v3 — THE canonical engine (new)
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.calculate_order_total_v3(
  p_order_id      uuid,
  p_apply_vat     boolean DEFAULT false,
  p_apply_service boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_subtotal NUMERIC;
  v_vat_pct  NUMERIC := 0;
  v_vat_amt  NUMERIC := 0;
  v_svc_pct  NUMERIC := 0;
  v_svc_amt  NUMERIC := 0;
  v_disc     NUMERIC := 0;
  v_total    NUMERIC;
  v_cfg      RECORD;
  v_order    RECORD;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  SELECT vat_enabled, vat_percentage,
         receipt_show_service_fee, receipt_service_fee_pct
    INTO v_cfg
    FROM public.settings WHERE id = '1';

  -- Subtotal: active items only (void/cancel excluded).
  SELECT COALESCE(SUM(total_price), 0) INTO v_subtotal
    FROM public.order_items
   WHERE order_id = p_order_id
     AND kitchen_status NOT IN ('cancelled','voided');

  -- VAT (opt-in: p_apply_vat set by toggle; master switch = settings.vat_enabled;
  -- percentage from settings.vat_percentage).
  IF p_apply_vat AND COALESCE(v_cfg.vat_enabled, false) THEN
    v_vat_pct := COALESCE(v_cfg.vat_percentage, 0);
    v_vat_amt := ROUND(v_subtotal * v_vat_pct / 100, 2);
  END IF;

  -- Service charge (opt-in, R1: on SUBTOTAL — no tax-on-tax).
  IF p_apply_service AND COALESCE(v_cfg.receipt_show_service_fee, false) THEN
    v_svc_pct := COALESCE(v_cfg.receipt_service_fee_pct, 0);
    v_svc_amt := ROUND(v_subtotal * v_svc_pct / 100, 2);
  END IF;

  SELECT COALESCE(discount_amount, 0) INTO v_disc FROM public.orders WHERE id = p_order_id;

  v_total := v_subtotal + v_vat_amt + v_svc_amt - v_disc;
  IF v_total < 0 THEN v_total := 0; END IF;

  UPDATE public.orders SET
    total_amount          = v_total,
    tax_pct               = v_vat_pct,
    tax_amount            = v_vat_amt,
    service_charge_pct    = v_svc_pct,
    service_charge_amount = v_svc_amt,
    apply_vat             = p_apply_vat,
    version               = COALESCE(v_order.version, 0) + 1,
    updated_at            = NOW()
  WHERE id = p_order_id;

  RETURN jsonb_build_object(
    'success', true,
    'subtotal', v_subtotal,
    'tax_amount', v_vat_amt,
    'service_charge_amount', v_svc_amt,
    'discount_amount', v_disc,
    'total', v_total
  );
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- 4) D-9 — update_order_item_quantity: recompute total after qty change
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_order_item_quantity(
  p_order_item_id uuid,
  p_quantity      integer,
  p_unit_price    numeric
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_item RECORD;
  v_res  jsonb;
BEGIN
  SELECT * INTO v_item FROM order_items WHERE id = p_order_item_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_ITEM_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  UPDATE order_items
  SET
    quantity = p_quantity,
    total_price = p_unit_price * p_quantity,
    kitchen_status = 'pending'
  WHERE id = p_order_item_id;

  -- D-9: SSOT recompute (preserves the order's current vat/service flags).
  v_res := public.calculate_order_total_v3(
    v_item.order_id,
    (SELECT COALESCE(apply_vat, false) FROM public.orders WHERE id = v_item.order_id),
    (SELECT COALESCE(service_charge_pct, 0) > 0 FROM public.orders WHERE id = v_item.order_id)
  );

  RETURN jsonb_build_object('success', true,
    'order_item_id', p_order_item_id, 'quantity', p_quantity,
    'order_total', v_res->'total');
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- 5) void_order_item_atomic: SSOT recompute (keeps VAT/service/discount
--    consistent when an item leaves the subtotal)
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.void_order_item_atomic(
  p_order_item_id uuid,
  p_reason text DEFAULT 'void'::text,
  p_performed_by uuid DEFAULT NULL::uuid,
  p_performed_by_terminal_id text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_item RECORD;
  v_order RECORD;
  v_inv jsonb;
  v_res jsonb;
BEGIN
  PERFORM public.validate_actor(p_performed_by);
  SELECT * INTO v_item FROM public.order_items WHERE id = p_order_item_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order item not found');
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = v_item.order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;

  IF v_item.kitchen_status IN ('cancelled', 'voided') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Item already voided');
  END IF;

  v_inv := public._inventory_reverse_item(p_order_item_id, COALESCE(p_reason, 'void'), p_performed_by);

  UPDATE public.order_items SET
    kitchen_status = 'voided',
    updated_at = NOW()
  WHERE id = p_order_item_id;

  -- SSOT recompute (preserves current vat/service flags).
  v_res := public.calculate_order_total_v3(
    v_order.id,
    COALESCE(v_order.apply_vat, false),
    COALESCE(v_order.service_charge_pct, 0) > 0
  );

  UPDATE public.orders SET
    updated_by_terminal_id = p_performed_by_terminal_id
  WHERE id = v_order.id;

  INSERT INTO public.operation_logs (
    table_number, order_id, action, old_values, new_values, performed_by
  ) VALUES (
    v_order.table_number, v_order.id, 'void_order_item',
    jsonb_build_object('item_id', p_order_item_id, 'kitchen_status', v_item.kitchen_status, 'order_total', v_order.total_amount),
    jsonb_build_object('item_id', p_order_item_id, 'kitchen_status', 'voided', 'reason', p_reason, 'order_total', v_res->>'total'),
    p_performed_by
  );

  RETURN jsonb_build_object('success', true, 'new_order_total', v_res->>'total',
    'inventory', (v_inv->>'result'), 'inventory_reversed', (v_inv->>'reversed')::int);
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- 6) create_takeaway_order / create_delivery_order: SSOT total on create
--    (vat from settings.auto_apply_vat; service OFF = behavior-compatible)
-- ─────────────────────────────────────────────────────────────────────────
-- create_takeaway_order: replace the trailing plain total UPDATE with SSOT.
-- (Full body mirrored from live; only the tail changed.)
-- IMPORTANT: parameter DEFAULTS must be preserved (Postgres forbids removing
-- defaults on CREATE OR REPLACE — verified 2026-09-10, oid 37512).
CREATE OR REPLACE FUNCTION public.create_takeaway_order(
  p_customer_phone text DEFAULT NULL::text,
  p_customer_name  text DEFAULT NULL::text,
  p_customer_note  text DEFAULT NULL::text,
  p_estimated_pickup_time timestamptz DEFAULT NULL::timestamptz,
  p_items          jsonb DEFAULT '[]'::jsonb,
  p_performed_by   uuid DEFAULT NULL::uuid,
  p_location_id    uuid DEFAULT NULL::uuid,
  p_organization_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_order_id UUID;
  v_order_number TEXT;
  v_item JSONB;
  v_product_id UUID;
  v_quantity INTEGER;
  v_unit_price NUMERIC;
  v_cfg RECORD;
BEGIN
  IF p_customer_phone IS NULL OR trim(p_customer_phone) = '' THEN
    RAISE EXCEPTION 'customer_phone is required';
  END IF;
  IF p_location_id IS NULL OR p_organization_id IS NULL THEN
    RAISE EXCEPTION 'NO_LOCATION_CONTEXT' USING ERRCODE = 'P0001';
  END IF;

  v_order_number := generate_takeaway_order_number();

  INSERT INTO orders (
    order_number, order_type, order_source, status, kitchen_status,
    customer_phone, customer_name, customer_note,
    estimated_delivery_time, total_amount, guest_count,
    is_draft, version, created_at,
    location_id, organization_id
  ) VALUES (
    v_order_number, 'takeaway', 'takeaway', 'confirmed', 'pending',
    p_customer_phone, p_customer_name, p_customer_note,
    p_estimated_pickup_time, 0, 1,
    false, 1, now(),
    p_location_id, p_organization_id
  )
  RETURNING id INTO v_order_id;

  IF jsonb_array_length(p_items) > 0 THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
      IF (v_item->>'product_id') IS NULL OR trim(v_item->>'product_id') = '' THEN
        RAISE EXCEPTION 'product_id is required';
      END IF;
      BEGIN
        v_product_id := (v_item->>'product_id')::UUID;
      EXCEPTION
        WHEN invalid_text_representation THEN
          RAISE EXCEPTION 'invalid product_id format';
      END;
      IF (v_item->>'product_name') IS NULL OR trim(v_item->>'product_name') = '' THEN
        RAISE EXCEPTION 'product_name is required';
      END IF;
      v_quantity := COALESCE((v_item->>'quantity')::INTEGER, 1);
      IF v_quantity <= 0 THEN
        RAISE EXCEPTION 'quantity must be greater than 0';
      END IF;
      IF (v_item->>'unit_price') IS NULL THEN
        RAISE EXCEPTION 'unit_price is required';
      END IF;
      v_unit_price := (v_item->>'unit_price')::NUMERIC;
      IF v_unit_price < 0 THEN
        RAISE EXCEPTION 'unit_price must be a valid number >= 0';
      END IF;

      INSERT INTO order_items (
        order_id, product_id, product_name, quantity, unit_price, total_price,
        modifiers, special_notes, kitchen_status, seat_number
      ) VALUES (
        v_order_id,
        v_product_id,
        v_item->>'product_name',
        v_quantity,
        v_unit_price,
        v_unit_price * v_quantity,
        COALESCE(v_item->'modifiers', '[]'::JSONB),
        v_item->>'special_notes',
        'pending',
        NULL
      );
    END LOOP;
  END IF;

  -- SSOT total on create: vat per settings.auto_apply_vat, service OFF
  -- (behavior-compatible: today's takeaway total = items only).
  SELECT auto_apply_vat INTO v_cfg FROM public.settings WHERE id = '1';
  PERFORM public.calculate_order_total_v3(
    v_order_id,
    COALESCE(v_cfg.auto_apply_vat, false),
    false
  );

  PERFORM log_order_event(
    v_order_id, 'created',
    NULL,
    jsonb_build_object('order_number', v_order_number, 'source', 'takeaway'),
    NULL, p_performed_by, NULL, NULL, NULL
  );

  RETURN jsonb_build_object(
    'success', true,
    'order_id', v_order_id,
    'order_number', v_order_number
  );
END;
$$;

COMMIT;

-- ═════════════════════════════════════════════════════════════════════
-- Post-apply verification (manual):
--   SELECT * FROM settings WHERE id='1';  -- vat_* columns present
--   SELECT apply_vat, tax_amount, service_charge_amount FROM orders LIMIT 3;
--   SELECT public.calculate_order_total_v3(<paid-order>, true, true);
--     → subtotal/vat(18%)/service(5%)/total, then verify columns written.
-- ═════════════════════════════════════════════════════════════════════
