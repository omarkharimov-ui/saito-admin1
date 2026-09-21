-- ============================================================================
-- 20260921000006_w_m1_paid_table_status.sql
-- A3 root cause (verified 2026-09-21): a PAID dine-in table was a dead end.
--   * dismiss_table_atomic refuses tables with paid payments (G_DISMISS_ORDER_PAID —
--     correct: a paid order must be released, never wiped).
--   * release_table_atomic requires a paid order (G_NO_PAID_ORDER) and is only
--     REACHABLE when the floor row reports status='paid' — but no code path ever
--     set table_floors.status to 'paid' after payment. The floor aggregate keeps
--     only ACTIVE orders, so after paying the card read "occupied, ₼0.00" and
--     neither action applied: the table stayed stuck until a manual DB fix.
--
-- FIX (SSOT): when an order transitions INTO a settled state (paid /
-- partially_refunded) and no other active (non-final) orders remain on the
-- table, mark the table 'cleaning' (REVISION 2, owner request 2026-09-21:
-- "payment etdikden sonra masa dirty olunmalıdır amma new seat kimi olur" —
-- a settled table needs cleaning, not a fresh-seat badge). When it
-- transitions OUT of settled state (refund / reopen) and nothing paid or
-- active remains, fall back to 'occupied' (₼0 — clearable through the
-- PIN-gated MASANI BOŞALT). The release_table UI row is visible for both
-- 'paid' and 'cleaning' tables (release_table_atomic has no status guard —
-- only "a paid order exists and no active orders").
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_table_status_on_order_settled()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_active_count int;
  v_settled_count int;
  v_current text;
BEGIN
  IF NEW.table_number IS NULL THEN
    RETURN NEW;
  END IF;

  -- Active = still operable (not in any final state).
  SELECT count(*) INTO v_active_count
  FROM public.orders
  WHERE table_number = NEW.table_number
    AND status NOT IN ('paid','cancelled','closed','refunded','partially_refunded','voided');

  -- Settled = money captured, releasable.
  SELECT count(*) INTO v_settled_count
  FROM public.orders
  WHERE table_number = NEW.table_number
    AND status IN ('paid','partially_refunded');

  SELECT status INTO v_current
  FROM public.table_floors
  WHERE table_number = NEW.table_number
    AND is_archived = false;

  IF v_current IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.status IN ('paid','partially_refunded') THEN
    -- Order became settled: table needs CLEANING when no active work remains.
    IF v_active_count = 0 AND v_settled_count > 0
       AND v_current NOT IN ('cleaning','empty') THEN
      UPDATE public.table_floors
      SET status = 'cleaning',
          updated_at = now()
      WHERE table_number = NEW.table_number
        AND is_archived = false
        AND status NOT IN ('cleaning','empty');
    END IF;
  ELSE
    -- Order left settled state (refund/reopen): drop the paid/cleaning state
    -- only when nothing paid or active remains (table goes back to 'occupied').
    IF v_active_count = 0 AND v_settled_count = 0
       AND v_current IN ('paid','cleaning') THEN
      UPDATE public.table_floors
      SET status = 'occupied',
          updated_at = now()
      WHERE table_number = NEW.table_number
        AND is_archived = false
        AND status IN ('paid','cleaning');
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_settled_table_status ON public.orders;
CREATE TRIGGER orders_settled_table_status
AFTER UPDATE OF status ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.set_table_status_on_order_settled();
