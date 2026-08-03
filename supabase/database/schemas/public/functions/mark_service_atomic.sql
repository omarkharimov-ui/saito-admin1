CREATE FUNCTION public.mark_service_atomic (
  p_order_id     uuid,
  p_performed_by uuid DEFAULT NULL::uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  AS $function$
DECLARE
  v_order RECORD;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;

  IF v_order.kitchen_status NOT IN ('ready') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order must be ready before marking as served');
  END IF;

  UPDATE public.orders SET
    kitchen_status = 'service',
    updated_at = NOW()
  WHERE id = p_order_id;

  IF v_order.table_number IS NOT NULL THEN
    UPDATE public.table_floors SET
      kitchen_status = 'service',
      updated_at = NOW()
    WHERE table_number = v_order.table_number;
  END IF;

  INSERT INTO public.operation_logs (
    table_number, order_id, action, old_values, new_values, performed_by
  ) VALUES (
    v_order.table_number, p_order_id, 'mark_service',
    jsonb_build_object('kitchen_status', v_order.kitchen_status),
    jsonb_build_object('kitchen_status', 'service'),
    p_performed_by
  );

  RETURN jsonb_build_object('success', true);
END;
$function$;

GRANT ALL ON FUNCTION public.mark_service_atomic(uuid, uuid) TO anon;

GRANT ALL ON FUNCTION public.mark_service_atomic(uuid, uuid) TO authenticated;

GRANT ALL ON FUNCTION public.mark_service_atomic(uuid, uuid) TO service_role;