CREATE FUNCTION public.dismiss_table_session (
  p_table_number integer
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
DECLARE
  v_order RECORD;
  v_reservation_id UUID;
  v_reversed INTEGER := 0;
  v_notification_id UUID;
BEGIN
  -- Step 1: Reverse stock for all unpaid orders on this table
  FOR v_order IN SELECT id FROM orders WHERE table_number = p_table_number AND status NOT IN ('paid', 'cancelled') LOOP
    -- Reverse stock deduction if any was done
    PERFORM reverse_stock_deduction(v_order.id);
    v_reversed := v_reversed + 1;
  END LOOP;

  -- Step 2: Cancel all unpaid orders
  UPDATE orders SET
    status = 'cancelled',
    cancelled_at = now(),
    kitchen_status = 'cancelled',
    version = COALESCE(version, 0) + 1
  WHERE table_number = p_table_number
    AND status NOT IN ('paid', 'cancelled');

  -- Step 3: For draft orders, clean up order_items
  DELETE FROM order_items
  WHERE order_id IN (SELECT id FROM orders WHERE table_number = p_table_number AND is_draft = true)
    AND kitchen_status IS DISTINCT FROM 'cancelled';

  -- Step 4: Unlink merged child tables
  UPDATE table_floors
  SET merged_into_table = NULL
  WHERE merged_into_table = p_table_number;

  -- Step 5: Cancel associated reservation
  SELECT reservation_id INTO v_reservation_id
  FROM table_floors WHERE table_number = p_table_number;

  IF v_reservation_id IS NOT NULL THEN
    -- Preserve pre_order data before cancelling
    UPDATE reservations SET
      status = 'cancelled',
      cancelled_at = now(),
      cancelled_reason = 'dismissed_table_session'
    WHERE id = v_reservation_id
      AND status NOT IN ('completed', 'cancelled', 'no_show');
  END IF;

  -- Step 6: Cancel kitchen schedules for this table
  UPDATE kitchen_schedule
  SET status = 'cancelled'
  WHERE table_number = p_table_number
    AND status = 'pending';

  -- Step 7: Reset table to empty
  UPDATE table_floors
  SET
    status = 'empty',
    reservation_id = NULL,
    reservation_name = NULL,
    reservation_phone = NULL,
    reservation_time = NULL,
    guest_count = NULL,
    total_amount = NULL,
    order_count = NULL,
    order_ids = NULL,
    has_pending = NULL,
    oldest_pending_at = NULL,
    last_activity_at = now(),
    updated_at = now()
  WHERE table_number = p_table_number;

  -- Step 8: Audit log
  INSERT INTO audit_log (table_name, record_id, action, old_data, new_data, performed_by, created_at)
  VALUES (
    'table_floors',
    p_table_number::TEXT,
    'dismiss',
    jsonb_build_object('table_number', p_table_number),
    jsonb_build_object('action', 'dismissed', 'orders_cancelled', v_reversed, 'table_number', p_table_number),
    NULL,
    now()
  );

  -- Step 9: Notification
  INSERT INTO notifications (type, title, body, data, created_at)
  VALUES (
    'order',
    'Masa boşaldıldı',
    'Masa ' || p_table_number || ' — ləğv edildi (' || v_reversed || ' sifariş)',
    jsonb_build_object('table_number', p_table_number, 'cancelled_orders', v_reversed),
    now()
  );

  RETURN jsonb_build_object(
    'success', true,
    'table_number', p_table_number,
    'orders_cancelled', v_reversed
  );
END;
$function$;

GRANT ALL ON FUNCTION public.dismiss_table_session(integer) TO anon;

GRANT ALL ON FUNCTION public.dismiss_table_session(integer) TO authenticated;

GRANT ALL ON FUNCTION public.dismiss_table_session(integer) TO service_role;