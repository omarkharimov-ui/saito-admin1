-- ══════════════════════════════════════════════════════════════════════════
-- 2026-09-26 (owner, Task 49): carry the reservation DEPOSIT onto the table
-- so the POS floor + reservation action sheet can surface the table-hold
-- money (is_vip was already mirrored; deposit_amount was missing).
-- reserve_table_atomic now copies reservations.deposit_amount →
-- table_floors.deposit_amount when a table is (re)reserved.
-- ══════════════════════════════════════════════════════════════════════════

alter table public.table_floors
  add column if not exists deposit_amount numeric;

CREATE OR REPLACE FUNCTION public.reserve_table_atomic(p_reservation_id uuid, p_table_ids uuid[], p_guest_count integer DEFAULT NULL::integer, p_pre_order_items jsonb DEFAULT '[]'::jsonb, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_reservation RECORD;
  v_table_number INTEGER;
  v_order_id UUID;
  v_customer_id UUID;
  v_total_amount NUMERIC;
  v_item JSONB;
  v_draft_order_ids UUID[] := '{}'::UUID[];
  v_now TIMESTAMPTZ := now();
  v_result jsonb;
BEGIN
  SELECT * INTO v_reservation FROM reservations WHERE id = p_reservation_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Reservation not found');
  END IF;

  IF v_reservation.status NOT IN ('pending') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Reservation is not pending');
  END IF;

  UPDATE reservations SET
    status = 'confirmed',
    table_ids = ARRAY(SELECT unnest(p_table_ids)::integer),
    guest_count = COALESCE(p_guest_count, guest_count),
    updated_at = NOW()
  WHERE id = p_reservation_id;

  DELETE FROM public.reservation_tables 
  WHERE reservation_id = p_reservation_id;

  FOR v_table_number IN SELECT unnest(p_table_ids)::integer LOOP
    INSERT INTO public.reservation_tables (reservation_id, table_number, created_at)
    VALUES (p_reservation_id, v_table_number, NOW())
    ON CONFLICT (reservation_id, table_number) DO NOTHING;

    UPDATE public.table_floors SET
      status = 'reserved',
      reservation_id = p_reservation_id,
      reservation_name = v_reservation.name,
      deposit_amount = v_reservation.deposit_amount,
      reservation_phone = v_reservation.phone,
      reserved_at = NOW(),
      reserved_until = v_reservation.date + v_reservation.time,
      updated_at = NOW()
    WHERE table_number = v_table_number;
  END LOOP;

  IF p_pre_order_items IS NOT NULL AND jsonb_array_length(p_pre_order_items) > 0 THEN
    DELETE FROM public.reservation_preorder_items WHERE reservation_id = p_reservation_id;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_pre_order_items) LOOP
      INSERT INTO public.reservation_preorder_items (
        reservation_id, product_id, product_name, quantity, unit_price, modifiers, special_notes, course, combo_id, created_at
      ) VALUES (
        p_reservation_id,
        (v_item->>'product_id')::uuid,
        v_item->>'product_name',
        (v_item->>'quantity')::integer,
        (v_item->>'unit_price')::numeric,
        v_item->'modifiers',
        v_item->>'special_notes',
        v_item->>'course',
        (v_item->>'combo_id')::uuid,
        NOW()
      );
    END LOOP;
  END IF;

  PERFORM public.log_reservation_operation(
    p_reservation_id,
    'reserve_table',
    jsonb_build_object('status', 'pending', 'table_ids', v_reservation.table_ids),
    jsonb_build_object('status', 'confirmed', 'table_ids', ARRAY(SELECT unnest(p_table_ids)::integer)),
    p_user_id
  );

  v_result := jsonb_build_object('success', true, 'reservation_id', p_reservation_id);
  RETURN v_result;
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$function$;
