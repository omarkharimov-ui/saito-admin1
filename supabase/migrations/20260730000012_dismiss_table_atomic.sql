-- dismiss_table_atomic: clear order and reset table
CREATE OR REPLACE FUNCTION public.dismiss_table_atomic(
  p_table_number INT,
  p_reason TEXT DEFAULT 'dismissed',
  p_final_status TEXT DEFAULT 'empty',
  p_performed_by UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_table RECORD;
  v_order RECORD;
BEGIN
  SELECT * INTO v_table FROM public.table_floors WHERE table_number = p_table_number FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Table not found');
  END IF;

  SELECT * INTO v_order FROM public.orders 
  WHERE table_number = p_table_number 
    AND status NOT IN ('paid', 'cancelled', 'closed', 'completed')
  ORDER BY created_at ASC LIMIT 1;

  IF v_order.id IS NOT NULL THEN
    UPDATE public.orders SET
      status = 'cancelled',
      cancelled_at = NOW(),
      cancelled_reason = p_reason,
      updated_at = NOW()
    WHERE id = v_order.id;

    DELETE FROM public.order_items WHERE order_id = v_order.id AND kitchen_status IN ('pending', 'reserved');
  END IF;

  UPDATE public.table_floors SET
    status = p_final_status,
    guest_count = NULL,
    total_amount = 0,
    order_count = 0,
    current_order_id = NULL,
    merged_into_table = NULL,
    reservation_id = NULL,
    reservation_name = NULL,
    reservation_phone = NULL,
    reservation_time = NULL,
    bill_requested = false,
    updated_at = NOW()
  WHERE table_number = p_table_number;

  INSERT INTO public.operation_logs (
    table_number, order_id, action, old_values, new_values, performed_by
  ) VALUES (
    p_table_number,
    COALESCE(v_order.id, NULL),
    'dismiss_table',
    jsonb_build_object('status', v_table.status),
    jsonb_build_object('status', p_final_status, 'reason', p_reason),
    p_performed_by
  );

  RETURN jsonb_build_object('success', true);
END;
$$;
