-- 20260921000002 — Quick-fix 4: coupon validation + auto-apply fix
--
-- EVIDENCE (live, 2026-09-21):
--   * get_best_cart_campaign (v1, 3-arg) AUTO-APPLIES every active campaign —
--     including ones with requires_coupon=true. A campaign that says "code
--     required" must NEVER apply without the code. (bug, this migration)
--   * No coupon validation path existed (campaigns.coupon_code column exists,
--     /api/campaigns writes it, but nothing ever checks a code against a cart).
--
-- THIS MIGRATION:
--   1) validate_coupon(p_code, p_cart_items, p_order_amount, p_table_number,
--      p_dining_type) — finds the active coupon campaign matching the code,
--      computes the discount with the existing calculate_cart_campaign_discount
--      engine, enforces min_order_amount / table / dining_type windows.
--   2) get_best_cart_campaign v2 (4-arg overload) — identical ranking, but
--      SKIPS requires_coupon campaigns (they only apply via validate_coupon).
--      The old 3-arg function is left untouched (no caller in the codebase;
--      kept for rollback safety).
--
-- Grants: service_role ONLY (same pattern as suggest_addons_v2).

BEGIN;

-- ─── 1) validate_coupon ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.validate_coupon(
  p_code        text,
  p_cart_items  jsonb,
  p_order_amount numeric,
  p_table_number integer DEFAULT NULL,
  p_dining_type text DEFAULT 'dine_in'
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $fn$
DECLARE
  v_campaign campaigns%ROWTYPE;
  v_result   jsonb;
  v_amt      numeric;
BEGIN
  IF p_code IS NULL OR btrim(p_code) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'CODE_REQUIRED');
  END IF;
  IF p_cart_items IS NULL OR jsonb_array_length(p_cart_items) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'EMPTY_CART');
  END IF;

  -- One active, dated, coupon-required campaign per code.
  SELECT * INTO v_campaign
    FROM campaigns
   WHERE requires_coupon = true
     AND coupon_code IS NOT NULL
     AND upper(btrim(coupon_code)) = upper(btrim(p_code))
     AND status = 'active'
     AND is_active = true
     AND deleted_at IS NULL
     AND (start_date IS NULL OR start_date <= CURRENT_DATE)
     AND (end_date   IS NULL OR end_date   >= CURRENT_DATE)
     AND (start_time IS NULL OR start_time <= to_char(now(), 'HH24:MI'))
     AND (end_time   IS NULL OR end_time   >= to_char(now(), 'HH24:MI'))
   ORDER BY priority DESC, created_at DESC
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'COUPON_NOT_FOUND');
  END IF;

  -- Dining type window (null = all).
  IF v_campaign.dining_type IS NOT NULL
     AND v_campaign.dining_type <> p_dining_type THEN
    RETURN jsonb_build_object('ok', false, 'error', 'DINING_TYPE_MISMATCH');
  END IF;

  -- Table window (applicable_tables: int[]; null = all tables).
  IF v_campaign.applicable_tables IS NOT NULL
     AND (p_table_number IS NULL OR NOT (p_table_number = ANY(v_campaign.applicable_tables))) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'TABLE_NOT_APPLICABLE');
  END IF;

  -- Min order amount.
  IF v_campaign.min_order_amount IS NOT NULL
     AND coalesce(p_order_amount, 0) < v_campaign.min_order_amount THEN
    RETURN jsonb_build_object('ok', false, 'error', 'MIN_ORDER_NOT_MET',
                              'min_order_amount', v_campaign.min_order_amount);
  END IF;

  SELECT public.calculate_cart_campaign_discount(v_campaign.id, p_cart_items)
    INTO v_result;

  v_amt := coalesce((v_result->>'discount_amount')::numeric, 0);
  IF v_amt <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'NOT_APPLICABLE');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'campaign_id',    v_campaign.id,
    'name',           coalesce(v_campaign.title, v_campaign.name),
    'type',           v_campaign.type,
    'discount_amount', v_amt,
    'message',        coalesce(v_result->>'message', '')
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.validate_coupon(text, jsonb, numeric, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validate_coupon(text, jsonb, numeric, integer, text) TO service_role;

-- ─── 2) get_best_cart_campaign v2 — auto-apply must skip coupon campaigns ──
-- Same ranking as v1 (priority desc, best discount wins), PLUS:
--   AND NOT coalesce(requires_coupon, false)
CREATE OR REPLACE FUNCTION public.get_best_cart_campaign_v2(
  p_cart_items   jsonb,
  p_customer_id  uuid,
  p_order_amount numeric
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_campaign RECORD;
  v_best_campaign_id UUID := NULL;
  v_best_discount NUMERIC := 0;
  v_calc_result JSONB;
  v_now DATE := CURRENT_DATE;
  v_now_time TEXT := TO_CHAR(NOW(), 'HH24:MI');
BEGIN
  IF p_cart_items IS NULL OR jsonb_array_length(p_cart_items) = 0 THEN
    RETURN jsonb_build_object('campaign_id', NULL, 'discount_amount', 0);
  END IF;

  FOR v_campaign IN
    SELECT * FROM campaigns
     WHERE status = 'active'
       AND is_active = true
       AND deleted_at IS NULL
       AND NOT coalesce(requires_coupon, false)   -- ← v2: coupons never auto-apply
       AND (start_date IS NULL OR start_date <= v_now)
       AND (end_date   IS NULL OR end_date   >= v_now)
       AND (start_time IS NULL OR start_time <= v_now_time)
       AND (end_time   IS NULL OR end_time   >= v_now_time)
     ORDER BY priority DESC, created_at DESC
  LOOP
    IF v_campaign.type IN ('PERCENTAGE','HAPPY_HOUR','FIXED_AMOUNT','BOGO','BUY2GET1') THEN
      SELECT calculate_cart_campaign_discount(v_campaign.id, p_cart_items) INTO v_calc_result;
      IF coalesce((v_calc_result->>'discount_amount')::NUMERIC, 0) > v_best_discount THEN
        v_best_discount := (v_calc_result->>'discount_amount')::NUMERIC;
        v_best_campaign_id := v_campaign.id;
      END IF;
    END IF;
  END LOOP;

  IF v_best_campaign_id IS NULL THEN
    RETURN jsonb_build_object('campaign_id', NULL, 'discount_amount', 0);
  END IF;
  RETURN jsonb_build_object('campaign_id', v_best_campaign_id, 'discount_amount', v_best_discount);
END;
$fn$;

REVOKE ALL ON FUNCTION public.get_best_cart_campaign_v2(jsonb, uuid, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_best_cart_campaign_v2(jsonb, uuid, numeric) TO service_role;

COMMIT;
