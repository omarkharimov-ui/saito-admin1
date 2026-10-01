-- ============================================================================
-- 2026-10-02 (12a, owner: "kurye tracking — hətta kurye üçün də bir app yaz"):
-- Courier LIVE TRACKING + courier-side app foundation.
--
-- Couriers are STAFF (role 'courier', Task 37 SSOT) with their own pin_hash —
-- the /courier app logs in with the courier's 4-digit PIN (same crypto as the
-- staff login). Orders already carry courier_id + the delivery_status state
-- machine (… → ready → waiting_courier → picked_up → in_transit → delivered);
-- the legacy `couriers` table is NOT used here (staff is the SSOT).
--
-- 1) courier_location — ONE upsert row per courier (staff id): the courier
--    app pings its GPS every ~20 s while an order is active; the admin
--    dispatch map reads last_location_* from here (the legacy
--    couriers.last_location_* columns only cover legacy rows).
-- 2) courier_transition — atomic courier-side state change (picked_up /
--    in_transit / delivered): the order MUST belong to the calling courier,
--    the transition MUST pass the same validate_transition() the operator
--    machine uses (no back-steps, no skipping), delivered_at is stamped by
--    the DB, and the move is written to operation_logs with performed_by =
--    the courier's staff id (full audit: WHO moved the order, FROM WHERE).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.courier_location (
  courier_id uuid PRIMARY KEY,          -- staff.id (role 'courier'); no FK on purpose (staff soft-deletes)
  lat numeric(9,6) NOT NULL,
  lng numeric(9,6) NOT NULL,
  order_id uuid,                        -- the delivery being chased (context for the map)
  t timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_courier_location_courier ON public.courier_location (courier_id);
COMMENT ON TABLE public.courier_location IS '12a: live GPS pings (one row per courier, upserted by the /courier app)';

CREATE OR REPLACE FUNCTION public.courier_transition(
  p_courier_id uuid,
  p_order_id uuid,
  p_new_status text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order RECORD;
  v_old text;
  v_val jsonb;
BEGIN
  IF p_new_status NOT IN ('picked_up','in_transit','delivered') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid courier action');
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;

  -- The courier may only move orders assigned TO THEM (legacy staff-less
  -- rows have courier_id NULL — those stay operator-only).
  IF v_order.courier_id IS DISTINCT FROM p_courier_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order is not assigned to this courier');
  END IF;

  v_old := COALESCE(v_order.delivery_status, 'pending');
  v_val := validate_transition('delivery', v_old, p_new_status);
  IF NOT (v_val ->> 'valid')::boolean THEN
    RETURN jsonb_build_object('success', false, 'error', v_val ->> 'error');
  END IF;

  UPDATE public.orders SET
    delivery_status = p_new_status,
    delivered_at = CASE WHEN p_new_status = 'delivered' THEN NOW() ELSE delivered_at END,
    updated_at = NOW(),
    version = COALESCE(v_order.version, 0) + 1
  WHERE id = p_order_id;

  INSERT INTO public.operation_logs (table_number, order_id, action, old_values, new_values, performed_by)
  VALUES (
    v_order.table_number, p_order_id, 'courier_transition',
    jsonb_build_object('delivery_status', v_old),
    jsonb_build_object('delivery_status', p_new_status),
    p_courier_id
  );

  RETURN jsonb_build_object('success', true, 'old', v_old, 'new', p_new_status);
END;
$$;

COMMENT ON FUNCTION public.courier_transition IS '12a: courier-side atomic delivery_status move (assignment-checked, validate_transition-enforced, audited)';
