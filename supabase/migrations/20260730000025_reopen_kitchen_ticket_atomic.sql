-- reopen_kitchen_ticket_atomic: reopen kitchen ticket, reset to pending
CREATE OR REPLACE FUNCTION public.reopen_kitchen_ticket_atomic(
  p_order_id UUID,
  p_performed_by UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order RECORD;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;

  IF v_order.kitchen_status NOT IN ('ready', 'served', 'cancelled') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order cannot be reopened');
  END IF;

  UPDATE public.orders SET
    kitchen_status = 'pending',
    updated_at = NOW()
  WHERE id = p_order_id;

  UPDATE public.order_items SET
    kitchen_status = 'pending',
    updated_at = NOW()
  WHERE order_id = p_order_id AND kitchen_status IN ('ready', 'served', 'cancelled');

  IF v_order.table_number IS NOT NULL THEN
    UPDATE public.table_floors SET
      kitchen_status = 'pending',
      updated_at = NOW()
    WHERE table_number = v_order.table_number;
  END IF;

  INSERT INTO public.operation_logs (
    table_number, order_id, action, old_values, new_values, performed_by
  ) VALUES (
    v_order.table_number, p_order_id, 'reopen_kitchen_ticket',
    jsonb_build_object('kitchen_status', v_order.kitchen_status),
    jsonb_build_object('kitchen_status', 'pending'),
    p_performed_by
  );

  RETURN jsonb_build_object('success', true);
END;
$$;
