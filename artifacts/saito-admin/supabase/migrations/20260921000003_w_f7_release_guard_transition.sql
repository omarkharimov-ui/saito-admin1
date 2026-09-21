-- 20260921000003 — Audit fix: table_release_guard must fire only on REAL transitions
--
-- LIVE REPRO (2026-09-21, psql, rolled back):
--   INSERT INTO orders (table 2, table status 'empty', status='confirmed')
--     -> AFTER INSERT trigger sync_table_floors_on_order_change
--     -> sync_table_order_aggregates(2)  (mirror: current_order_id, totals)
--     -> BEFORE UPDATE trigger trg_table_release_guard
--        (fires on UPDATE OF status, current_order_id — mirror touches pointer)
--     -> NEW.status='empty' (UNCHANGED) -> open-order check sees the
--        just-inserted order (same transaction!) -> RAISE TABLE_OPEN_ORDERS
--     -> the legitimate order INSERT is rolled back.
--
-- SYMPTOM: "Order creation failed: TABLE_OPEN_ORDERS: table 2 cannot be empty
--   while open orders exist" — adding the FIRST item to an EMPTY table via the
--   direct order-creation path (no pre-seat step). Seating first masked the bug
--   (table already 'occupied' -> guard skipped).
--
-- FIX: enforce the guard only when the row actually TRANSITIONS into a released
--   state (OLD.status NOT IN ('empty','cleaning') AND NEW.status IN
--   ('empty','cleaning')). Aggregate-mirror updates on an already-released row
--   no longer trip the guard. True release operations (clear/dismiss:
--   occupied/dirty -> empty) still transition, and are still guarded against
--   both a stale pointer and open orders.
CREATE OR REPLACE FUNCTION public.table_release_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.status NOT IN ('empty','cleaning')
     AND NEW.status IN ('empty','cleaning') THEN
    IF NEW.current_order_id IS NOT NULL THEN
      RAISE EXCEPTION 'TABLE_ORDER_POINTER_ACTIVE: table % cannot be released while it still points order %',
        NEW.table_number, NEW.current_order_id USING ERRCODE = 'P0001';
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
