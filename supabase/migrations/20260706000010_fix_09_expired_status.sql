-- ============================================================================
-- Fix 1/8 UPDATE: Add 'expired' status support to RPC + clean up
-- ============================================================================

-- Update the process_expired_reservations RPC to use 'expired' status
CREATE OR REPLACE FUNCTION process_expired_reservations(
  p_minutes_past INTEGER DEFAULT 30
) RETURNS TABLE(
  reservation_id UUID,
  guest_name TEXT,
  table_number INTEGER
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  WITH expired AS (
    UPDATE reservations r
    SET status = 'expired'
    WHERE r.status IN ('confirmed', 'pending')
      AND (r.date < CURRENT_DATE
        OR (r.date = CURRENT_DATE
          AND (r.time::TIME) < (CURRENT_TIME - (p_minutes_past || ' minutes')::INTERVAL)::TIME
        )
      )
    RETURNING r.id, r.name, r.table_number
  ),
  released AS (
    UPDATE table_floors tf
    SET
      status = 'empty',
      reservation_id = NULL,
      reservation_name = NULL,
      reservation_phone = NULL,
      reservation_time = NULL,
      guest_count = NULL
    FROM expired e
    WHERE tf.reservation_id = e.id
  )
  INSERT INTO notifications (type, title, body, data, created_at)
  SELECT
    'reservation',
    'Rezervasiyanın vaxtı keçdi: ' || e.guest_name,
    'Cədvəl ' || e.table_number || ' - avtomatik olaraq boşaldıldı',
    jsonb_build_object('reservation_id', e.reservation_id, 'table_number', e.table_number),
    now()
  FROM expired e
  RETURNING e.reservation_id, e.guest_name, e.table_number;
END;
$$;

-- Update process_order_payment to set reservation as 'completed' (no 'expired')
-- (No change needed - already uses 'completed' for paid orders)

-- Add updated_at trigger for reservations if missing
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'set_reservations_updated_at'
  ) THEN
    CREATE TRIGGER set_reservations_updated_at
      BEFORE UPDATE ON reservations
      FOR EACH ROW EXECUTE FUNCTION update_timestamp();
  END IF;
END $$;
