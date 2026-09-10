-- ═════════════════════════════════════════════════════════════════════
-- Migration 20260910000007 — OS BUILD #1c: loyalty reversal at route level
-- ═════════════════════════════════════════════════════════════════════
-- Bug found in dry-run: the orders-trigger guessed the refunded item by
-- newest order_payments refund row — but refund_with_inventory does NOT
-- write order_payments rows (it updates paid/refund amounts + item state),
-- so the trigger fell back to reverse-ALL with the WRONG item's points
-- (reversed tea instead of Coca-Cola).
--
-- Fix: reversal moves to the API layer where the refunded order_item_id
-- is KNOWN (refund route receives it). Trigger keeps earn + customer
-- stats only. No frozen contract touched.
-- ═════════════════════════════════════════════════════════════════════

BEGIN;

CREATE OR REPLACE FUNCTION public._trg_order_loyalty_spine()
RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_res jsonb;
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id THEN RETURN NEW; END IF;

  -- EARN on first paid (idempotent inside loyalty_earn via
  -- orders.loyalty_points_earned anchor).
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

  -- REVERSAL is intentionally NOT here: it requires the refunded
  -- order_item_id, which only the refund API call knows. The refund
  -- routes call public.loyalty_reverse(p_order_id, p_order_item_id)
  -- (idempotent per item, safe under retries).

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_order_loyalty_spine ON public.orders;
CREATE TRIGGER trg_order_loyalty_spine
  AFTER UPDATE ON public.orders
  FOR EACH ROW
  WHEN (NEW.status IS DISTINCT FROM OLD.status)
  EXECUTE FUNCTION public._trg_order_loyalty_spine();

COMMIT;
