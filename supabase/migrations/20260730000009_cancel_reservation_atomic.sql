-- cancel_reservation_atomic: cancel reservation, clear pre-order items, free table
CREATE OR REPLACE FUNCTION public.cancel_reservation_atomic(
  p_reservation_id UUID,
  p_reason TEXT DEFAULT NULL,
  p_performed_by UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_reservation RECORD;
  v_table RECORD;
BEGIN
  SELECT * INTO v_reservation FROM public.reservations WHERE id = p_reservation_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Reservation not found');
  END IF;

  IF v_reservation.status IN ('cancelled', 'completed', 'no_show') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Reservation already final');
  END IF;

  -- Delete pre-order items
  DELETE FROM public.reservation_preorder_items WHERE reservation_id = p_reservation_id;

  -- Update reservation
  UPDATE public.reservations SET
    status = 'cancelled',
    cancelled_at = NOW(),
    cancelled_reason = p_reason,
    updated_at = NOW()
  WHERE id = p_reservation_id;

  -- Free table if assigned
  IF v_reservation.table_number IS NOT NULL THEN
    UPDATE public.table_floors SET
      status = 'empty',
      reservation_id = NULL,
      reservation_name = NULL,
      reservation_phone = NULL,
      reservation_time = NULL,
      current_order_id = NULL,
      updated_at = NOW()
    WHERE table_number = v_reservation.table_number;
  END IF;

  INSERT INTO public.operation_logs (
    reservation_id, action, old_values, new_values, performed_by
  ) VALUES (
    p_reservation_id,
    'cancel_reservation',
    jsonb_build_object('status', v_reservation.status),
    jsonb_build_object('status', 'cancelled', 'reason', p_reason),
    p_performed_by
  );

  RETURN jsonb_build_object('success', true);
END;
$$;
