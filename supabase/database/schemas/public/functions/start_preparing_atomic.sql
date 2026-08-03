CREATE FUNCTION public.start_preparing_atomic (
  p_order_id                 uuid,
  p_performed_by             uuid DEFAULT NULL::uuid,
  p_performed_by_terminal_id text DEFAULT NULL::text
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

  IF v_order.kitchen_status NOT IN ('accepted', 'pending') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order cannot start preparing');
  END IF;

  UPDATE public.orders SET
    kitchen_status = 'preparing',
    updated_at = NOW(),
    version = COALESCE(v_order.version, 0) + 1,
    updated_by_terminal_id = p_performed_by_terminal_id
  WHERE id = p_order_id;

  IF v_order.table_number IS NOT NULL THEN
    UPDATE public.table_floors SET
      kitchen_status = 'preparing',
      updated_at = NOW()
    WHERE table_number = v_order.table_number;
  END IF;

  INSERT INTO public.operation_logs (
    table_number, order_id, action, old_values, new_values, performed_by
  ) VALUES (
    v_order.table_number, p_order_id, 'start_preparing',
    jsonb_build_object('kitchen_status', v_order.kitchen_status),
    jsonb_build_object('kitchen_status', 'preparing'),
    p_performed_by
  );

  RETURN jsonb_build_object('success', true);
END;
$function$;

GRANT ALL ON FUNCTION public.start_preparing_atomic(uuid, uuid, text) TO anon;

GRANT ALL ON FUNCTION public.start_preparing_atomic(uuid, uuid, text) TO authenticated;

GRANT ALL ON FUNCTION public.start_preparing_atomic(uuid, uuid, text) TO service_role;