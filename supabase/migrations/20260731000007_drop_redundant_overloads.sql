-- Migration 7: drop redundant RPC overloads causing PGRST203 ambiguity.
-- The app calls these functions with a subset of params (no terminal_id /
-- no p_complete). When overloads differ only by trailing DEFAULT NULL params,
-- PostgREST cannot choose a candidate and returns PGRST203. Keep ONE canonical
-- signature per function (longest, all params defaulted) so any subset call
-- resolves. plpgsql positional calls (e.g. void_item_with_pin) still bind via
-- the defaults.

DROP FUNCTION IF EXISTS public.accept_kitchen_ticket_atomic(uuid, uuid);
DROP FUNCTION IF EXISTS public.comp_order_item_atomic(uuid, text, uuid);
DROP FUNCTION IF EXISTS public.void_order_item_atomic(uuid, text, uuid);
DROP FUNCTION IF EXISTS public.waste_order_item_atomic(uuid, text, uuid);
DROP FUNCTION IF EXISTS public.complete_payment_atomic(uuid, jsonb, text, numeric, numeric, numeric, numeric, text, uuid);
DROP FUNCTION IF EXISTS public.dismiss_table_atomic(integer, text, text, uuid);
DROP FUNCTION IF EXISTS public.mark_ready_atomic(uuid, uuid);
DROP FUNCTION IF EXISTS public.mark_ready_atomic(uuid, uuid, text);
DROP FUNCTION IF EXISTS public.mark_served_atomic(uuid, uuid);
DROP FUNCTION IF EXISTS public.merge_tables_atomic(integer, integer[], uuid);
DROP FUNCTION IF EXISTS public.reopen_kitchen_ticket_atomic(uuid, uuid);
DROP FUNCTION IF EXISTS public.reopen_order_atomic(uuid, text, uuid);
DROP FUNCTION IF EXISTS public.send_to_kitchen_atomic(uuid, uuid);
DROP FUNCTION IF EXISTS public.start_preparing_atomic(uuid, uuid);
DROP FUNCTION IF EXISTS public.transfer_table_atomic(integer, integer, uuid);
DROP FUNCTION IF EXISTS public.transition_delivery_status(uuid, text, uuid, text, uuid);
DROP FUNCTION IF EXISTS public.transition_delivery_status(uuid, text, uuid, text, uuid, text, jsonb, text, text);
DROP FUNCTION IF EXISTS public.unmerge_tables_atomic(integer, integer[], uuid);

-- transition_delivery_status (canonical): record the order's table number so
-- operation_logs has a proper source_table_number
CREATE OR REPLACE FUNCTION public.transition_delivery_status(
  p_order_id uuid,
  p_new_status text,
  p_courier_id uuid DEFAULT NULL,
  p_courier_name text DEFAULT NULL,
  p_performed_by uuid DEFAULT NULL,
  p_performed_by_terminal_id text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_order RECORD;
  v_update JSONB;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;

  v_update := jsonb_build_object(
    'delivery_status', p_new_status,
    'updated_at', NOW(),
    'version', COALESCE(v_order.version, 0) + 1,
    'updated_by_terminal_id', p_performed_by_terminal_id
  );

  IF p_new_status = 'delivered' THEN
    v_update := v_update || jsonb_build_object('delivered_at', NOW(), 'status', 'paid');
  END IF;

  IF p_courier_id IS NOT NULL THEN
    v_update := v_update || jsonb_build_object('courier_id', p_courier_id);
  END IF;

  IF p_courier_name IS NOT NULL THEN
    v_update := v_update || jsonb_build_object('courier_name', p_courier_name);
  END IF;

  UPDATE public.orders SET
    delivery_status = p_new_status,
    status = CASE WHEN p_new_status = 'delivered' THEN 'paid' ELSE status END,
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
    jsonb_build_object('delivery_status', v_order.delivery_status),
    jsonb_build_object('delivery_status', p_new_status),
    p_performed_by
  );

  RETURN jsonb_build_object('success', true, 'order_id', p_order_id);
END;
$function$;
