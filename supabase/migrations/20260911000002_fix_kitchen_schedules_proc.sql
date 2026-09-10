-- ============================================================================
-- 20260911000002 — A#1 (scheduler): fix process_due_kitchen_schedules()
--
-- Root cause (found when pg_cron started invoking it every minute):
--   the original body ends with an invalid "INSERT INTO notifications ...
--   SELECT ... FROM due d" as the LAST statement of a RETURNS SETOF function
--   (i.e. "INSERT query does not return tuples"). The function has NEVER
--   run successfully in production (the HTTP cron route that would have hit
--   it was never scheduled), so the bug went undetected.
--
-- Fix: proper PL/pgSQL — FOR ... IN UPDATE ... RETURNING LOOP with
--   RETURN NEXT. Same side effects, same return signature
--   (schedule_id, reservation_id, table_number).
--
-- GOLDEN RULE 5: auto-commit. Idempotent (OR REPLACE).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.process_due_kitchen_schedules()
RETURNS TABLE(schedule_id uuid, reservation_id uuid, table_number int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_due RECORD;
BEGIN
  FOR v_due IN
    UPDATE kitchen_schedule ks
    SET status = 'started'
    WHERE ks.status = 'pending'
      AND ks.scheduled_at <= now()
    RETURNING ks.id, ks.reservation_id, ks.table_number
  LOOP
    UPDATE reservations r
    SET kitchen_scheduled_at = now()
    WHERE r.id = v_due.reservation_id;

    UPDATE orders o
    SET kitchen_status = 'pending',
        kitchen_accepted_at = now()
    WHERE o.reservation_id = v_due.reservation_id
      AND o.kitchen_status = 'reserved';

    UPDATE order_items oi
    SET kitchen_status = 'pending'
    FROM orders o
    WHERE oi.order_id = o.id
      AND o.reservation_id = v_due.reservation_id
      AND oi.kitchen_status = 'reserved';

    INSERT INTO notifications (type, title, body, data, created_at)
    VALUES (
      'kitchen',
      'Mətbəxə hazırlıq göndərildi',
      'Masa ' || v_due.table_number || ' — hazırlığa başlanıldı',
      jsonb_build_object('schedule_id', v_due.id, 'reservation_id', v_due.reservation_id, 'table_number', v_due.table_number),
      now()
    );

    schedule_id := v_due.id;
    reservation_id := v_due.reservation_id;
    table_number := v_due.table_number;
    RETURN NEXT;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.process_due_kitchen_schedules() TO service_role;
