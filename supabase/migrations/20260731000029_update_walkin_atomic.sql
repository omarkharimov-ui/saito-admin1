-- Update walkin_atomic to accept notes parameter
CREATE OR REPLACE FUNCTION public.walkin_atomic (
  p_table_number integer,
  p_guests       integer DEFAULT 1,
  p_name         text    DEFAULT NULL::text,
  p_phone        text    DEFAULT NULL::text,
  p_order_type   text    DEFAULT 'dine_in'::text,
  p_notes        text    DEFAULT NULL::text,
  p_user_id      uuid    DEFAULT NULL::uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
DECLARE
  v_table RECORD;
  v_reservation_id UUID;
  v_order_id UUID;
BEGIN
  SELECT * INTO v_table FROM public.table_floors WHERE table_number = p_table_number FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'TABLE_NOT_FOUND');
  END IF;
  IF v_table.status NOT IN ('empty', 'dirty') THEN
    RETURN jsonb_build_object('success', false, 'error', 'TABLE_NOT_EMPTY');
  END IF;
  INSERT INTO public.reservations (
    name, phone, guests, date, time, status, table_ids, order_type, note, created_at, updated_at
  ) VALUES (
    p_name, p_phone, p_guests, CURRENT_DATE, CURRENT_TIME, 'confirmed',
    ARRAY[p_table_number], p_order_type, p_notes, NOW(), NOW()
  ) RETURNING id INTO v_reservation_id;
  INSERT INTO public.reservation_tables (reservation_id, table_number, created_at)
  VALUES (v_reservation_id, p_table_number, NOW());
  INSERT INTO public.orders (
    table_number, status, guest_count, reservation_id, customer_name,
    customer_phone, customer_note, kitchen_status, order_source, total_amount, created_at, updated_at, version
  ) VALUES (
    p_table_number, 'confirmed', p_guests, v_reservation_id, p_name, p_phone,
    p_notes, 'pending', p_order_type, 0, NOW(), NOW(), 1
  ) RETURNING id INTO v_order_id;
  UPDATE public.table_floors SET
    status = 'occupied',
    current_order_id = v_order_id,
    reservation_id = v_reservation_id,
    reservation_name = p_name,
    reservation_phone = p_phone,
    reservation_time = CURRENT_TIME,
    guest_count = p_guests,
    total_amount = 0,
    order_count = 0,
    bill_requested = false,
    updated_at = NOW()
  WHERE table_number = p_table_number;
  INSERT INTO public.operation_logs (
    table_number, order_id, reservation_id, action, old_values, new_values, performed_by
  ) VALUES (
    p_table_number, v_order_id, v_reservation_id, 'walkin',
    jsonb_build_object('status', v_table.status),
    jsonb_build_object('status', 'occupied', 'reservation_id', v_reservation_id),
    p_user_id
  );
  RETURN jsonb_build_object('success', true, 'reservation_id', v_reservation_id, 'order_id', v_order_id);
END;
$function$;

GRANT ALL ON FUNCTION public.walkin_atomic(integer, integer, text, text, text, text, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.walkin_atomic(integer, integer, text, text, text, text, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.walkin_atomic(integer, integer, text, text, text, text, uuid) FROM authenticated;
