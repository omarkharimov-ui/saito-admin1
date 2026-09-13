-- P-6 Refund/Void/Reopen contract (D-1..D-9, ratified 2026-09-13).
-- D-1: reopen = full financial reversal -> server-side authorization
--   (session-token identity, orders.edit + location scope (P-1), MANAGER OVERRIDE).
--   p_token added as leading arg (O-01: identity from session, not caller).
-- D-2: reopen emits canonical log_audit + order.status_changed outbox (was
--   operation_logs only).
-- D-4: void_items_state_aware emits order.status_changed outbox on void.
-- D-5/D-6: freeze dead legacy RPCs (REVOKE EXECUTE; postgres keeps them).
-- D-3: reopen's trusted DELETE stays (ratified P-3 full-reversal path); the
--   delete-vs-append model is a P-9 reconciliation decision, untouched.
-- D-9: legacy payments path untouched (P-9).
-- Pre-state: _p6_rollback_20260913/. All new guards are RETURN (no RAISE added);
-- any future RAISE uses P0001 (P-4 lesson: never 40001).
BEGIN;

-- ═══ D-1 + D-2: reopen_order_atomic (5-arg, session-token identity) ═══
CREATE OR REPLACE FUNCTION public.reopen_order_atomic(p_token text, p_order_id uuid, p_reason text DEFAULT NULL::text, p_performed_by uuid DEFAULT NULL::uuid, p_performed_by_terminal_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_order RECORD;
  v_item  RECORD;
  v_rev   jsonb;
  v_reversed integer := 0;
  v_auth     jsonb;
  v_actor_id text;
  v_has_over boolean := false;
BEGIN
  -- P-3: this is the single trusted path allowed to remove an order's payment
  -- records (full authorized reversal). Transaction-scoped flag read by
  -- trg_order_payment_immutable; external callers cannot forge it.
  PERFORM set_config('app.payment_ledger_reopen', 'on', true);

  PERFORM public.validate_actor(p_performed_by);

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;

  IF v_order.status NOT IN ('paid','completed','partially_refunded','refunded') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order is not paid/completed/refunded');
  END IF;

  -- ═══ P-6 D-1 (ratified 2026-09-13): server-side reopen authorization ═══
  -- Reopen is a FULL financial reversal (it DELETEs every order_payments row).
  -- The route passes the SESSION TOKEN; identity is re-derived from the session
  -- (never the caller-supplied p_performed_by — O-01 lesson). Requires
  -- orders.edit (registry) + location access (P-1) + MANAGER OVERRIDE
  -- (refund.approve OR void.approve OR an approved manager_overrides row;
  --  registry ovr=true for paid→new / refunded→new / closed→new / partial→new).
  v_auth := public.authorize(p_token, 'orders.edit', v_order.location_id);
  IF NOT (v_auth->>'allowed')::boolean THEN
    RETURN jsonb_build_object('success', false, 'error', 'PERMISSION_DENIED: reopen requires orders.edit at the order location (reason: ' || coalesce(v_auth->>'reason','?') || ')');
  END IF;
  v_actor_id := v_auth->>'staff_id';
  IF v_actor_id IS NOT NULL AND p_performed_by IS NOT NULL
     AND (v_actor_id::uuid IS DISTINCT FROM p_performed_by) THEN
    RETURN jsonb_build_object('success', false, 'error', 'IDENTITY_MISMATCH: p_performed_by must match the session staff (identity comes from the session)');
  END IF;
  IF v_actor_id IS NOT NULL THEN
    v_has_over := COALESCE((SELECT has_permission(v_actor_id::uuid, 'refund.approve')), false)
               OR COALESCE((SELECT has_permission(v_actor_id::uuid, 'void.approve')), false)
               OR COALESCE((SELECT EXISTS(
                    SELECT 1 FROM manager_overrides mo
                    WHERE mo.requested_by = v_actor_id::uuid
                      AND mo.permission IN ('orders.edit','refund.approve','void.approve')
                      AND (mo.location_id = v_order.location_id OR mo.location_id IS NULL)
                      AND mo.status = 'APPROVED' AND mo.expires_at > now())), false);
    IF NOT v_has_over THEN
      RETURN jsonb_build_object('success', false, 'error', 'MANAGER_OVERRIDE_REQUIRED: reopening a ' || v_order.status || ' order requires refund.approve / void.approve / an approved manager override (reason: reopen reverses the full payment)');
    END IF;
  END IF;

  FOR v_item IN
    SELECT oi.id FROM public.order_items oi
    WHERE oi.order_id = p_order_id
  LOOP
    v_rev := public._inventory_reverse_item(v_item.id, 'reopen', p_performed_by);
    IF (v_rev->>'reversed')::int > 0 THEN
      v_reversed := v_reversed + (v_rev->>'reversed')::int;
    END IF;
  END LOOP;

  DELETE FROM public.order_payments WHERE order_id = p_order_id;

  UPDATE public.orders SET
    status = 'new',
    paid_amount = 0,
    cash_amount = 0,
    card_amount = 0,
    tip_amount = 0,
    paid_at = NULL,
    version = COALESCE(v_order.version, 0) + 1,
    updated_by_terminal_id = p_performed_by_terminal_id,
    updated_at = NOW()
  WHERE id = p_order_id;

  INSERT INTO public.operation_logs (
    table_number, order_id, action, old_values, new_values, performed_by
  ) VALUES (
    v_order.table_number, p_order_id, 'reopen_order',
    jsonb_build_object('status', v_order.status),
    jsonb_build_object('status', 'new', 'reason', p_reason),
    p_performed_by
  );

  -- ═══ P-6 D-2 (ratified 2026-09-13): canonical audit + order outbox for the
  -- full reversal (previously operation_logs only — no audit, no client resync). ═══
  PERFORM public.log_audit(
    'reopen_order', 'order', p_order_id::text,
    p_performed_by,
    (SELECT name FROM public.staff WHERE id = p_performed_by),
    jsonb_build_object('status', v_order.status, 'paid_amount', v_order.paid_amount,
      'refund_amount', v_order.refund_amount),
    jsonb_build_object('status', 'new', 'reason', p_reason, 'reversed_items', v_reversed),
    jsonb_build_object('order_id', p_order_id), NULL
  );
  INSERT INTO outbox_events (aggregate_type, aggregate_id, event_type, payload, status)
  VALUES ('order', p_order_id, 'order.status_changed',
    jsonb_build_object('old_status', v_order.status, 'new_status', 'new',
                       'reason', p_reason, 'performed_by', p_performed_by,
                       'reopened', true),
    'pending');

  RETURN jsonb_build_object('success', true, 'reversed', v_reversed);
END;
$function$;

-- ═══ D-4: void_items_state_aware order outbox ═══
CREATE OR REPLACE FUNCTION public.void_items_state_aware(p_order_id text, p_items jsonb, p_performed_by uuid DEFAULT NULL::uuid, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_item JSONB;
  v_oi RECORD;
  v_new_qty INT;
  v_performer_name TEXT;
  v_now TIMESTAMPTZ := NOW();
  v_voided INT := 0;
  v_blocked TEXT[] := ARRAY[]::text[];
  v_order RECORD;
BEGIN
  IF p_order_id IS NULL OR p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'order_id and items required');
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id::uuid FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;

  IF v_order.status IN ('paid', 'closed', 'refunded') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot void paid/closed/refunded orders');
  END IF;

  IF p_performed_by IS NOT NULL THEN
    SELECT name INTO v_performer_name FROM public.staff WHERE id = p_performed_by;
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    SELECT * INTO v_oi FROM public.order_items WHERE id = (v_item->>'order_item_id')::uuid FOR UPDATE;
    IF NOT FOUND THEN CONTINUE; END IF;

    IF v_oi.kitchen_status IN ('ready', 'completed', 'served') THEN
      v_blocked := array_append(v_blocked,
        v_oi.product_name || ' (status=' || COALESCE(v_oi.kitchen_status, 'pending') || ')'
      );
      CONTINUE;
    END IF;

    IF (v_item->>'quantity')::int >= v_oi.quantity THEN
      UPDATE public.order_items SET kitchen_status = 'voided', total_price = 0 WHERE id = v_oi.id;
    ELSE
      v_new_qty := v_oi.quantity - (v_item->>'quantity')::int;
      UPDATE public.order_items SET quantity = v_new_qty, total_price = COALESCE(unit_price, 0) * v_new_qty WHERE id = v_oi.id;
    END IF;

    v_voided := v_voided + 1;
  END LOOP;

  IF array_length(v_blocked, 1) > 0 AND v_voided = 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'All items are READY/SERVED — use waste workflow instead',
      'blocked_items', to_jsonb(v_blocked)
    );
  END IF;

  INSERT INTO public.cancelled_orders (order_id, reason, reason_text, items, created_at)
  VALUES (p_order_id::uuid, 'void', COALESCE(p_reason, 'Ləğv edildi'), p_items, v_now);

  UPDATE public.orders SET
    total_amount = GREATEST(0, (SELECT COALESCE(SUM(total_price), 0) FROM public.order_items WHERE order_id = p_order_id::uuid AND kitchen_status != 'voided'))
  WHERE id = p_order_id::uuid;

  IF NOT EXISTS (SELECT 1 FROM public.order_items WHERE order_id = p_order_id::uuid AND kitchen_status != 'voided') THEN
    UPDATE public.orders SET status = 'cancelled', kitchen_status = 'cancelled', cancelled_at = v_now WHERE id = p_order_id::uuid;
  END IF;

  PERFORM public.log_audit(
    'void_items', 'order', p_order_id,
    p_performed_by, v_performer_name, NULL,
    jsonb_build_object('items', p_items, 'reason', p_reason, 'voided', v_voided, 'blocked', array_length(v_blocked, 1)),
    jsonb_build_object('order_id', p_order_id), NULL
  );

  -- ═══ P-6 D-4 (ratified 2026-09-13): void is an order mutation — broadcast it. ═══
  IF v_voided > 0 THEN
    PERFORM public.emit_outbox_event(
      'order', p_order_id::uuid, 'order.status_changed',
      jsonb_build_object('old_status', v_order.status,
                         'new_status', (SELECT status FROM public.orders WHERE id = p_order_id::uuid),
                         'reason', 'void', 'voided_items', v_voided,
                         'performed_by', p_performed_by)
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true, 'action', 'void',
    'voided_items', v_voided,
    'blocked_items', to_jsonb(v_blocked),
    'order_id', p_order_id, 'timestamp', v_now
  );
END;
$function$;

-- ═══ D-5: freeze dead void_payment_atomic_v2 (stale status guard, no route) ═══
REVOKE EXECUTE ON FUNCTION public.void_payment_atomic_v2(p_order_id text, p_items jsonb, p_performed_by uuid, p_performed_by_terminal_id text, p_reason text) FROM service_role, test_rls_role;

-- ═══ D-6: freeze dead refund_payment_atomic (status='success' not in registry, no route) ═══
REVOKE EXECUTE ON FUNCTION public.refund_payment_atomic(p_order_id uuid, p_amount numeric, p_method text, p_reason text, p_performed_by uuid, p_cash_drawer_session_id uuid) FROM authenticated, service_role, test_rls_role;

-- ═══ D-1 (cont): the legacy 4-arg overload has NO authorization — freeze it to
-- postgres-ops only (a bare PostgREST service_role call must not bypass D-1).
-- The route uses the 5-arg (token) form; postgres keeps the 4-arg form for ops.
REVOKE EXECUTE ON FUNCTION public.reopen_order_atomic(p_order_id uuid, p_reason text, p_performed_by uuid, p_performed_by_terminal_id text) FROM anon, authenticated, service_role, test_rls_role;

-- ═══ D-1 (cont): the new 5-arg form is PUBLIC by default (anon=X) — anon must
-- not be able to even reach a destructive full-reversal RPC (it will fail the
-- token auth, but P-5 D-2 class says anon should not hold EXECUTE). Revoke anon;
-- keep postgres/authenticated/service_role (service_role is the route's caller).
REVOKE EXECUTE ON FUNCTION public.reopen_order_atomic(text, uuid, text, uuid, text) FROM PUBLIC, anon;

COMMIT;