-- ============================================================================
-- GC (Wave A #3, 2026-09-20) — Gift Card vertical: repair + lifecycle + report
-- ----------------------------------------------------------------------------
-- CONTEXT (live evidence, see GC-1 inspect):
--   * gift_card_transactions + gift_card_ledger were DROPPED by the C-class
--     migration (20260914000006) — but the live RPCs gift_card_issue /
--     gift_card_redeem still INSERT into the dropped table → EVERY issue and
--     redeem call crashes with "relation does not exist" (prod defect).
--   * gift_card_redeem set status='depleted' on depletion — NOT a legal value
--     of the live CHECK constraint (active/used/expired/cancelled/blocked) →
--     a full-balance redeem would crash on the UPDATE even with the table.
--   * 'blocked' is a pre-defined legal status with NO writer; redeem's guard
--     (status='active') already enforces it.
--   * 'cancelled' has NO semantics anywhere (no writer, no ledger type) →
--     per ratified D3 (2026-09-20): BLOCK only, cancel NOT invented.
--
-- WHAT THIS MIGRATION DOES (additive + engine repair, single txn):
--   1. Recreates canonical gift_card_ledger (DDL = baseline 2026-09-14 verbatim
--      shape: id, gift_card_id FK CASCADE, type IN
--      issue/load/redeem/refund/adjustment/reversal, amount(12,2)>0,
--      balance_after(12,2), reference_type, reference_id, reason,
--      performed_by FK staff, correlation_id, idempotency_key (unique where
--      NOT NULL), created_at) + RLS ON + service_role full policy.
--   2. Rewrites gift_card_issue / gift_card_redeem to write into
--      gift_card_ledger (signatures + response shapes UNCHANGED — POS
--      contract preserved); redeem depletion now flips to legal 'used'.
--   3. Adds gift_card_block(p_code, p_unblock, p_reason, p_performed_by):
--      active→blocked (block) / blocked→active (unblock; expired→'expired'),
--      FOR UPDATE atomic, balance NEVER mutated, log_audit old→new status,
--      no-op-with-reject for any other state (used cards cannot be revived).
--   4. Adds read-only gift_card_summary() for the admin report strip.
--   FROZEN SURFACES TOUCHED: none. Route files unchanged; only DB-level
--   RPC bodies of the two already-broken functions are replaced.
--
-- ROLLBACK (manual, if ever needed): DROP FUNCTION gift_card_block,
-- gift_card_summary; restore old RPC bodies from
-- supabase/baseline_live_schema_2026-09-14.sql; DROP TABLE gift_card_ledger.
-- ============================================================================

BEGIN;

-- ── 1. canonical ledger table ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.gift_card_ledger (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    gift_card_id uuid NOT NULL,
    type character varying(30) NOT NULL,
    amount numeric(12,2) NOT NULL,
    balance_after numeric(12,2) NOT NULL,
    reference_type character varying(50),
    reference_id uuid,
    reason text,
    performed_by uuid,
    correlation_id uuid,
    idempotency_key text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT gift_card_ledger_pkey PRIMARY KEY (id),
    CONSTRAINT gift_card_ledger_amount_positive CHECK ((amount > (0)::numeric)),
    CONSTRAINT gift_card_ledger_type_check CHECK (((type)::text = ANY ((ARRAY['issue'::character varying, 'load'::character varying, 'redeem'::character varying, 'refund'::character varying, 'adjustment'::character varying, 'reversal'::character varying])::text[])))
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gift_card_ledger_gift_card_id_fkey') THEN
    ALTER TABLE ONLY public.gift_card_ledger
      ADD CONSTRAINT gift_card_ledger_gift_card_id_fkey
      FOREIGN KEY (gift_card_id) REFERENCES public.gift_cards(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gift_card_ledger_performed_by_fkey') THEN
    ALTER TABLE ONLY public.gift_card_ledger
      ADD CONSTRAINT gift_card_ledger_performed_by_fkey
      FOREIGN KEY (performed_by) REFERENCES public.staff(id);
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_gift_card_ledger_card
    ON public.gift_card_ledger USING btree (gift_card_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_gift_card_ledger_idempotency
    ON public.gift_card_ledger USING btree (idempotency_key)
    WHERE (idempotency_key IS NOT NULL);

COMMENT ON TABLE public.gift_card_ledger IS 'Gift card ledger per 0.1.15. Every balance change is a ledger entry.';

ALTER TABLE public.gift_card_ledger ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS service_full_gift_card_ledger ON public.gift_card_ledger;
CREATE POLICY service_full_gift_card_ledger ON public.gift_card_ledger
    TO service_role USING (true) WITH CHECK (true);
REVOKE ALL ON TABLE public.gift_card_ledger FROM anon, authenticated;

-- ── 2a. gift_card_issue — same signature, ledger write, dup-code guard ─────
CREATE OR REPLACE FUNCTION public.gift_card_issue(
  p_code text, p_initial_balance numeric, p_issued_to uuid DEFAULT NULL::uuid,
  p_issued_to_name text DEFAULT NULL::text, p_issued_by uuid DEFAULT NULL::uuid,
  p_expires_at timestamp with time zone DEFAULT NULL::timestamp with time zone
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  v_card RECORD;
  v_norm_code TEXT;
  v_performer_name TEXT;
BEGIN
  IF p_code IS NULL OR trim(p_code) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Card code required');
  END IF;
  IF p_initial_balance IS NULL OR p_initial_balance <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Balance must be positive');
  END IF;

  v_norm_code := UPPER(TRIM(p_code));

  IF EXISTS (SELECT 1 FROM public.gift_cards WHERE code = v_norm_code) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Card code already exists');
  END IF;

  IF p_issued_by IS NOT NULL THEN
    SELECT name INTO v_performer_name FROM public.staff WHERE id = p_issued_by;
  END IF;

  INSERT INTO public.gift_cards (code, initial_balance, current_balance, issued_to, issued_to_name, issued_by, expires_at)
  VALUES (v_norm_code, p_initial_balance, p_initial_balance, p_issued_to, p_issued_to_name, p_issued_by, p_expires_at)
  RETURNING * INTO v_card;

  INSERT INTO public.gift_card_ledger (gift_card_id, type, amount, balance_after, reason, performed_by)
  VALUES (v_card.id, 'issue', p_initial_balance, p_initial_balance, 'Hədiyyə kartı buraxıldı', p_issued_by);

  PERFORM public.log_audit(
    'gift_card_issue', 'gift_card', v_card.id::text,
    p_issued_by, v_performer_name,
    NULL,
    jsonb_build_object('code', v_norm_code, 'balance', p_initial_balance),
    jsonb_build_object('card_id', v_card.id),
    NULL
  );

  RETURN jsonb_build_object('success', true, 'card_id', v_card.id, 'code', v_norm_code, 'balance', p_initial_balance);
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.gift_card_issue(text, numeric, uuid, text, uuid, timestamp with time zone) TO service_role;
REVOKE ALL ON FUNCTION public.gift_card_issue(text, numeric, uuid, text, uuid, timestamp with time zone) FROM anon, authenticated;

-- ── 2b. gift_card_redeem — same signature, ledger write, legal 'used' ──────
CREATE OR REPLACE FUNCTION public.gift_card_redeem(
  p_code text, p_amount numeric, p_order_id uuid DEFAULT NULL::uuid,
  p_performed_by uuid DEFAULT NULL::uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  v_card RECORD;
  v_performer_name TEXT;
  v_new_balance NUMERIC;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Amount must be positive');
  END IF;

  SELECT * INTO v_card FROM public.gift_cards
  WHERE code = UPPER(TRIM(p_code)) AND status = 'active'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Gift card not found or inactive');
  END IF;

  IF v_card.expires_at IS NOT NULL AND v_card.expires_at < NOW() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Gift card expired');
  END IF;

  IF v_card.current_balance < p_amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient balance', 'balance', v_card.current_balance);
  END IF;

  v_new_balance := v_card.current_balance - p_amount;

  UPDATE public.gift_cards SET current_balance = v_new_balance, updated_at = NOW() WHERE id = v_card.id;

  INSERT INTO public.gift_card_ledger
    (gift_card_id, type, amount, balance_after, reference_type, reference_id, reason, performed_by)
  VALUES
    (v_card.id, 'redeem', p_amount, v_new_balance,
     CASE WHEN p_order_id IS NOT NULL THEN 'order' END, p_order_id,
     'Ödəniş üçün istifadə', p_performed_by);

  -- Auto-deactivate if depleted ('used' is the legal status per CHECK constraint)
  IF v_new_balance = 0 THEN
    UPDATE public.gift_cards SET status = 'used', updated_at = NOW() WHERE id = v_card.id;
  END IF;

  IF p_performed_by IS NOT NULL THEN
    SELECT name INTO v_performer_name FROM public.staff WHERE id = p_performed_by;
  END IF;

  PERFORM public.log_audit(
    'gift_card_redeem', 'gift_card', v_card.id::text,
    p_performed_by, v_performer_name,
    jsonb_build_object('balance', v_card.current_balance),
    jsonb_build_object('redeemed', p_amount, 'new_balance', v_new_balance, 'order_id', p_order_id),
    NULL,
    NULL
  );

  RETURN jsonb_build_object(
    'success', true,
    'card_id', v_card.id,
    'code', p_code,
    'redeemed', p_amount,
    'remaining_balance', v_new_balance
  );
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.gift_card_redeem(text, numeric, uuid, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.gift_card_redeem(text, numeric, uuid, uuid) FROM anon, authenticated;

-- ── 3. gift_card_block — lifecycle control (ratified D3, 2026-09-20) ───────
-- block:   active → blocked   (stops use, balance preserved)
-- unblock: blocked → active   (or 'expired' if expires_at passed)
-- Any other source state → rejected no-op. Balance is NEVER mutated here.
CREATE OR REPLACE FUNCTION public.gift_card_block(
  p_code text, p_unblock boolean DEFAULT false, p_reason text DEFAULT NULL,
  p_performed_by uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  v_card RECORD;
  v_new_status TEXT;
  v_performer_name TEXT;
BEGIN
  IF p_code IS NULL OR trim(p_code) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Card code required');
  END IF;

  SELECT * INTO v_card FROM public.gift_cards
  WHERE code = UPPER(TRIM(p_code))
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Gift card not found');
  END IF;

  IF p_unblock THEN
    IF v_card.status <> 'blocked' THEN
      RETURN jsonb_build_object('success', false, 'error', 'Card is not blocked', 'status', v_card.status);
    END IF;
    v_new_status := CASE
      WHEN v_card.expires_at IS NOT NULL AND v_card.expires_at < NOW() THEN 'expired'
      ELSE 'active'
    END;
  ELSE
    IF v_card.status <> 'active' THEN
      RETURN jsonb_build_object('success', false, 'error', 'Only active cards can be blocked', 'status', v_card.status);
    END IF;
    v_new_status := 'blocked';
  END IF;

  UPDATE public.gift_cards SET status = v_new_status, updated_at = NOW() WHERE id = v_card.id;

  IF p_performed_by IS NOT NULL THEN
    SELECT name INTO v_performer_name FROM public.staff WHERE id = p_performed_by;
  END IF;

  PERFORM public.log_audit(
    CASE WHEN p_unblock THEN 'gift_card_unblock' ELSE 'gift_card_block' END,
    'gift_card', v_card.id::text,
    p_performed_by, v_performer_name,
    jsonb_build_object('status', v_card.status, 'balance', v_card.current_balance),
    jsonb_build_object('status', v_new_status, 'reason', p_reason),
    jsonb_build_object('card_id', v_card.id),
    NULL
  );

  RETURN jsonb_build_object(
    'success', true,
    'card_id', v_card.id,
    'code', v_card.code,
    'status', v_new_status,
    'previous_status', v_card.status,
    'balance', v_card.current_balance
  );
END;
$fn$;

-- Supabase default privileges grant EXECUTE TO PUBLIC on new functions; the
-- vertical's frozen siblings (issue/redeem) carry NO public grant → match.
GRANT EXECUTE ON FUNCTION public.gift_card_block(text, boolean, text, uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.gift_card_block(text, boolean, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.gift_card_block(text, boolean, text, uuid) FROM anon, authenticated;

-- ── 4. gift_card_summary — read-only aggregates for the admin report strip ─
CREATE OR REPLACE FUNCTION public.gift_card_summary() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $fn$
  SELECT jsonb_build_object(
    'total_cards',    (SELECT count(*)::int FROM public.gift_cards),
    'active_count',   (SELECT count(*)::int FROM public.gift_cards WHERE status = 'active'),
    'active_balance', (SELECT COALESCE(round(sum(current_balance), 2), 0) FROM public.gift_cards WHERE status = 'active'),
    'by_status',      (SELECT COALESCE(jsonb_object_agg(s, c), '{}'::jsonb) FROM (SELECT status AS s, count(*)::int AS c FROM public.gift_cards GROUP BY status) x),
    'issued_30d',     (SELECT COALESCE(round(sum(amount), 2), 0) FROM public.gift_card_ledger WHERE type = 'issue'  AND created_at >= NOW() - interval '30 days'),
    'redeemed_30d',   (SELECT COALESCE(round(sum(amount), 2), 0) FROM public.gift_card_ledger WHERE type = 'redeem' AND created_at >= NOW() - interval '30 days')
  );
$fn$;

GRANT EXECUTE ON FUNCTION public.gift_card_summary() TO service_role;
REVOKE EXECUTE ON FUNCTION public.gift_card_summary() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.gift_card_summary() FROM anon, authenticated;

COMMIT;
