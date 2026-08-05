-- Fix RPC authorization: revoke anon/authenticated access, keep service_role only
-- The API routes already enforce auth via requireAuth(). RPCs must NOT
-- re-check auth.uid() because they are called server-side with service_role.

-- cancel_table_orders: keep the canonical overload, revoke from anon/auth
GRANT ALL ON FUNCTION public.cancel_table_orders(integer, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.cancel_table_orders(integer, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.cancel_table_orders(integer, uuid) FROM authenticated;

-- confirm_and_checkin_atomic
GRANT ALL ON FUNCTION public.confirm_and_checkin_atomic(uuid, integer[], uuid) TO service_role;
REVOKE ALL ON FUNCTION public.confirm_and_checkin_atomic(uuid, integer[], uuid) FROM anon;
REVOKE ALL ON FUNCTION public.confirm_and_checkin_atomic(uuid, integer[], uuid) FROM authenticated;

-- complete_payment_v4
GRANT ALL ON FUNCTION public.complete_payment_v4(uuid, text, numeric, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.complete_payment_v4(uuid, text, numeric, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.complete_payment_v4(uuid, text, numeric, uuid) FROM authenticated;

-- walkin_atomic
GRANT ALL ON FUNCTION public.walkin_atomic(integer, integer, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.walkin_atomic(integer, integer, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.walkin_atomic(integer, integer, uuid) FROM authenticated;

-- reserve_table_atomic
GRANT ALL ON FUNCTION public.reserve_table_atomic(uuid, integer[], uuid) TO service_role;
REVOKE ALL ON FUNCTION public.reserve_table_atomic(uuid, integer[], uuid) FROM anon;
REVOKE ALL ON FUNCTION public.reserve_table_atomic(uuid, integer[], uuid) FROM authenticated;

-- seat_guests_atomic
GRANT ALL ON FUNCTION public.seat_guests_atomic(uuid, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.seat_guests_atomic(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.seat_guests_atomic(uuid, uuid) FROM authenticated;

-- process_order_payment
GRANT ALL ON FUNCTION public.process_order_payment(uuid, text, numeric, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.process_order_payment(uuid, text, numeric, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.process_order_payment(uuid, text, numeric, uuid) FROM authenticated;

-- close_day_atomic
GRANT ALL ON FUNCTION public.close_day_atomic(date, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.close_day_atomic(date, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.close_day_atomic(date, uuid) FROM authenticated;

-- atomic_apply_invoice
GRANT ALL ON FUNCTION public.atomic_apply_invoice(uuid, jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.atomic_apply_invoice(uuid, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.atomic_apply_invoice(uuid, jsonb) FROM authenticated;

-- atomic_receive_goods
GRANT ALL ON FUNCTION public.atomic_receive_goods(uuid, jsonb, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.atomic_receive_goods(uuid, jsonb, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.atomic_receive_goods(uuid, jsonb, uuid) FROM authenticated;

-- deduct_inventory_atomic
GRANT ALL ON FUNCTION public.deduct_inventory_atomic(uuid, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.deduct_inventory_atomic(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.deduct_inventory_atomic(uuid, uuid) FROM authenticated;

-- cancel_delivery_order
GRANT ALL ON FUNCTION public.cancel_delivery_order(uuid, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.cancel_delivery_order(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.cancel_delivery_order(uuid, uuid) FROM authenticated;

-- cancel_takeaway_order
GRANT ALL ON FUNCTION public.cancel_takeaway_order(uuid, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.cancel_takeaway_order(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.cancel_takeaway_order(uuid, uuid) FROM authenticated;

-- dismiss_undo_atomic
GRANT ALL ON FUNCTION public.dismiss_undo_atomic(integer, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.dismiss_undo_atomic(integer, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.dismiss_undo_atomic(integer, uuid) FROM authenticated;

-- transition_table_status
GRANT ALL ON FUNCTION public.transition_table_status(integer, text, uuid, text, text, jsonb, jsonb, text, text) TO service_role;
REVOKE ALL ON FUNCTION public.transition_table_status(integer, text, uuid, text, text, jsonb, jsonb, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.transition_table_status(integer, text, uuid, text, text, jsonb, jsonb, text, text) FROM authenticated;
