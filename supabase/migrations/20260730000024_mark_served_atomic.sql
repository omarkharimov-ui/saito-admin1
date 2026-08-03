-- mark_served_atomic: kitchen marks order as served
CREATE OR REPLACE FUNCTION public.mark_served_atomic(
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

  IF v_order.kitchen_status NOT IN ('ready', 'preparing') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order cannot be marked served');
  END IF;

  UPDATE public.orders SET
    kitchen_status = 'served',
    updated_at = NOW()
  WHERE id = p_order_id;

  IF v_order.table_number IS NOT NULL THEN
    UPDATE public.table_floors SET
      kitchen_status = 'served',
      updated_at = NOW()
    WHERE table_number = v_order.table_number;
  END IF;

  INSERT INTO public.operation_logs (
    table_number, order_id, action, old_values, new_values, performed_by
  ) VALUES (
    v_order.table_number, p_order_id, 'mark_served',
    jsonb_build_object('kitchen_status', v_order.kitchen_status),
    jsonb_build_object('kitchen_status', 'served'),
    p_performed_by
  );

  RETURN jsonb_build_object('success', true);
END;
$$;
