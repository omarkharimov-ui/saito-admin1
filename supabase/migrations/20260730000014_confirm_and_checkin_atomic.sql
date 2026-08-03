-- confirm_and_checkin_atomic: confirm pending reservation and check in guest, create order
CREATE OR REPLACE FUNCTION public.confirm_and_checkin_atomic(
  p_reservation_id UUID,
  p_table_ids INT[] DEFAULT '{}',
  p_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_reservation RECORD;
  v_table RECORD;
  v_order_id UUID;
  v_table_number INT;
BEGIN
  SELECT * INTO v_reservation FROM public.reservations WHERE id = p_reservation_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Reservation not found');
  END IF;

  IF v_reservation.status != 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Reservation is not pending');
  END IF;

  UPDATE public.reservations SET
    status = 'confirmed',
    checked_in_at = NOW(),
    updated_at = NOW()
  WHERE id = p_reservation_id;

  IF p_table_ids IS NOT NULL AND array_length(p_table_ids, 1) > 0 THEN
    v_table_number := p_table_ids[1];
    
    INSERT INTO public.orders (
      table_number, status, guest_count, reservation_id, customer_id, customer_name,
      customer_phone, kitchen_status, is_draft, created_at, updated_at, version
    ) VALUES (
      v_table_number, 'confirmed', v_reservation.guests, v_reservation.id,
      v_reservation.customer_id, v_reservation.name, v_reservation.phone,
      'pending', false, NOW(), NOW(), 1
    ) RETURNING id INTO v_order_id;

    INSERT INTO public.order_items (
      order_id, product_id, product_name, quantity, unit_price, total_price,
      kitchen_status, price_snapshot, created_at
    )
    SELECT 
      v_order_id, rpi.product_id, rpi.product_name, rpi.quantity, rpi.unit_price,
      rpi.unit_price * rpi.quantity, 'pending',
      jsonb_build_object(
        'unit_price', rpi.unit_price, 'quantity', rpi.quantity,
        'total_price', rpi.unit_price * rpi.quantity, 'snapshot_at', NOW()
      ), NOW()
    FROM public.reservation_preorder_items rpi
    WHERE rpi.reservation_id = p_reservation_id;

    UPDATE public.table_floors SET
      status = 'occupied',
      current_order_id = v_order_id,
      reservation_id = NULL,
      reservation_name = NULL,
      reservation_phone = NULL,
      reservation_time = NULL,
      guest_count = v_reservation.guests,
      updated_at = NOW()
    WHERE table_number = v_table_number;
  END IF;

  INSERT INTO public.operation_logs (
    reservation_id, action, old_values, new_values, performed_by
  ) VALUES (
    p_reservation_id, 'confirm_and_checkin',
    jsonb_build_object('status', 'pending'),
    jsonb_build_object('status', 'confirmed', 'table_ids', p_table_ids),
    p_user_id
  );

  RETURN jsonb_build_object('success', true, 'order_id', v_order_id);
END;
$$;
