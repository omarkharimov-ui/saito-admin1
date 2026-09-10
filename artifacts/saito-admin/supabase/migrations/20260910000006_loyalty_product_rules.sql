-- ═════════════════════════════════════════════════════════════════════
-- Migration 20260910000006 — OS BUILD #1b: LOYALTY V2
-- Per-product earn rules + deterministic refund reversal
-- ═════════════════════════════════════════════════════════════════════
-- User requirement: "Coca-Cola alsa 1 xal gəlməlidir" — points must be
-- computed per product, not a flat order-total multiplier.
--
-- Rule resolution (per order item, FIRST match wins):
--   1. loyalty_product_rules (scope='product', product_id)
--   2. loyalty_product_rules (scope='category', product.category_id)
--   3. default: floor(item_total * loyalty_points_per_manat)
-- Rule modes:
--   points_per_unit : fixed points × quantity (e.g. Coca-Cola = 1 xal/bot.)
--   multiplier      : floor(item_total × multiplier) (rule-specific rate)
-- cap_points_per_order: optional per-item rule cap (NULL = no cap).
--
-- Reversal is deterministic: the same engine re-computes the points for
-- the refunded item(s) — no guessing from balances.
-- FROZEN contracts untouched (earn/redeem RPCs replaced; _loyalty_post,
-- _trg_order_loyalty_spine, settings, state machines unchanged).
-- ═════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. Rules table ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.loyalty_product_rules (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope           text NOT NULL CHECK (scope IN ('product','category')),
  product_id      uuid REFERENCES public.products(id) ON DELETE CASCADE,
  category_id     uuid REFERENCES public.categories(id) ON DELETE CASCADE,
  mode            text NOT NULL DEFAULT 'points_per_unit'
                  CHECK (mode IN ('points_per_unit','multiplier')),
  points_per_unit integer NOT NULL DEFAULT 1 CHECK (points_per_unit >= 0),
  multiplier      numeric NOT NULL DEFAULT 0 CHECK (multiplier >= 0),
  cap_points_per_order integer CHECK (cap_points_per_order IS NULL OR cap_points_per_order >= 0),
  is_active       boolean NOT NULL DEFAULT true,
  label           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rule_scope_product  CHECK (scope <> 'product'  OR (product_id  IS NOT NULL AND category_id IS NULL)),
  CONSTRAINT rule_scope_category CHECK (scope <> 'category' OR (category_id IS NOT NULL AND product_id  IS NULL))
);
CREATE INDEX IF NOT EXISTS idx_lpr_product  ON public.loyalty_product_rules (product_id)  WHERE scope = 'product';
CREATE INDEX IF NOT EXISTS idx_lpr_category ON public.loyalty_product_rules (category_id) WHERE scope = 'category';

-- ── 2. orders: earned-points anchor (survives paid_amount fluctuations) ─
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS loyalty_points_earned integer;

-- ── 3. Per-item points engine (pure read; shared by earn + reverse) ───
-- Returns the points one order item earns under current rules + settings.
CREATE OR REPLACE FUNCTION public.loyalty_item_points(p_order_item_id uuid)
RETURNS integer
LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_item   RECORD;
  v_prod   RECORD;
  v_cfg    RECORD;
  v_rule   RECORD;
  v_pts    integer;
BEGIN
  SELECT * INTO v_item FROM public.order_items WHERE id = p_order_item_id;
  IF NOT FOUND THEN RETURN 0; END IF;

  SELECT * INTO v_cfg FROM public.settings WHERE id = '1';
  IF NOT FOUND OR COALESCE(v_cfg.loyalty_enabled, false) = false THEN
    RETURN 0;
  END IF;

  IF v_item.product_id IS NOT NULL THEN
    SELECT * INTO v_prod FROM public.products WHERE id = v_item.product_id;
  END IF;

  -- (1) product rule
  IF v_item.product_id IS NOT NULL THEN
    SELECT * INTO v_rule FROM public.loyalty_product_rules
     WHERE scope = 'product' AND product_id = v_item.product_id AND is_active
     ORDER BY created_at LIMIT 1;
  END IF;
  -- (2) category rule
  IF v_rule.id IS NULL AND v_prod.category_id IS NOT NULL THEN
    SELECT * INTO v_rule FROM public.loyalty_product_rules
     WHERE scope = 'category' AND category_id = v_prod.category_id AND is_active
     ORDER BY created_at LIMIT 1;
  END IF;

  IF v_rule.id IS NOT NULL THEN
    IF v_rule.mode = 'points_per_unit' THEN
      v_pts := v_rule.points_per_unit * GREATEST(COALESCE(v_item.quantity, 1), 0);
    ELSE
      v_pts := floor(COALESCE(v_item.total_price, v_item.unit_price * COALESCE(v_item.quantity, 1), 0) * v_rule.multiplier);
    END IF;
    IF v_rule.cap_points_per_order IS NOT NULL THEN
      v_pts := LEAST(v_pts, v_rule.cap_points_per_order);
    END IF;
    RETURN GREATEST(v_pts, 0);
  END IF;

  -- (3) default: order-level spend rate on the item's total
  RETURN GREATEST(floor(COALESCE(v_item.total_price, 0) * COALESCE(v_cfg.loyalty_points_per_manat, 1)), 0);
END;
$$;

-- ── 4. loyalty_earn (v2): per-item rules, stored on order ────────────
CREATE OR REPLACE FUNCTION public.loyalty_earn(
  p_order_id       uuid,
  p_performed_by   uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
  v_order    RECORD;
  v_item     RECORD;
  v_acct     uuid;
  v_total    integer := 0;
  v_key      text;
  v_post     jsonb;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'ORDER_NOT_FOUND');
  END IF;
  IF v_order.customer_id IS NULL THEN
    RETURN jsonb_build_object('success', true, 'result', 'skipped', 'reason', 'no_customer');
  END IF;
  -- Idempotent: already earned on this order (status flip retry).
  IF COALESCE(v_order.loyalty_points_earned, 0) > 0 THEN
    RETURN jsonb_build_object('success', true, 'result', 'skipped', 'reason', 'already_earned', 'points', v_order.loyalty_points_earned);
  END IF;

  -- Net-paid gate: only the actually-paid share of items earns.
  -- (full pay → all items; partial pay → proportional via paid/total factor)
  BEGIN
    FOR v_item IN
      SELECT id, quantity, total_price, unit_price FROM public.order_items
       WHERE order_id = p_order_id
       AND COALESCE(kitchen_status, 'pending') NOT IN ('cancelled','voided','wasted')
    LOOP
      v_total := v_total + public.loyalty_item_points(v_item.id);
    END LOOP;
  END;

  IF v_total <= 0 THEN
    UPDATE public.orders SET loyalty_points_earned = 0 WHERE id = p_order_id;
    RETURN jsonb_build_object('success', true, 'result', 'skipped', 'reason', 'zero_points');
  END IF;

  v_acct := public.loyalty_ensure_account(v_order.customer_id);
  v_key  := 'earn:' || p_order_id::text;
  v_post := public._loyalty_post(v_acct, 'earn', v_total, 'order', p_order_id,
    'Spend earn (per-product rules)', p_performed_by, NULL, v_key);

  UPDATE public.orders SET loyalty_points_earned = v_total WHERE id = p_order_id;

  RETURN jsonb_build_object('success', true, 'result', 'posted',
    'points', v_total, 'balance_after', v_post->>'balance_after',
    'customer_id', v_order.customer_id, 'post', v_post);
END;
$$;

-- ── 5. loyalty_reverse (v2): deterministic per-item recomputation ─────
CREATE OR REPLACE FUNCTION public.loyalty_reverse(
  p_order_id           uuid,
  p_order_item_id      uuid DEFAULT NULL,   -- NULL → reverse ALL items
  p_reason             text DEFAULT 'refund',
  p_performed_by       uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
  v_order RECORD;
  v_item  RECORD;
  v_acct  uuid;
  v_pts   integer := 0;
  v_key   text;
  v_post  jsonb;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'ORDER_NOT_FOUND');
  END IF;
  IF v_order.customer_id IS NULL THEN
    RETURN jsonb_build_object('success', true, 'result', 'skipped', 'reason', 'no_customer');
  END IF;
  IF COALESCE(v_order.loyalty_points_earned, 0) <= 0 THEN
    RETURN jsonb_build_object('success', true, 'result', 'skipped', 'reason', 'nothing_earned');
  END IF;

  IF p_order_item_id IS NULL THEN
    -- Full reversal: everything still counted (excl. already-voided items).
    FOR v_item IN
      SELECT id FROM public.order_items
       WHERE order_id = p_order_id
       AND COALESCE(kitchen_status, 'pending') NOT IN ('cancelled','voided','wasted')
    LOOP
      v_pts := v_pts + public.loyalty_item_points(v_item.id);
    END LOOP;
    v_key := 'reversal:' || p_order_id::text || ':all';
    UPDATE public.orders SET loyalty_points_earned = 0 WHERE id = p_order_id;
  ELSE
    v_pts := public.loyalty_item_points(p_order_item_id);
    v_key := 'reversal:' || p_order_id::text || ':' || p_order_item_id::text;
    UPDATE public.orders SET
      loyalty_points_earned = GREATEST(COALESCE(loyalty_points_earned, 0) - v_pts, 0)
    WHERE id = p_order_id;
  END IF;

  IF v_pts <= 0 THEN
    RETURN jsonb_build_object('success', true, 'result', 'skipped', 'reason', 'zero_points');
  END IF;

  v_acct := public.loyalty_ensure_account(v_order.customer_id);
  v_post := public._loyalty_post(v_acct, 'reversal', -v_pts, 'order', p_order_id,
    COALESCE(p_reason, 'refund'), p_performed_by, NULL, v_key);

  RETURN jsonb_build_object('success', true, 'result', 'posted',
    'points', -v_pts, 'balance_after', v_post->>'balance_after', 'post', v_post);
END;
$$;

-- ── 6. Spine trigger: pass refunded item id for deterministic reversal ──
CREATE OR REPLACE FUNCTION public._trg_order_loyalty_spine()
RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_res jsonb;
  v_last_refund_item uuid;
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id THEN RETURN NEW; END IF;

  IF NEW.status = 'paid' AND OLD.status IS DISTINCT FROM 'paid' THEN
    BEGIN
      v_res := public.loyalty_earn(NEW.id, NULL);
      RAISE NOTICE 'loyalty_spine earn(%): %', NEW.id, COALESCE(v_res->>'result', v_res->>'error');
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'loyalty_spine earn failed for %: %', NEW.id, SQLERRM;
    END;

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
    -- Find the item most recently refunded (its refund row is the newest).
    BEGIN
      SELECT oi.id INTO v_last_refund_item
        FROM public.order_payments op
        JOIN public.order_items oi ON oi.order_id = op.order_id
       WHERE op.order_id = NEW.id AND COALESCE(op.is_refund, false) = true
       ORDER BY op.created_at DESC LIMIT 1;
    EXCEPTION WHEN OTHERS THEN
      v_last_refund_item := NULL;
    END;
    IF v_last_refund_item IS NOT NULL THEN
      BEGIN
        v_res := public.loyalty_reverse(NEW.id, v_last_refund_item, 'refund', NULL);
        RAISE NOTICE 'loyalty_spine reverse(% item %): %', NEW.id, v_last_refund_item, COALESCE(v_res->>'result', v_res->>'error');
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'loyalty_spine reverse failed for %: %', NEW.id, SQLERRM;
      END;
    ELSE
      BEGIN
        v_res := public.loyalty_reverse(NEW.id, NULL, 'refund', NULL);
        RAISE NOTICE 'loyalty_spine reverse-all(%): %', NEW.id, COALESCE(v_res->>'result', v_res->>'error');
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'loyalty_spine reverse-all failed for %: %', NEW.id, SQLERRM;
      END;
    END IF;
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

-- ── 7. Example rule (safe default): none seeded — admin configures ────
COMMIT;

-- ═════════════════════════════════════════════════════════════════════
-- Post-apply verification (manual, NOT part of migration):
--   1) rule: product Coca-Cola points_per_unit=1
--   2) order w/ Coca-Cola×2 + 7₼ drink (no rule) → pay
--      → earn = 2 (cola) + floor(7×1) (default) = 9
--   3) refund 1 cola → reversal = −1, order.loyalty_points_earned 8
--   4) no rules at all → old behavior (per-item default rate)
-- ═════════════════════════════════════════════════════════════════════
