-- ============================================================================
-- 20260911000028 — O / G1: live order-transition path → transition_order_atomic
--                  (superset) + token-first cancel_loss_table/delivery + drop old
--
-- USER-FROZEN CONTRACT (O gate G1(a), confirmed):
--   "Live path transition_order_atomic-a keçirilir. p_token session-dan,
--    identity yalnız current_staff_id()-dən. Köhnə transition_order_status
--    deprecate/drop edilir yalnız bütün caller sweep + unreachable proof-dan sonra."
--
-- EVIDENCE / WHY (real DB jbxmlnsicbfkbsatnoej + source):
--   * GOLDEN `transition_order_atomic(p_token, p_order_id, p_new_status, p_reason,
--     p_metadata)` already does: set_session_staff -> current_staff_id -> FOR UPDATE
--     -> validate_transition -> authorize(token, requires_permission, order.location_id)
--     -> manager-override gate -> atomic UPDATE -> audit(order_events+audit_logs+
--     operation_logs) -> outbox. It had ZERO callers (dead code) — the LIVE path was
--     the unguarded `transition_order_status` (no perm/loc, spoofable performed_by).
--   * But the golden atomic did NOT do the kitchen_status sync / kitchen_schedule /
--     floor(transition_table_status) updates that the old live path did. So it must
--     become a SUPERSER (auth + kitchen + floor) or switching to it would regress
--     the KDS/floor display.
--   * `cancel_loss_table` (finance/loss route, LIVE) internally called
--     transition_order_status(id,'cancelled') — rewired to token-first here.
--   * `transition_delivery_status` was the same O-01 class (no auth, caller-supplied
--     performed_by, `authenticated` EXECUTE) and was missed in G2 — token-first here.
--     (Delivery machine has no requires_permission rows — display status — so token
--     identity only, no perm gate.)
--   * CALLER SWEEP for old `transition_order_status` (before DROP):
--       (1) /api/rpc/transition_order_status route  -> rewired (see route.ts edit)
--       (2) cancel_loss_table (internal)            -> rewired here
--       (3) useOrderStateMachine -> calls the ROUTE URL (unchanged; route now forwards)
--     No other source or DB references. Old fn DROPped at the end.
--
-- GOLDEN RULE 5: auto-commit.
-- ============================================================================

-- ---- 1. transition_order_atomic = SUPERSET (auth + kitchen + floor) ----
-- The existing overload carries parameter defaults that CREATE OR REPLACE cannot
-- remove — drop it first (same signature; this is a body+behavior upgrade).
DROP FUNCTION IF EXISTS public.transition_order_atomic(text, uuid, text, text, jsonb);
CREATE OR REPLACE FUNCTION public.transition_order_atomic(p_token text, p_order_id uuid, p_new_status text, p_reason text DEFAULT NULL, p_metadata jsonb DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_allowed jsonb;
  v_rule jsonb;
  v_order RECORD;
  v_old_status text;
  v_old_kitchen text;
  v_staff_id uuid;
  v_table_number int;
  v_current_table_status text;
  v_target_table_status text;
  v_approver_key text;
  v_has_approver boolean := false;
  v_overr boolean := false;
BEGIN
  -- 1. AUTH (identity ONLY from the session token)
  PERFORM set_session_staff(p_token);
  v_staff_id := current_staff_id();

  -- 2. Lock order
  SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND' USING ERRCODE='P0001';
  END IF;

  v_old_status  := v_order.status;
  v_old_kitchen := v_order.kitchen_status;
  v_table_number := v_order.table_number;

  IF v_old_status IS DISTINCT FROM p_new_status THEN
    -- 3. TRANSITION VALIDATION (registry = source of truth)
    v_rule := validate_transition('order', v_old_status, p_new_status);
    IF NOT (v_rule->>'valid')::boolean THEN
      RAISE EXCEPTION 'INVALID_TRANSITION: %', v_rule->>'error' USING ERRCODE='P0001';
    END IF;

    -- 4. AUTHORIZATION (session + staff + org + location-scope permission)
    v_allowed := authorize(
      p_token,
      COALESCE(v_rule->>'requires_permission', 'orders.edit'),
      v_order.location_id
    );
    IF NOT (v_allowed->>'allowed')::boolean THEN
      RAISE EXCEPTION 'PERMISSION_DENIED: % → % requires [%] at location % (reason: %)',
        v_old_status, p_new_status,
        COALESCE(v_rule->>'requires_permission','orders.edit'),
        v_order.location_id, v_allowed->>'reason' USING ERRCODE='P0001';
    END IF;

    -- 5. MANAGER OVERRIDE GATE
    IF COALESCE(v_rule->>'requires_manager_override','false')::boolean THEN
      v_approver_key := CASE WHEN COALESCE(v_rule->>'requires_permission','') LIKE '%refund%'
                             THEN 'refund.approve' ELSE 'void.approve' END;
      v_has_approver := COALESCE((SELECT has_permission(v_staff_id, v_approver_key)), false);
      IF NOT v_has_approver THEN
        SELECT EXISTS(
          SELECT 1 FROM manager_overrides mo
          WHERE mo.requested_by = v_staff_id
            AND mo.permission = COALESCE(v_rule->>'requires_permission','orders.edit')
            AND mo.location_id = v_order.location_id
            AND mo.status = 'APPROVED'
            AND mo.expires_at > now()
        ) INTO v_overr;
        IF NOT v_overr THEN
          RAISE EXCEPTION 'MANAGER_OVERRIDE_REQUIRED: % → % (approver perm [%])',
            v_old_status, p_new_status, v_approver_key USING ERRCODE='P0001';
        END IF;
      END IF;
    END IF;

    -- 6. ATOMIC UPDATE (guard trigger re-validates + sets canonical timestamps)
    UPDATE orders SET
      status = p_new_status,
      version = COALESCE(version, 0) + 1,
      updated_at = now()
    WHERE id = p_order_id;

    -- 6a. kitchen_status sync (superset parity with the old live path)
    CASE p_new_status
      WHEN 'in_kitchen' THEN
        UPDATE orders SET kitchen_status = 'preparing' WHERE id = p_order_id AND kitchen_status IS DISTINCT FROM 'preparing';
      WHEN 'ready' THEN
        UPDATE orders SET kitchen_status = 'ready' WHERE id = p_order_id;
      WHEN 'served' THEN
        UPDATE orders SET kitchen_status = 'completed' WHERE id = p_order_id;
      WHEN 'paid','closed' THEN
        UPDATE orders SET kitchen_status = 'completed' WHERE id = p_order_id AND kitchen_status NOT IN ('completed','cancelled');
      WHEN 'cancelled' THEN
        UPDATE orders SET kitchen_status = 'cancelled' WHERE id = p_order_id AND kitchen_status IS DISTINCT FROM 'cancelled';
      ELSE NULL;
    END CASE;

    -- 6b. kitchen_schedule parity (delete on terminal, insert on in_kitchen)
    IF p_new_status IN ('paid','closed','cancelled') THEN
      DELETE FROM public.kitchen_schedule WHERE order_id = p_order_id;
    ELSIF p_new_status = 'in_kitchen' THEN
      INSERT INTO public.kitchen_schedule (order_id, table_number, status, created_at, updated_at)
      SELECT p_order_id, v_table_number, 'preparing', NOW(), NOW()
      WHERE v_table_number IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM public.kitchen_schedule WHERE order_id = p_order_id);
    END IF;

    -- 6c. floor sync (order status -> table status), guarded like the old path
    IF v_table_number IS NOT NULL AND v_table_number > 0 THEN
      SELECT status INTO v_current_table_status FROM table_floors WHERE table_number = v_table_number;
      CASE p_new_status
        WHEN 'new' THEN v_target_table_status := 'ordering';
        WHEN 'confirmed' THEN v_target_table_status := 'ordering';
        WHEN 'in_kitchen' THEN v_target_table_status := 'in_kitchen';
        WHEN 'partially_ready' THEN v_target_table_status := 'in_kitchen';
        WHEN 'ready' THEN v_target_table_status := 'ready';
        WHEN 'served' THEN v_target_table_status := 'dining';
        WHEN 'payment_pending' THEN v_target_table_status := 'bill_requested';
        WHEN 'paid' THEN v_target_table_status := 'payment_pending';
        WHEN 'closed' THEN v_target_table_status := 'cleaning';
        WHEN 'cancelled' THEN v_target_table_status := 'empty';
        ELSE v_target_table_status := NULL;
      END CASE;
      IF v_target_table_status IS NOT NULL AND v_current_table_status IS DISTINCT FROM v_target_table_status THEN
        BEGIN
          PERFORM transition_table_status(
            v_table_number, v_target_table_status, v_staff_id,
            NULL, p_reason, p_metadata, NULL, NULL, NULL
          );
        EXCEPTION WHEN OTHERS THEN
          INSERT INTO audit_logs (table_name, record_id, action, old_data, new_data, performed_by, created_at)
          SELECT 'table_floors', tf.id, 'status_change_failed',
            jsonb_build_object('status', v_current_table_status),
            jsonb_build_object('status', v_target_table_status, 'error', SQLERRM),
            v_staff_id, now()
          FROM table_floors tf WHERE tf.table_number = v_table_number;
        END;
      END IF;
    END IF;
  END IF;

  -- 7. AUDIT + 8. OUTBOX (only when status actually changed)
  IF v_old_status IS DISTINCT FROM p_new_status THEN
    PERFORM log_order_event(
      p_order_id, 'status_changed',
      jsonb_build_object('status', v_old_status, 'kitchen_status', v_old_kitchen),
      jsonb_build_object('status', p_new_status, 'kitchen_status',
        (SELECT kitchen_status FROM orders WHERE id = p_order_id),
        'reason', p_reason),
      COALESCE(p_metadata, '{}'::jsonb),
      v_staff_id, NULL, NULL, NULL
    );

    INSERT INTO audit_logs (table_name, record_id, action, old_data, new_data, performed_by, created_at)
    VALUES ('orders', p_order_id, 'order.transition',
      jsonb_build_object('status', v_old_status),
      jsonb_build_object('status', p_new_status, 'reason', p_reason),
      v_staff_id, now());

    INSERT INTO operation_logs (operation, order_id, performed_by, reason, old_state, new_state,
                                location_id, organization_id, metadata)
    VALUES ('order.transition', p_order_id, v_staff_id, p_reason,
      jsonb_build_object('status', v_old_status),
      jsonb_build_object('status', p_new_status),
      v_order.location_id, v_order.organization_id,
      jsonb_build_object('reopened', p_new_status IN ('new','open','confirmed','in_kitchen') AND v_old_status NOT IN ('new','open','confirmed','in_kitchen')));

    INSERT INTO outbox_events (aggregate_type, aggregate_id, event_type, payload, status)
    VALUES ('order', p_order_id, 'order.status_changed',
      jsonb_build_object('old_status', v_old_status, 'new_status', p_new_status,
                         'reason', p_reason, 'performed_by', v_staff_id),
      'pending');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'order_id', p_order_id,
    'old_status', v_old_status,
    'new_status', p_new_status,
    'kitchen_status', (SELECT kitchen_status FROM orders WHERE id = p_order_id)
  );
END;
$$;

-- ---- 2. transition_delivery_status -> token-first (identity from session) ----
-- Delivery machine has NO requires_permission (display status), so no perm gate;
-- but caller-supplied p_performed_by is no longer the identity source.
-- Drop the old (default-carrying) overload first — CREATE OR REPLACE cannot
-- remove parameter defaults.
DROP FUNCTION IF EXISTS public.transition_delivery_status(uuid, text, uuid, text, uuid, text, text, jsonb);
CREATE OR REPLACE FUNCTION public.transition_delivery_status(p_token text, p_order_id uuid, p_new_status text, p_courier_id uuid, p_courier_name text, p_performed_by_terminal_id text, p_metadata jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order RECORD;
  v_validation jsonb;
  v_old_delivery_status TEXT;
  v_staff_id uuid;
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
    v_staff_id
  );

  RETURN jsonb_build_object(
    'success', true,
    'order_id', p_order_id,
    'old_delivery_status', v_old_delivery_status,
    'new_delivery_status', p_new_status
  );
END;
$$;

-- ---- 3. cancel_loss_table -> token-first (orders.cancel + location) ----
CREATE OR REPLACE FUNCTION public.cancel_loss_table(p_token text, p_table_number integer, p_reason text, p_reason_text text, p_total_amount numeric, p_items jsonb, p_performed_by uuid, p_terminal_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_staff_id uuid;
  v_sess_loc uuid;
  v_table RECORD;
  v_order_ids uuid[];
  v_order_id  uuid;
BEGIN
  PERFORM set_session_staff(p_token);
  v_staff_id := current_staff_id();
  v_sess_loc := nullif(current_setting('app.current_location_id', true), '')::uuid;
  IF v_staff_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'FORBIDDEN');
  END IF;
  IF NOT coalesce(has_permission(v_staff_id, 'orders.cancel'), false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'PERMISSION_DENIED');
  END IF;

  SELECT * INTO v_table FROM public.table_floors
    WHERE table_number = p_table_number AND (v_sess_loc IS NULL OR location_id = v_sess_loc) FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'TABLE_NOT_FOUND');
  END IF;
  IF NOT has_location_access(v_table.location_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'FORBIDDEN_LOCATION');
  END IF;

  INSERT INTO public.cancelled_orders (order_id, table_number, reason, reason_text, total_amount, items, created_at)
  SELECT o.id, p_table_number, p_reason, COALESCE(p_reason_text, p_reason), p_total_amount, p_items, now()
  FROM public.orders o
  WHERE o.table_number = p_table_number
    AND o.location_id = v_table.location_id
    AND o.status NOT IN ('paid', 'cancelled')
  RETURNING order_id INTO v_order_ids;

  FOREACH v_order_id IN ARRAY v_order_ids LOOP
    -- items -> cancelled (item machine allows every non-cancelled -> cancelled)
    UPDATE public.order_items
    SET kitchen_status = 'cancelled', updated_at = now()
    WHERE order_id = v_order_id AND kitchen_status IS DISTINCT FROM 'cancelled';

    -- order -> cancelled via the canonical permissioned+locationed atomic (re-authz is
    -- safe: same location, and the actor holds orders.cancel). Token carried through.
    PERFORM public.transition_order_atomic(p_token, v_order_id, 'cancelled', p_reason,
      jsonb_build_object('source','cancel_loss_table','table_number', p_table_number));
  END LOOP;

  UPDATE public.table_floors
  SET status = 'empty',
      guest_count = NULL,
      reservation_id = NULL, reservation_name = NULL, reservation_phone = NULL, reservation_time = NULL,
      merged_into_table = NULL,
      current_order_id = NULL,
      has_pending = false, oldest_pending_at = NULL,
      updated_at = now(),
      updated_by_terminal_id = p_terminal_id
  WHERE table_number = p_table_number;

  PERFORM public.log_audit(
    'loss_table_cancelled', NULL, NULL, v_staff_id,
    NULL, NULL, NULL, NULL,
    jsonb_build_object('table_number', p_table_number, 'reason', p_reason, 'orders_cancelled', coalesce(array_length(v_order_ids,1),0)),
    NULL, NULL, NULL, NULL
  );

  RETURN jsonb_build_object('success', true, 'orders_cancelled', coalesce(array_length(v_order_ids,1),0));
END;
$$;

-- ---- 4. ACL: revoke `authenticated` on the token-first delivery fn (G2 gap) +
--         ensure service_role can call the new/changed entry points ----
REVOKE EXECUTE ON FUNCTION public.transition_delivery_status(text, uuid, text, uuid, text, text, jsonb) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.cancel_loss_table(text, integer, text, text, numeric, jsonb, uuid, text) FROM authenticated;

GRANT EXECUTE ON FUNCTION public.transition_order_atomic(text, uuid, text, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.transition_delivery_status(text, uuid, text, uuid, text, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.cancel_loss_table(text, integer, text, text, numeric, jsonb, uuid, text) TO service_role;

-- ---- 5. DROP old unguarded overloads (all callers rewired above) ----
DROP FUNCTION IF EXISTS public.transition_order_status(uuid, text, uuid, text, text, jsonb, text, text);
DROP FUNCTION IF EXISTS public.transition_delivery_status(uuid, text, uuid, text, uuid, text, text, jsonb);
DROP FUNCTION IF EXISTS public.cancel_loss_table(integer, text, text, numeric, jsonb, uuid);

-- ---- 6. fail-safe: the canonical entry points exist + service_role has EXECUTE ----
DO $$
BEGIN
  IF NOT (SELECT exists(SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='transition_order_atomic'
        AND pg_get_function_identity_arguments(oid)='p_token text, p_order_id uuid, p_new_status text, p_reason text, p_metadata jsonb'))
    OR NOT has_function_privilege('service_role','public.transition_order_atomic(text, uuid, text, text, jsonb)','EXECUTE')
    OR NOT has_function_privilege('service_role','public.cancel_loss_table(text, integer, text, text, numeric, jsonb, uuid, text)','EXECUTE')
  THEN
    RAISE EXCEPTION 'G1 FAIL-SAFE: canonical transition/cancel entry point missing or service_role lost EXECUTE';
  END IF;
  IF (SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='transition_order_status') <> 0 THEN
    RAISE EXCEPTION 'G1 FAIL-SAFE: old unguarded transition_order_status still present';
  END IF;
END;
$$;
