-- ═════════════════════════════════════════════════════════════════════
-- Migration 20260910000005 — OS BUILD #1: CUSTOMER + LOYALTY SPINE
-- ═════════════════════════════════════════════════════════════════════
-- Design: MASTER_PRODUCT_MATRIX gap #5/#6 + spine diagram:
--   PAID (frozen engine) ─┬→ customer history (total_visits/total_spent)
--                         └→ loyalty_earn (idempotent)
--   REFUND (frozen engine) └→ loyalty_reverse (idempotent)
--
-- FROZEN contracts UNTOUCHED:
--   • complete_payment_atomic_v2, refund_with_inventory, state machines,
--     order_payments ledger, inventory chain — all unchanged.
--   • Binding is via a trigger on orders (status→paid/refunded) +
--     independent idempotent RPCs. Trigger failures are swallowed (notify)
--     so a loyalty bug can NEVER block money.
--
-- Rules (settings, editable in /admin/settings):
--   loyalty_enabled            t/f  (master switch, default f)
--   loyalty_points_per_manat   1    (1 manat = 1 point, default)
--   loyalty_point_value        0.01 (1 point = 0.01 manat redeem value)
--   loyalty_min_redeem         10   (min points to redeem)
-- ═════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. Settings columns ─────────────────────────────────────────────
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS loyalty_enabled         boolean DEFAULT false;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS loyalty_points_per_manat numeric DEFAULT 1.0;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS loyalty_point_value     numeric DEFAULT 0.01;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS loyalty_min_redeem      integer DEFAULT 10;

-- ── 2. Permission: loyalty.manage ───────────────────────────────────
INSERT INTO public.permissions (key, description)
VALUES ('loyalty.manage', 'Loyalty rules, redemption and account management')
ON CONFLICT (key) DO NOTHING;

-- Grant to roles that already hold refund.approve (manager+ tier).
INSERT INTO public.role_permissions (role_id, permission_key)
SELECT DISTINCT rp.role_id, 'loyalty.manage'
  FROM public.role_permissions rp
 WHERE rp.permission_key = 'refund.approve'
   AND NOT EXISTS (SELECT 1 FROM public.role_permissions x
                    WHERE x.role_id = rp.role_id AND x.permission_key = 'loyalty.manage');

-- ── 3. loyalty_ensure_account: find-or-create for a customer ────────
CREATE OR REPLACE FUNCTION public.loyalty_ensure_account(p_customer_id uuid)
RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE
  v_acct uuid;
  v_loc  uuid;
  v_org  uuid;
BEGIN
  IF p_customer_id IS NULL THEN RETURN NULL; END IF;

  SELECT id INTO v_acct FROM public.loyalty_accounts
   WHERE customer_id = p_customer_id
   ORDER BY created_at LIMIT 1;
  IF FOUND THEN RETURN v_acct; END IF;

  -- Inherit org/location from the customer's most recent order, else NULL.
  SELECT organization_id, location_id INTO v_org, v_loc
    FROM public.orders
   WHERE customer_id = p_customer_id
     AND organization_id IS NOT NULL
   ORDER BY created_at DESC LIMIT 1;

  INSERT INTO public.loyalty_accounts
    (customer_id, organization_id, location_id, points_balance, total_earned, total_redeemed, is_active)
  VALUES (p_customer_id, v_org, v_loc, 0, 0, 0, true)
  ON CONFLICT (customer_id, organization_id) DO UPDATE SET customer_id = EXCLUDED.customer_id
  RETURNING id INTO v_acct;
  IF NOT FOUND THEN
    SELECT id INTO v_acct FROM public.loyalty_accounts
     WHERE customer_id = p_customer_id ORDER BY created_at LIMIT 1;
  END IF;
  RETURN v_acct;
END;
$$;

-- ── 4. _loyalty_post: one idempotent ledger write ───────────────────
-- p_points can be negative (reversal). reference_type/idempotency make
-- it safe under retries and under trigger re-fire.
-- p_type must match loyalty_transactions_type_check: 'earn' | 'redeem' |
-- 'adjustment' | 'expire' | 'reversal'.
CREATE OR REPLACE FUNCTION public._loyalty_post(
  p_account_id      uuid,
  p_type            text,           -- 'earn' | 'redeem' | 'reversal' | 'adjustment'
  p_points          integer,
  p_reference_type  text,           -- 'order' | 'manual'
  p_reference_id    uuid,
  p_reason          text,
  p_performed_by    uuid,
  p_correlation_id  uuid,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
  v_acct      RECORD;
  v_newbal    integer;
  v_corr      uuid := COALESCE(p_correlation_id, gen_random_uuid());
  v_existing  uuid;
BEGIN
  IF p_account_id IS NULL THEN
    RETURN jsonb_build_object('success', true, 'result', 'skipped', 'reason', 'no_account');
  END IF;
  IF p_points = 0 THEN
    RETURN jsonb_build_object('success', true, 'result', 'skipped', 'reason', 'zero');
  END IF;

  SELECT * INTO v_acct FROM public.loyalty_accounts WHERE id = p_account_id FOR UPDATE;
  IF NOT FOUND OR COALESCE(v_acct.is_active, true) = false THEN
    RETURN jsonb_build_object('success', false, 'error', 'ACCOUNT_NOT_FOUND_OR_INACTIVE');
  END IF;

  -- Idempotency: same key → return prior row.
  SELECT id INTO v_existing FROM public.loyalty_transactions
   WHERE idempotency_key = p_idempotency_key LIMIT 1;
  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'result', 'idempotent_replay', 'transaction_id', v_existing);
  END IF;

  v_newbal := COALESCE(v_acct.points_balance, 0) + p_points;
  IF v_newbal < 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'NEGATIVE_BALANCE', 'attempted', v_newbal);
  END IF;

  INSERT INTO public.loyalty_transactions
    (account_id, type, points, balance_after, reference_type, reference_id,
     reason, performed_by, correlation_id, idempotency_key)
  VALUES (p_account_id, p_type, p_points, v_newbal, p_reference_type, p_reference_id,
          p_reason, p_performed_by, v_corr, p_idempotency_key);

  UPDATE public.loyalty_accounts SET
    points_balance = v_newbal,
    total_earned   = COALESCE(total_earned, 0)   + GREATEST(p_points, 0),
    total_redeemed = COALESCE(total_redeemed, 0) + GREATEST(-p_points, 0),
    updated_at     = NOW()
  WHERE id = p_account_id;

  PERFORM public.log_audit(
    'loyalty_' || p_type, 'loyalty_account', p_account_id::text,
    p_performed_by, NULL,
    jsonb_build_object('balance', v_acct.points_balance),
    jsonb_build_object('points', p_points, 'new_balance', v_newbal, 'reference_id', p_reference_id),
    jsonb_build_object('idempotency_key', p_idempotency_key, 'correlation_id', v_corr),
    NULL
  );

  PERFORM public.emit_outbox_event('loyalty', p_account_id, 'loyalty.points_changed',
    jsonb_build_object('account_id', p_account_id, 'type', p_type, 'points', p_points,
                       'balance_after', v_newbal, 'reference_type', p_reference_type, 'reference_id', p_reference_id),
    jsonb_build_object('correlation_id', v_corr));

  RETURN jsonb_build_object('success', true, 'result', 'posted',
                            'points', p_points, 'balance_after', v_newbal, 'correlation_id', v_corr);
END;
$$;

-- ── 5. loyalty_earn: spend-based earn for an order ──────────────────
-- points = floor(net_paid * points_per_manat); net_paid = paid_amount - refund_amount.
CREATE OR REPLACE FUNCTION public.loyalty_earn(
  p_order_id       uuid,
  p_performed_by   uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
  v_order  RECORD;
  v_cfg    RECORD;
  v_acct   uuid;
  v_points integer;
  v_net    numeric;
  v_key    text;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'ORDER_NOT_FOUND');
  END IF;

  SELECT * INTO v_cfg FROM public.settings WHERE id = '1';
  IF NOT FOUND OR COALESCE(v_cfg.loyalty_enabled, false) = false THEN
    RETURN jsonb_build_object('success', true, 'result', 'skipped', 'reason', 'loyalty_disabled');
  END IF;
  IF v_order.customer_id IS NULL THEN
    RETURN jsonb_build_object('success', true, 'result', 'skipped', 'reason', 'no_customer');
  END IF;

  v_net := COALESCE(v_order.paid_amount, 0) - COALESCE(v_order.refund_amount, 0);
  IF v_net <= 0 THEN
    RETURN jsonb_build_object('success', true, 'result', 'skipped', 'reason', 'nothing_paid');
  END IF;

  v_points := floor(v_net * COALESCE(v_cfg.loyalty_points_per_manat, 1));
  IF v_points <= 0 THEN
    RETURN jsonb_build_object('success', true, 'result', 'skipped', 'reason', 'sub_point');
  END IF;

  v_acct := public.loyalty_ensure_account(v_order.customer_id);
  v_key  := 'earn:' || p_order_id::text;

  RETURN public._loyalty_post(v_acct, 'earn', v_points, 'order', p_order_id,
    'Spend-based earn on order', p_performed_by, NULL, v_key);
END;
$$;

-- ── 6. loyalty_reverse: undo the earn of an order (on refund) ───────
CREATE OR REPLACE FUNCTION public.loyalty_reverse(
  p_order_id       uuid,
  p_reason         text DEFAULT 'refund',
  p_performed_by   uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
  v_order RECORD;
  v_pts   integer;
  v_acct  uuid;
  v_key   text;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'ORDER_NOT_FOUND');
  END IF;
  IF v_order.customer_id IS NULL THEN
    RETURN jsonb_build_object('success', true, 'result', 'skipped', 'reason', 'no_customer');
  END IF;

  SELECT COALESCE(MAX(points), 0) INTO v_pts
    FROM public.loyalty_transactions
   WHERE reference_type = 'order' AND reference_id = p_order_id AND type = 'earn';
  IF COALESCE(v_pts, 0) <= 0 THEN
    RETURN jsonb_build_object('success', true, 'result', 'skipped', 'reason', 'nothing_earned');
  END IF;

  v_acct := public.loyalty_ensure_account(v_order.customer_id);
  v_key  := 'reverse:' || p_order_id::text;

  -- NOTE: ledger CHECK constraint allows 'reversal' (not 'reverse').
  RETURN public._loyalty_post(v_acct, 'reversal', -v_pts, 'order', p_order_id,
    COALESCE(p_reason, 'refund'), p_performed_by, NULL, v_key);
END;
$$;

-- ── 7. loyalty_redeem: points → money discount on an order ──────────
-- Converts points at loyalty_point_value, applies discount_amount to the
-- order (server-side, audited). Idempotent per order (one redeem per order).
CREATE OR REPLACE FUNCTION public.loyalty_redeem(
  p_order_id       uuid,
  p_points         integer,
  p_performed_by   uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
  v_order  RECORD;
  v_cfg    RECORD;
  v_acct   uuid;
  v_value  numeric;
  v_key    text;
  v_post   jsonb;
  v_total  jsonb;
BEGIN
  IF p_points IS NULL OR p_points <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'POINTS_REQUIRED');
  END IF;

  SELECT * INTO v_cfg FROM public.settings WHERE id = '1';
  IF NOT FOUND OR COALESCE(v_cfg.loyalty_enabled, false) = false THEN
    RETURN jsonb_build_object('success', false, 'error', 'LOYALTY_DISABLED');
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'ORDER_NOT_FOUND');
  END IF;
  IF v_order.customer_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'NO_CUSTOMER_ATTACHED');
  END IF;
  IF COALESCE(v_order.status, '') IN ('paid','closed','cancelled','voided','refunded') THEN
    RETURN jsonb_build_object('success', false, 'error', 'ORDER_NOT_OPEN');
  END IF;
  IF v_order.discount_amount > 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'ALREADY_HAS_DISCOUNT');
  END IF;

  v_acct := public.loyalty_ensure_account(v_order.customer_id);
  IF v_acct IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'NO_LOYALTY_ACCOUNT');
  END IF;

  IF p_points > COALESCE((SELECT points_balance FROM public.loyalty_accounts WHERE id = v_acct), 0) THEN
    RETURN jsonb_build_object('success', false, 'error', 'INSUFFICIENT_POINTS',
                              'balance', (SELECT points_balance FROM public.loyalty_accounts WHERE id = v_acct));
  END IF;
  IF p_points < COALESCE(v_cfg.loyalty_min_redeem, 10) THEN
    RETURN jsonb_build_object('success', false, 'error', 'BELOW_MINIMUM',
                              'min', COALESCE(v_cfg.loyalty_min_redeem, 10));
  END IF;

  v_value  := ROUND(p_points * COALESCE(v_cfg.loyalty_point_value, 0.01), 2);
  IF v_value > COALESCE(v_order.total_amount, 0) THEN
    RETURN jsonb_build_object('success', false, 'error', 'EXCEEDS_ORDER_TOTAL', 'value', v_value);
  END IF;

  v_key := 'redeem:' || p_order_id::text;
  v_post := public._loyalty_post(v_acct, 'redeem', -p_points, 'order', p_order_id,
    'Redeemed as discount', p_performed_by, NULL, v_key);
  IF (v_post->>'result') = 'idempotent_replay' THEN
    RETURN v_post;
  END IF;
  IF COALESCE((v_post->>'success')::boolean, false) = false THEN
    RETURN v_post;
  END IF;

  -- Apply discount to order + SSOT total recompute (preserves vat flags).
  UPDATE public.orders SET
    discount_amount = v_value,
    discount_type   = 'loyalty',
    updated_at      = NOW()
  WHERE id = p_order_id;

  v_total := public.calculate_order_total_v3(
    p_order_id,
    COALESCE(v_order.apply_vat, false),
    COALESCE(v_order.service_charge_pct, 0) > 0
  );

  RETURN jsonb_build_object('success', true, 'result', 'redeemed',
    'points', -p_points, 'discount_value', v_value,
    'new_total', v_total->>'total', 'post', v_post);
END;
$$;

-- ── 8. Order spine trigger: paid → earn (+customer stats); refunded → reverse ─
-- Fire-and-forget on purpose: loyalty must NEVER block money. All failures
-- are logged to notify() and swallowed; idempotency makes retries safe.
CREATE OR REPLACE FUNCTION public._trg_order_loyalty_spine()
RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_res jsonb;
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'paid' AND OLD.status IS DISTINCT FROM 'paid' THEN
    BEGIN
      v_res := public.loyalty_earn(NEW.id, NULL);
      RAISE NOTICE 'loyalty_spine earn(%): %', NEW.id, COALESCE(v_res->>'result', v_res->>'error');
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'loyalty_spine earn failed for %: %', NEW.id, SQLERRM;
    END;

    -- Customer visit history (best-effort).
    BEGIN
      IF NEW.customer_id IS NOT NULL THEN
        UPDATE public.customers SET
          total_visits  = COALESCE(total_visits, 0) + 1,
          total_spent   = COALESCE(total_spent, 0) + COALESCE(NEW.paid_amount, 0) - COALESCE(NEW.discount_amount, 0),
          last_order_at = NOW()
        WHERE id = NEW.customer_id;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'loyalty_spine customer stats failed: %', SQLERRM;
    END;
  END IF;

  IF NEW.status IN ('refunded','partially_refunded')
     AND OLD.status NOT IN ('refunded','partially_refunded') THEN
    BEGIN
      v_res := public.loyalty_reverse(NEW.id, 'refund', NULL);
      RAISE NOTICE 'loyalty_spine reverse(%): %', NEW.id, COALESCE(v_res->>'result', v_res->>'error');
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'loyalty_spine reverse failed for %: %', NEW.id, SQLERRM;
    END;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_order_loyalty_spine ON public.orders;
CREATE TRIGGER trg_order_loyalty_spine
  AFTER UPDATE ON public.orders
  FOR EACH ROW
  WHEN (NEW.status IS DISTINCT FROM OLD.status)
  EXECUTE FUNCTION public._trg_order_loyalty_spine();

-- ── 9. B-1 (metadata): →paid transitions require payments.create ────
-- Registry permission is metadata (API layer enforces requirePermission);
-- fix keeps documentation and any future enforcement correct.
UPDATE public.state_transitions
   SET requires_permission = 'payments.create',
       description = REPLACE(COALESCE(description, ''), '[B-1 fix: payment creation, not void]', '') || ' [B-1 fix: payment creation, not void]'
 WHERE entity = 'order' AND to_status = 'paid'
   AND requires_permission IN ('payments.void','orders.edit');

-- ── 10. Grants (service role path is supabase-js service key; keep EXECUTE default) ──
COMMIT;

-- ═════════════════════════════════════════════════════════════════════
-- Post-apply verification (manual, NOT part of migration):
--   1) settings.loyalty_enabled = true
--   2) order w/ customer → pay → loyalty_earn auto (trigger), points = floor(net)
--   3) pay same order again → idempotent_replay (no double earn)
--   4) refund_with_inventory → trigger reverse → points back
--   5) loyalty_redeem on open order → discount applied, total via v3
--   6) customer total_visits/total_spent incremented once
-- ═════════════════════════════════════════════════════════════════════
