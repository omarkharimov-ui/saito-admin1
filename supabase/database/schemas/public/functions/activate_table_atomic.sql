CREATE FUNCTION public.activate_table_atomic (
  p_table_id    uuid,
  p_guest_count integer DEFAULT NULL::integer
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  AS $function$
DECLARE
  v_table RECORD;
  v_reservation RECORD;
  v_order_id UUID;
  v_total NUMERIC;
BEGIN
  SELECT * INTO v_table FROM public.table_floors WHERE id = p_table_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'TABLE_NOT_FOUND');
  END IF;

  IF v_table.status != 'reserved' THEN
    RETURN jsonb_build_object('success', false, 'error', 'TABLE_NOT_RESERVED');
  END IF;

  SELECT * INTO v_reservation FROM public.reservations
    WHERE id = v_table.reservation_id AND status = 'confirmed'
    FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'RESERVATION_NOT_FOUND');
  END IF;

  SELECT COALESCE(SUM(rpi.unit_price * rpi.quantity), 0) INTO v_total
  FROM public.reservation_preorder_items rpi
  WHERE rpi.reservation_id = v_reservation.id;

  INSERT INTO public.orders (
    table_number, status, guest_count, reservation_id, customer_id, customer_name,
    customer_phone, kitchen_status, is_draft, total_amount, created_at, updated_at, version
  ) VALUES (
    v_table.table_number, 'confirmed', COALESCE(p_guest_count, v_reservation.guests),
    v_reservation.id, v_reservation.customer_id, v_reservation.name, v_reservation.phone,
    'pending', false, v_total, NOW(), NOW(), 1
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
  WHERE rpi.reservation_id = v_reservation.id;

  UPDATE public.table_floors SET
    status = 'occupied',
    current_order_id = v_order_id,
    reservation_id = NULL,
    reservation_name = NULL,
    reservation_phone = NULL,
    reservation_time = NULL,
    updated_at = NOW()
  WHERE id = p_table_id;

  INSERT INTO public.operation_logs (
    operation, order_id, source_table_number, old_state, new_state, performed_by
  ) VALUES (
    'activate_table', v_order_id, v_table.table_number,
    jsonb_build_object('status', v_table.status, 'reservation_id', v_table.reservation_id),
    jsonb_build_object('status', 'occupied', 'order_id', v_order_id),
    NULL
  );

  RETURN jsonb_build_object('success', true, 'table', v_table, 'order_id', v_order_id);
END;
$function$;

GRANT ALL ON FUNCTION public.activate_table_atomic(uuid, integer) TO anon;

GRANT ALL ON FUNCTION public.activate_table_atomic(uuid, integer) TO authenticated;

GRANT ALL ON FUNCTION public.activate_table_atomic(uuid, integer) TO service_role;