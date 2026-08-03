-- walkin_atomic: create walk-in reservation, order, and activate table
CREATE OR REPLACE FUNCTION public.walkin_atomic(
  p_table_number INT,
  p_guests INT DEFAULT 1,
  p_name TEXT DEFAULT NULL,
  p_phone TEXT DEFAULT NULL,
  p_order_type TEXT DEFAULT 'dine_in',
  p_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_table RECORD;
  v_reservation_id UUID;
  v_order_id UUID;
BEGIN
  SELECT * INTO v_table FROM public.table_floors WHERE table_number = p_table_number FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'TABLE_NOT_FOUND');
  END IF;

  IF v_table.status != 'empty' THEN
    RETURN jsonb_build_object('success', false, 'error', 'TABLE_NOT_EMPTY');
  END IF;

  INSERT INTO public.reservations (
    name, phone, guests, date, time, status, table_ids, order_type, created_at, updated_at
  ) VALUES (
    p_name, p_phone, p_guests, CURRENT_DATE, CURRENT_TIME, 'confirmed',
    ARRAY[p_table_number], p_order_type, NOW(), NOW()
  ) RETURNING id INTO v_reservation_id;

  INSERT INTO public.reservation_tables (reservation_id, table_number, created_at)
  VALUES (v_reservation_id, p_table_number, NOW());

  INSERT INTO public.orders (
    table_number, status, guest_count, reservation_id, customer_name,
    customer_phone, kitchen_status, order_source, created_at, updated_at, version
  ) VALUES (
    p_table_number, 'confirmed', p_guests, v_reservation_id, p_name, p_phone,
    'pending', p_order_type, NOW(), NOW(), 1
  ) RETURNING id INTO v_order_id;

  UPDATE public.table_floors SET
    status = 'occupied',
    current_order_id = v_order_id,
    reservation_id = v_reservation_id,
    reservation_name = p_name,
    reservation_phone = p_phone,
    reservation_time = CURRENT_TIME,
    guest_count = p_guests,
    updated_at = NOW()
  WHERE table_number = p_table_number;

  INSERT INTO public.operation_logs (
    table_number, order_id, reservation_id, action, old_values, new_values, performed_by
  ) VALUES (
    p_table_number, v_order_id, v_reservation_id, 'walkin',
    jsonb_build_object('status', 'empty'),
    jsonb_build_object('status', 'occupied', 'reservation_id', v_reservation_id),
    p_user_id
  );

  RETURN jsonb_build_object('success', true, 'reservation_id', v_reservation_id, 'order_id', v_order_id);
END;
$$;
