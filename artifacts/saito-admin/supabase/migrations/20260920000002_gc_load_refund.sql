-- ============================================================================
-- GC 1.5 (2026-09-20) — gift card reload + refund-to-card (map §8 scope:
-- "balance, reload, redeem (partial), expiration, refund to card").
-- The ledger types 'load'/'refund' have existed since the canonical 0.1.15
-- DDL (type CHECK) — this migration gives them their writers.
--
-- SEMANTICS (derived from the frozen block/redeem engine, ratified D3):
--   gift_card_load:    top-up a LIVE card. 'active' ONLY (a spent card being
--                      topped up is a refund — different audit intent).
--                      blocked/expired rejected. Balance += amount.
--   gift_card_refund:  money returned TO the card (e.g. order refund).
--                      'active' and 'used' allowed — a 'used' card is
--                      resurrected to 'active' (that IS the point of a
--                      card refund). blocked/expired rejected (no balance
--                      can enter a frozen or dead card).
--   Both: FOR UPDATE atomic, ledger entry (balance_after chain), log_audit,
--   balance_after invariant preserved, EXECUTE service_role only
--   (Supabase default PUBLIC execute revoked — GC-wave quirk (b)).
-- ============================================================================

BEGIN;

-- ── gift_card_load ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.gift_card_load(
  p_code text, p_amount numeric, p_reason text DEFAULT NULL,
  p_performed_by uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
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
$fn$;

GRANT EXECUTE ON FUNCTION public.gift_card_load(text, numeric, text, uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.gift_card_load(text, numeric, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.gift_card_load(text, numeric, text, uuid) FROM anon, authenticated;

-- ── gift_card_refund ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.gift_card_refund(
  p_code text, p_amount numeric, p_reason text DEFAULT NULL,
  p_performed_by uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
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

  v_new_balance := v_card.current_balance + p_amount;
  -- both allowed source states converge to 'active' (used card resurrects)
  v_new_status := 'active';

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
$fn$;

GRANT EXECUTE ON FUNCTION public.gift_card_refund(text, numeric, text, uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.gift_card_refund(text, numeric, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.gift_card_refund(text, numeric, text, uuid) FROM anon, authenticated;

COMMIT;
