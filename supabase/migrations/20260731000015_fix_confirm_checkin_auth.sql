-- Fix confirm_and_checkin_atomic: add caller authorization
-- The frontend calls this with staff_id, but the RPC had no auth check.

CREATE OR REPLACE FUNCTION public.confirm_and_checkin_atomic (
  p_reservation_id uuid,
  p_table_ids      integer[] DEFAULT '{}'::integer[],
  p_user_id        uuid      DEFAULT NULL::uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  AS $function$
DECLARE
  v_reservation RECORD;
  v_table RECORD;
  v_order_id UUID;
  v_order_ids UUID[] := '{}';
  v_item RECORD;
  v_now TIMESTAMPTZ := now();
  v_scheduled_for TIMESTAMPTZ;
  v_target_table_numbers INT[];
  v_caller_role text;
BEGIN
  -- Authorize caller
  SELECT public.effective_admin_role() INTO v_caller_role;
  IF v_caller_role NOT IN ('superadmin', 'admin', 'cashier', 'waiter') THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_reservation FROM public.reservations
    WHERE id = p_reservation_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Reservation not found');
  END IF;

  IF v_reservation.status != 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Reservation is not pending');
  END IF;

  IF p_table_ids IS NULL OR array_length(p_table_ids, 1) IS NULL OR array_length(p_table_ids, 1) = 0 THEN
    SELECT array_agg(rt.table_number) INTO v_target_table_numbers
    FROM public.reservation_tables rt
    WHERE rt.reservation_id = p_reservation_id;
  ELSE
    v_target_table_numbers := p_table_ids;
  END IF;

  IF v_target_table_numbers IS NULL OR array_length(v_target_table_numbers, 1) IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No tables assigned to reservation');
  END IF;

  UPDATE public.reservations SET
    status = 'confirmed',
    checked_in_at = v_now,
    updated_at = v_now
  WHERE id = p_reservation_id;

  FOR v_table IN
    SELECT t.table_number, t.id AS table_id
    FROM public.table_floors t
    WHERE t.table_number = ANY(v_target_table_numbers)
      AND t.status = ANY (ARRAY['reserved'::text, 'waiting'::text])
    ORDER BY t.table_number
  LOOP
    INSERT INTO public.orders (
      table_number, status, guest_count, reservation_id, customer_id, customer_name,
      customer_phone, kitchen_status, is_draft, created_at, updated_at, version
    ) VALUES (
      v_table.table_number, 'confirmed', v_reservation.guests, v_reservation.id,
      v_reservation.customer_id, v_reservation.name, v_reservation.phone,
      'pending', false, v_now, v_now, 1
    ) RETURNING id INTO v_order_id;

    INSERT INTO public.order_items (
      order_id, product_id, combo_id, product_name, quantity,
      unit_price, total_price, modifiers, special_notes,
      course, kitchen_status, price_snapshot, created_at
    )
    SELECT
      v_order_id, rpi.product_id, rpi.combo_id, rpi.product_name, rpi.quantity,
      rpi.unit_price, (rpi.quantity * rpi.unit_price), rpi.modifiers, rpi.special_notes,
      rpi.course, 'pending',
      jsonb_build_object('unit_price', rpi.unit_price, 'quantity', rpi.quantity, 'total_price', rpi.unit_price * rpi.quantity, 'snapshot_at', v_now),
      v_now
    FROM public.reservation_preorder_items rpi
    WHERE rpi.reservation_id = p_reservation_id;

    UPDATE public.orders SET
      total_amount = COALESCE((
        SELECT SUM(total_price) FROM public.order_items WHERE order_id = v_order_id
      ), 0)
    WHERE id = v_order_id;

    UPDATE public.table_floors SET
      status = 'occupied',
      current_order_id = v_order_id,
      reservation_id = NULL,
      reservation_name = NULL,
      reservation_phone = NULL,
      reservation_time = NULL,
      guest_count = v_reservation.guests,
      updated_at = v_now
    WHERE table_number = v_table.table_number;

    v_order_ids := array_append(v_order_ids, v_order_id);
  END LOOP;

  INSERT INTO public.operation_logs (
    reservation_id, action, old_values, new_values, performed_by
  ) VALUES (
    p_reservation_id, 'confirm_and_checkin',
    jsonb_build_object('status', 'pending'),
    jsonb_build_object('status', 'confirmed', 'order_ids', v_order_ids),
    p_user_id
  );

  RETURN jsonb_build_object('success', true, 'order_ids', v_order_ids);
END;
$function$;

GRANT ALL ON FUNCTION public.confirm_and_checkin_atomic(uuid, integer[], uuid) TO service_role;
REVOKE ALL ON FUNCTION public.confirm_and_checkin_atomic(uuid, integer[], uuid) FROM anon;
REVOKE ALL ON FUNCTION public.confirm_and_checkin_atomic(uuid, integer[], uuid) FROM authenticated;
