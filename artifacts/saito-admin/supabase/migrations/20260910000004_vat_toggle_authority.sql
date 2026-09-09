-- ═════════════════════════════════════════════════════════════════════
-- Migration 20260910000004  (1.5 fix)
-- VAT toggle = per-order authority. settings.vat_enabled = UI visibility only.
-- ═════════════════════════════════════════════════════════════════════
-- BUG (2026-09-10, live repro): engine gated VAT on settings.vat_enabled, so
-- when the master switch was off the POS toggle set apply_vat=true (persisted)
-- but VAT was always 0 → user saw "0 applied" + toggle "stays off".
--
-- DECISION (user Q1): the TOGGLE is the per-order authority. If it is ON, VAT
-- applies at settings.vat_percentage. settings.vat_enabled now only controls
-- whether the toggle is shown in the UI (a "VAT active at this restaurant"
-- master for POS/QR), NOT the calculation.
--
-- Only the engine's VAT gate changes. Service / subtotal / D-9 / void / create
-- are untouched. complete_payment_atomic_v2 (FROZEN) untouched.
-- ═════════════════════════════════════════════════════════════════════

BEGIN;

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

  SELECT vat_percentage, receipt_show_service_fee, receipt_service_fee_pct
    INTO v_cfg
    FROM public.settings WHERE id = '1';

  -- Subtotal: active items only (void/cancel excluded).
  SELECT COALESCE(SUM(total_price), 0) INTO v_subtotal
    FROM public.order_items
   WHERE order_id = p_order_id
     AND kitchen_status NOT IN ('cancelled','voided');

  -- VAT: the per-order toggle (p_apply_vat) is the authority.
  -- Percentage from settings.vat_percentage.
  IF p_apply_vat THEN
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

COMMIT;
