-- Remove auto-payment on delivery delivered status
-- Payment should be a separate step after delivery (cash/card at door)

CREATE OR REPLACE FUNCTION public.transition_delivery_status (
  p_order_id                 uuid,
  p_new_status               text,
  p_courier_id               uuid DEFAULT NULL::uuid,
  p_courier_name             text DEFAULT NULL::text,
  p_performed_by             uuid DEFAULT NULL::uuid,
  p_performed_by_terminal_id text DEFAULT NULL::text,
  p_employee_name            text DEFAULT NULL::text,
  p_metadata                 jsonb DEFAULT NULL::jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
DECLARE
  v_order RECORD;
  v_validation JSONB;
  v_old_delivery_status TEXT;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;

  v_old_delivery_status := COALESCE(v_order.delivery_status, 'pending');

  v_validation := validate_transition('delivery', v_old_delivery_status, p_new_status);
  IF NOT (v_validation->>'valid')::BOOLEAN THEN
    RETURN jsonb_build_object('success', false, 'error', v_validation->>'error');
  END IF;

  UPDATE public.orders SET
    delivery_status = p_new_status,
    delivered_at = CASE WHEN p_new_status = 'delivered' THEN NOW() ELSE delivered_at END,
    courier_id = p_courier_id,
    courier_name = p_courier_name,
    updated_at = NOW(),
    version = COALESCE(v_order.version, 0) + 1,
    updated_by_terminal_id = p_performed_by_terminal_id
  WHERE id = p_order_id;

  INSERT INTO public.operation_logs (
    table_number, order_id, action, old_values, new_values, performed_by
  ) VALUES (
    v_order.table_number, p_order_id, 'transition_delivery_status',
    jsonb_build_object('delivery_status', v_old_delivery_status, 'courier_id', v_order.courier_id, 'courier_name', v_order.courier_name),
    jsonb_build_object('delivery_status', p_new_status, 'courier_id', p_courier_id, 'courier_name', p_courier_name),
    p_performed_by
  );

  RETURN jsonb_build_object(
    'success', true,
    'order_id', p_order_id,
    'old_delivery_status', v_old_delivery_status,
    'new_delivery_status', p_new_status
  );
END;
$function$;

GRANT ALL ON FUNCTION public.transition_delivery_status(uuid, text, uuid, text, uuid, text, text, jsonb) TO anon;
GRANT ALL ON FUNCTION public.transition_delivery_status(uuid, text, uuid, text, uuid, text, text, jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.transition_delivery_status(uuid, text, uuid, text, uuid, text, text, jsonb) TO service_role;


-- Add delivered -> paid transition for delivery entity
INSERT INTO public.state_transitions (entity, from_status, to_status, description, requires_role, requires_manager_pin)
VALUES ('delivery', 'delivered', 'paid', 'Payment collected after delivery', NULL, false)
ON CONFLICT (entity, from_status, to_status) DO NOTHING;
