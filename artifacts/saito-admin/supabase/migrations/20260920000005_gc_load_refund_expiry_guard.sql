-- 20260920000005 — GC 1.5 fix: canonical lazy-expiry guard on load/refund
--
-- EVIDENCE (live prosrc, 2026-09-20): the frozen `gift_card_redeem` enforces
-- expiry LAZILY — `status='active'` in WHERE +
--   IF v_card.expires_at IS NOT NULL AND v_card.expires_at < NOW() → 'Gift card expired'
-- There is NO pg_cron expiry job; the status='expired' value in the CHECK
-- constraint is never written by any RPC. So "expired" canonically means
-- status='active' AND expires_at < now().
--
-- DEFECT (gate .gc2-gate.cjs L4/R4): the 20260920000002 gift_card_load /
-- gift_card_refund checked status only → a card past its expiry date could be
-- loaded (top-up revives a dead card) and refunded (used+expired card
-- resurrects to 'active' — balance then locked out by redeem's lazy guard,
-- i.e. money appears "added" but can never be spent).
--
-- FIX: mirror the frozen redeem guard in both new RPCs. Signatures, returns
-- and success-path behavior unchanged; only the expired rejection is added.
-- Frozen RPCs (redeem/issue/block) are NOT touched.

BEGIN;

CREATE OR REPLACE FUNCTION public.gift_card_load(
  p_code text, p_amount numeric, p_reason text DEFAULT NULL, p_performed_by uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_card RECORD;
  v_new_balance NUMERIC;
  v_performer_name TEXT;
BEGIN
  IF p_code IS NULL OR trim(p_code) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Card code required');
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Amount must be positive');
  END IF;

  SELECT * INTO v_card FROM public.gift_cards
  WHERE code = UPPER(TRIM(p_code)) FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Gift card not found');
  END IF;

  IF v_card.status <> 'active' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only active cards can be loaded', 'status', v_card.status);
  END IF;

  -- canonical expiry guard (mirrors frozen gift_card_redeem — lazy expiry, no cron)
  IF v_card.expires_at IS NOT NULL AND v_card.expires_at < NOW() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Gift card expired', 'status', v_card.status);
  END IF;

  v_new_balance := v_card.current_balance + p_amount;

  UPDATE public.gift_cards SET current_balance = v_new_balance, updated_at = NOW() WHERE id = v_card.id;

  INSERT INTO public.gift_card_ledger (gift_card_id, type, amount, balance_after, reason, performed_by)
  VALUES (v_card.id, 'load', p_amount, v_new_balance, COALESCE(p_reason, 'Balans yükləndi'), p_performed_by);

  IF p_performed_by IS NOT NULL THEN
    SELECT name INTO v_performer_name FROM public.staff WHERE id = p_performed_by;
  END IF;

  PERFORM public.log_audit(
    'gift_card_load', 'gift_card', v_card.id::text,
    p_performed_by, v_performer_name,
    jsonb_build_object('balance', v_card.current_balance),
    jsonb_build_object('loaded', p_amount, 'new_balance', v_new_balance, 'reason', p_reason),
    NULL,
    NULL
  );

  RETURN jsonb_build_object(
    'success', true,
    'card_id', v_card.id,
    'code', v_card.code,
    'balance', v_new_balance,
    'previous_balance', v_card.current_balance,
    'status', v_card.status
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.gift_card_refund(
  p_code text, p_amount numeric, p_reason text DEFAULT NULL, p_performed_by uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_card RECORD;
  v_new_balance NUMERIC;
  v_new_status TEXT;
  v_performer_name TEXT;
BEGIN
  IF p_code IS NULL OR trim(p_code) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Card code required');
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Amount must be positive');
  END IF;

  SELECT * INTO v_card FROM public.gift_cards
  WHERE code = UPPER(TRIM(p_code)) FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Gift card not found');
  END IF;

  IF v_card.status NOT IN ('active', 'used') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Card cannot receive a refund', 'status', v_card.status);
  END IF;

  -- canonical expiry guard (mirrors frozen gift_card_redeem — lazy expiry, no cron)
  IF v_card.expires_at IS NOT NULL AND v_card.expires_at < NOW() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Gift card expired', 'status', v_card.status);
  END IF;

  v_new_balance := v_card.current_balance + p_amount;
  v_new_status := CASE WHEN v_card.status = 'used' THEN 'active' ELSE 'active' END;

  UPDATE public.gift_cards
  SET current_balance = v_new_balance, status = v_new_status, updated_at = NOW()
  WHERE id = v_card.id;

  INSERT INTO public.gift_card_ledger (gift_card_id, type, amount, balance_after, reason, performed_by)
  VALUES (v_card.id, 'refund', p_amount, v_new_balance, COALESCE(p_reason, 'Qaytarma kart-ə'), p_performed_by);

  IF p_performed_by IS NOT NULL THEN
    SELECT name INTO v_performer_name FROM public.staff WHERE id = p_performed_by;
  END IF;

  PERFORM public.log_audit(
    'gift_card_refund', 'gift_card', v_card.id::text,
    p_performed_by, v_performer_name,
    jsonb_build_object('balance', v_card.current_balance, 'status', v_card.status),
    jsonb_build_object('refunded', p_amount, 'new_balance', v_new_balance, 'status', v_new_status, 'reason', p_reason),
    NULL,
    NULL
  );

  RETURN jsonb_build_object(
    'success', true,
    'card_id', v_card.id,
    'code', v_card.code,
    'balance', v_new_balance,
    'previous_balance', v_card.current_balance,
    'status', v_new_status,
    'previous_status', v_card.status
  );
END;
$$;

-- Supabase creates new functions EXECUTE TO PUBLIC by default — always revoke.
REVOKE EXECUTE ON FUNCTION public.gift_card_load(text, numeric, text, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.gift_card_refund(text, numeric, text, uuid) FROM PUBLIC;

COMMIT;
