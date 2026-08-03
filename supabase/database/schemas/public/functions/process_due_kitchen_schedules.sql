CREATE FUNCTION public.process_due_kitchen_schedules()
  RETURNS TABLE (
    schedule_id    uuid,
    reservation_id uuid,
    table_number   integer
  )
  LANGUAGE plpgsql
  AS $function$
BEGIN
  RETURN QUERY
  WITH due AS (
    UPDATE kitchen_schedule ks
    SET status = 'started'
    WHERE ks.status = 'pending'
      AND ks.scheduled_at <= now()
    RETURNING ks.id, ks.reservation_id, ks.table_number
  ),
  updated_reservations AS (
    UPDATE reservations r
    SET kitchen_scheduled_at = now()
    FROM due d
    WHERE r.id = d.reservation_id
  ),
  -- Update any draft order (with kitchen_status = 'reserved') to 'pending'
  updated_orders AS (
    UPDATE orders o
    SET
      kitchen_status = 'pending',
      kitchen_accepted_at = now()
    FROM due d
    WHERE o.reservation_id = d.reservation_id
      AND o.kitchen_status = 'reserved'
  ),
  updated_items AS (
    UPDATE order_items oi
    SET kitchen_status = 'pending'
    FROM due d
    JOIN orders o ON o.reservation_id = d.reservation_id
    WHERE oi.order_id = o.id
      AND oi.kitchen_status = 'reserved'
  )
  INSERT INTO notifications (type, title, body, data, created_at)
  SELECT
    'kitchen',
    'Mətbəxə hazırlıq göndərildi',
    'Masa ' || d.table_number || ' — hazırlığa başlanıldı',
    jsonb_build_object('schedule_id', d.id, 'reservation_id', d.reservation_id, 'table_number', d.table_number),
    now()
  FROM due d;

  RETURN QUERY SELECT d.id, d.reservation_id, d.table_number FROM due d;
END;
$function$;

GRANT ALL ON FUNCTION public.process_due_kitchen_schedules() TO anon;

GRANT ALL ON FUNCTION public.process_due_kitchen_schedules() TO authenticated;

GRANT ALL ON FUNCTION public.process_due_kitchen_schedules() TO service_role;