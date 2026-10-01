-- ============================================================================
-- 2026-10-02 (12a): COURIER ASSIGNMENT PRESERVED ON OPERATOR TRANSITIONS.
--
-- BUG (fatal for the courier app): transition_delivery_status() wrote
--   courier_id   = p_courier_id,
--   courier_name = p_courier_name,
-- UNCONDITIONALLY. Every operator transition that is NOT an explicit
-- reassignment passes NULL (BDS board admin/delivery/page.tsx sends
-- p_courier_id: null on every board tap; /api/orders/delivery-status passes
-- `courier_id || null`) — so the moment the kitchen marked an assigned order
-- 'ready', the assigned courier was SILENTLY WIPED from the order row.
-- The courier app then rejected every action with
-- "Order is not assigned to this courier" (courier_transition assignment
-- check) — the 12a handoff could never work in the real flow.
--
-- FIX: NULL caller value = "no change". COALESCE keeps the existing courier;
-- an explicit (id,name) pair still reassigns (POS "Kuryer təyin et" + the
-- action-sheet transition both pass the concrete id). The audit log records
-- the EFFECTIVE post-transition values, not the raw NULLs.
--
-- No code path deliberately clears a courier through this RPC (unassign =
-- reassign to another courier), so COALESCE changes no intended behavior.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.transition_delivery_status(
  p_token text,
  p_order_id uuid,
  p_new_status text,
  p_courier_id uuid,
  p_courier_name text,
  p_performed_by_terminal_id text,
  p_metadata jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_order RECORD;
  v_validation jsonb;
  v_old_delivery_status TEXT;
  v_staff_id uuid;
  v_new_courier_id uuid;
  v_new_courier_name text;
BEGIN
  PERFORM set_session_staff(p_token);
  v_staff_id := current_staff_id();
  IF v_staff_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'FORBIDDEN');
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;

  v_old_delivery_status := COALESCE(v_order.delivery_status, 'pending');

  v_validation := validate_transition('delivery', v_old_delivery_status, p_new_status);
  IF NOT (v_validation->>'valid')::BOOLEAN THEN
    RETURN jsonb_build_object('success', false, 'error', v_validation->>'error');
  END IF;

  -- 12a: NULL = keep the current courier (see migration header).
  v_new_courier_id   := COALESCE(p_courier_id, v_order.courier_id);
  v_new_courier_name := COALESCE(p_courier_name, v_order.courier_name);

  UPDATE public.orders SET
    delivery_status = p_new_status,
    delivered_at = CASE WHEN p_new_status = 'delivered' THEN NOW() ELSE delivered_at END,
    courier_id = v_new_courier_id,
    courier_name = v_new_courier_name,
    updated_at = NOW(),
    version = COALESCE(v_order.version, 0) + 1,
    updated_by_terminal_id = p_performed_by_terminal_id
  WHERE id = p_order_id;

  INSERT INTO public.operation_logs (
    table_number, order_id, action, old_values, new_values, performed_by
  ) VALUES (
    v_order.table_number, p_order_id, 'transition_delivery_status',
    jsonb_build_object('delivery_status', v_old_delivery_status, 'courier_id', v_order.courier_id, 'courier_name', v_order.courier_name),
    jsonb_build_object('delivery_status', p_new_status, 'courier_id', v_new_courier_id, 'courier_name', v_new_courier_name),
    v_staff_id
  );

  RETURN jsonb_build_object(
    'success', true,
    'order_id', p_order_id,
    'old_delivery_status', v_old_delivery_status,
    'new_delivery_status', p_new_status
  );
END;
$function$;
