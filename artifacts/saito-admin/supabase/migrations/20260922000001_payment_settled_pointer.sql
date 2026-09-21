-- ============================================================================
-- 20260922000001_payment_settled_pointer.sql
-- LIVE REPRO (2026-09-22, psql): ALL dine-in payments fail with
--   TABLE_ORDER_POINTER_ACTIVE: table 5 cannot be released while it still
--   points order d5a7c20a-...
--
-- ROOT CAUSE — chicken-and-egg between two 2026-09-21 migrations:
--   * w_m1 (20260921000006): when an order transitions to 'paid', the IMMEDIATE
--     AFTER trigger set_table_status_on_order_settled marks the table
--     'cleaning' — but leaves current_order_id pointing at the order being
--     paid.
--   * w_f7 (20260921000003): table_release_guard (BEFORE UPDATE) refuses ANY
--     transition into empty/cleaning while NEW.current_order_id IS NOT NULL.
--   * The F-05 pointer recompute (sync_table_order_aggregates: "pointer =
--     latest OPEN order, NULL if none") runs in a DEFERRED constraint trigger
--     — i.e. at COMMIT. It never gets the chance: the immediate trigger trips
--     the guard first and the whole payment transaction rolls back.
--
-- FIX (two layers, same F-05 contract):
--   1. set_table_status_on_order_settled: the 'cleaning' UPDATE now also sets
--      current_order_id = NULL in the SAME statement. At that moment
--      v_active_count = 0, so per F-05 the pointer MUST be NULL anyway.
--   2. table_release_guard (defense in depth): a pointer whose order is
--      already in a FINAL state is stale by definition — clear it in place
--      (self-heal) and allow the release. A pointer to an ACTIVE order still
--      raises. The TABLE_OPEN_ORDERS check remains the second line.
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
          -- 2026-09-22: F-05 contract — with zero active orders the canonical
          -- pointer is NULL. Clear it in the SAME statement; the deferred
          -- F-05 recompute runs at commit (too late), and
          -- table_release_guard refuses a release that still carries a
          -- pointer (this is what rolled back every payment).
          current_order_id = NULL,
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

CREATE OR REPLACE FUNCTION public.table_release_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.status NOT IN ('empty','cleaning')
     AND NEW.status IN ('empty','cleaning') THEN
    IF NEW.current_order_id IS NOT NULL THEN
      IF EXISTS (
        SELECT 1 FROM public.orders o
        WHERE o.id = NEW.current_order_id
          AND o.status NOT IN ('paid','cancelled','closed','refunded','partially_refunded','voided')
      ) THEN
        -- Pointer to a LIVE order: real conflict — block.
        RAISE EXCEPTION 'TABLE_ORDER_POINTER_ACTIVE: table % cannot be released while it still points to active order %',
          NEW.table_number, NEW.current_order_id USING ERRCODE = 'P0001';
      END IF;
      -- 2026-09-22: pointer to an already-SETTLED order is stale by
      -- definition (F-05: pointer = latest OPEN order). Self-heal: clear it
      -- and let the release proceed. Any OTHER open order on the table is
      -- still caught by the TABLE_OPEN_ORDERS check below.
      NEW.current_order_id := NULL;
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.table_number = NEW.table_number
        AND o.status NOT IN ('paid','cancelled','closed','refunded','partially_refunded','voided')
    ) THEN
      RAISE EXCEPTION 'TABLE_OPEN_ORDERS: table % cannot be empty while open orders exist; close/dismiss them first',
        NEW.table_number USING ERRCODE = 'P0001';
    END IF;
    NEW.kitchen_status := NULL;
  END IF;
  RETURN NEW;
END;
$function$;
