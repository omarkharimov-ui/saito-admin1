-- ============================================================================
-- 20260911000035 — K / G3 (part 2): revoke unguarded KDS item fns + canonical
--                  forward-sequence/hold hardening
--
-- USER-FROZEN CONTRACT (K gate G3, confirmed): all live KDS item mutations go
-- through the canonical family (item_kitchen_step forward +
-- item_kitchen_terminal from 034). The unguarded item fns become
-- service-role-only (server path) and are de-duplicated from the live routes
-- in the same commit.
--
-- CALLER SWEEP (done, 2026-09-11):
--   - DB: none of the unguarded fns is referenced by any other function
--     (verified: 16/16 NONE).
--   - src: live callers = the K routes being rewired now (kitchen/cancel,
--     kitchen/recall, kitchen/void-comp-waste, orders/mark-ready,
--     orders/waste, orders/item-hold, orders/return-to-stock); browser
--     callers in kitchen/page.tsx use the anon client -> 42501 (dead no-ops,
--     G7 rewires them to the server routes).
--   - cron: none.
--
-- Also:
--   (1) item_kitchen_step forward check: the old hard-coded linear chain
--       (pending->sent->accepted->preparing->ready->served->completed)
--       rejected registry-VALID edges (pending->ready, reserved->sent, etc.).
--       Replace with a registry-aligned source whitelist (forward-only, no
--       skip of the producing step), so the canonical path matches the
--       frozen item machine instead of contradicting it.
--   (2) item_set_hold: token-first hold wrapper (kitchen.manage + location),
--       idempotent, audit — canonical for the is_hold flag (toggle_item_hold
--       has no authz at all).
--   (3) item_kitchen_terminal 'recalled' action: the registry has no
--       ->recalled edges (recall = send-back-to-pending in this schema,
--       cf. frozen recall_ticket_atomic). The 'recalled' action therefore
--       targets 'pending' (valid edge from accepted/sent/preparing/ready/
--       served/reserved/hot/recalled, perm kitchen.manage) and records
--       action='recalled' in audit/outbox metadata.
--
-- GOLDEN RULE 5: auto-commit.
-- ============================================================================

-- ---- 1. item_kitchen_step: registry-aligned forward whitelist ----
DROP FUNCTION IF EXISTS public.item_kitchen_step(text, uuid, text, text, jsonb, uuid);
CREATE OR REPLACE FUNCTION public.item_kitchen_step(p_token text, p_item_id uuid, p_target text, p_reason text, p_metadata jsonb, p_correlation_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_staff_id uuid;
  v_order RECORD;
  v_item RECORD;
  v_rule jsonb;
  v_allowed jsonb;
  v_updated RECORD;
  v_corr uuid := COALESCE(p_correlation_id, gen_random_uuid());
  v_op text := 'order_item.' || p_target;
  v_event text;
  v_ok_from text[];
BEGIN
  PERFORM set_session_staff(p_token);
  v_staff_id := current_staff_id();

  -- lock order row first (consistent lock ordering with terminal fn)
  SELECT o.id, o.status, o.location_id, o.organization_id
    INTO v_order
    FROM orders o
    JOIN order_items i ON i.order_id = o.id
   WHERE i.id = p_item_id
   FOR UPDATE OF o;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ITEM_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_item FROM order_items WHERE id = p_item_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ITEM_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  -- idempotent re-entry: already at target → success noop
  IF v_item.kitchen_status = p_target THEN
    RETURN jsonb_build_object('success', true, 'idempotent', true,
      'order_item_id', p_item_id, 'from_status', v_item.kitchen_status,
      'to_status', p_target, 'correlation_id', v_corr);
  END IF;

  IF v_order.status IN ('paid','cancelled','closed') THEN
    RAISE EXCEPTION 'ORDER_FINALIZED: use refund/reversal workflow for paid orders'
      USING ERRCODE = 'P0001';
  END IF;

  -- K-G3: registry-aligned FORWARD whitelist (no skip of the producing step,
  -- no backward). Matches the frozen item machine's ->target edges:
  CASE p_target
    WHEN 'sent'      THEN v_ok_from := ARRAY['pending','reserved'];
    WHEN 'accepted'  THEN v_ok_from := ARRAY['sent'];
    WHEN 'preparing' THEN v_ok_from := ARRAY['accepted','reserved'];
    WHEN 'ready'     THEN v_ok_from := ARRAY['preparing','accepted','sent','pending','reserved','recalled','bar','hot','sushi'];
    WHEN 'served'    THEN v_ok_from := ARRAY['ready'];
    WHEN 'completed' THEN v_ok_from := ARRAY['served'];
    ELSE
      RAISE EXCEPTION 'UNKNOWN_TARGET: % (forward targets: sent, accepted, preparing, ready, served, completed)', p_target
        USING ERRCODE = 'P0001';
  END CASE;
  IF NOT (v_item.kitchen_status = ANY(v_ok_from)) THEN
    RAISE EXCEPTION 'INVALID_ITEM_TRANSITION: % → % not allowed on canonical path (corrections via terminal/recall workflow)',
      v_item.kitchen_status, p_target USING ERRCODE='P0001';
  END IF;

  -- registry check (also re-validated by the trigger)
  v_rule := validate_transition('item', v_item.kitchen_status, p_target);
  IF NOT (v_rule->>'valid')::boolean THEN
    RAISE EXCEPTION 'INVALID_ITEM_TRANSITION: % → % (%)',
      v_item.kitchen_status, p_target, v_rule->>'error' USING ERRCODE='P0001';
  END IF;

  v_allowed := authorize(
    p_token,
    COALESCE(v_rule->>'requires_permission', 'kitchen.manage'),
    v_order.location_id
  );
  IF NOT (v_allowed->>'allowed')::boolean THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: % → % requires [%] at % (reason: %)',
      v_item.kitchen_status, p_target,
      COALESCE(v_rule->>'requires_permission','kitchen.manage'),
      v_order.location_id, v_allowed->>'reason' USING ERRCODE='P0001';
  END IF;

  UPDATE order_items SET
    kitchen_status = p_target,
    updated_at = now()
  WHERE id = p_item_id
  RETURNING id, kitchen_status, sent_at, accepted_at, started_at, ready_at, served_at, completed_at
  INTO v_updated;

  PERFORM log_order_event(v_order.id, 'kitchen_status_changed',
    jsonb_build_object('item', p_item_id, 'from_status', v_item.kitchen_status),
    jsonb_build_object('item', p_item_id, 'to_status', p_target),
    jsonb_build_object('reason', p_reason, 'correlation_id', v_corr),
    v_staff_id, NULL, NULL, NULL);

  INSERT INTO operation_logs (
    operation, order_id, performed_by, reason, old_state, new_state,
    location_id, organization_id, metadata
  ) VALUES (
    v_op, v_order.id, v_staff_id, p_reason,
    jsonb_build_object('kitchen_status', v_item.kitchen_status),
    jsonb_build_object('kitchen_status', p_target),
    v_order.location_id, v_order.organization_id,
    jsonb_build_object('idempotency_key', NULL, 'correlation_id', v_corr)
  );

  INSERT INTO outbox_events (aggregate_type, aggregate_id, event_type, payload, status)
  VALUES ('order_item', p_item_id, v_op,
    jsonb_build_object('order_id', v_order.id, 'item_id', p_item_id,
      'from_status', v_item.kitchen_status, 'to_status', p_target,
      'reason', p_reason, 'performed_by', v_staff_id, 'correlation_id', v_corr,
      'location_id', v_order.location_id),
    'pending');

  RETURN jsonb_build_object('success', true, 'idempotent', false,
    'order_item_id', v_updated.id, 'from_status', v_item.kitchen_status,
    'to_status', v_updated.kitchen_status,
    'correlation_id', v_corr);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.item_kitchen_step(text, uuid, text, text, jsonb, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.item_kitchen_step(text, uuid, text, text, jsonb, uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.item_kitchen_step(text, uuid, text, text, jsonb, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.item_kitchen_step(text, uuid, text, text, jsonb, uuid) TO service_role;

-- ---- 2. item_set_hold — token-first hold (kitchen.manage + location) ----
CREATE OR REPLACE FUNCTION public.item_set_hold(p_token text, p_item_id uuid, p_is_hold boolean, p_reason text, p_metadata jsonb, p_correlation_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_staff_id uuid;
  v_order RECORD;
  v_item RECORD;
  v_corr uuid := COALESCE(p_correlation_id, gen_random_uuid());
  v_allowed jsonb;
BEGIN
  PERFORM set_session_staff(p_token);
  v_staff_id := current_staff_id();

  SELECT o.id, o.status, o.location_id, o.organization_id
    INTO v_order
    FROM orders o JOIN order_items i ON i.order_id = o.id
   WHERE i.id = p_item_id FOR UPDATE OF o;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ITEM_NOT_FOUND' USING ERRCODE='P0001';
  END IF;
  IF v_order.status IN ('paid','cancelled','closed') THEN
    RAISE EXCEPTION 'ORDER_FINALIZED: use refund/reversal workflow' USING ERRCODE='P0001';
  END IF;
  SELECT * INTO v_item FROM order_items WHERE id = p_item_id FOR UPDATE;

  -- idempotent
  IF v_item.is_hold = p_is_hold THEN
    RETURN jsonb_build_object('success', true, 'idempotent', true, 'is_hold', v_item.is_hold, 'correlation_id', v_corr);
  END IF;

  v_allowed := authorize(p_token, 'kitchen.manage', v_order.location_id);
  IF NOT (v_allowed->>'allowed')::boolean THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: hold requires [kitchen.manage] at % (reason: %)',
      v_order.location_id, v_allowed->>'reason' USING ERRCODE='P0001';
  END IF;

  UPDATE order_items SET is_hold = p_is_hold,
    hold_until = CASE WHEN p_is_hold THEN now() ELSE NULL END,
    updated_at = now()
  WHERE id = p_item_id;

  PERFORM log_order_event(v_order.id, 'item_hold_changed',
    jsonb_build_object('item', p_item_id, 'is_hold', v_item.is_hold),
    jsonb_build_object('item', p_item_id, 'is_hold', p_is_hold),
    jsonb_build_object('reason', p_reason, 'correlation_id', v_corr),
    v_staff_id, NULL, NULL, NULL);

  INSERT INTO outbox_events (aggregate_type, aggregate_id, event_type, payload, status)
  VALUES ('order_item', p_item_id, 'order_item.hold',
    jsonb_build_object('order_id', v_order.id, 'item_id', p_item_id, 'is_hold', p_is_hold,
      'performed_by', v_staff_id, 'correlation_id', v_corr, 'location_id', v_order.location_id),
    'pending');

  RETURN jsonb_build_object('success', true, 'idempotent', false, 'is_hold', p_is_hold, 'correlation_id', v_corr);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.item_set_hold(text, uuid, boolean, text, jsonb, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.item_set_hold(text, uuid, boolean, text, jsonb, uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.item_set_hold(text, uuid, boolean, text, jsonb, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.item_set_hold(text, uuid, boolean, text, jsonb, uuid) TO service_role;

-- ---- 3. REVOKE unguarded KDS item fns: anon + authenticated -> service_role only ----
REVOKE EXECUTE ON FUNCTION public.mark_item_ready_atomic(uuid, uuid[], uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.mark_item_ready_atomic(uuid, uuid[], uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.mark_order_ready(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.mark_order_ready(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.mark_order_completed(uuid, uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.mark_order_completed(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.mark_order_all_served(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.mark_order_all_served(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.prepare_order_items(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.prepare_order_items(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.void_order_item_atomic(uuid, text, uuid, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.void_order_item_atomic(uuid, text, uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.comp_order_item_atomic(uuid, text, uuid, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.comp_order_item_atomic(uuid, text, uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.waste_order_item_atomic(uuid, text, uuid, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.waste_order_item_atomic(uuid, text, uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.cancel_order_items(uuid, jsonb) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.cancel_order_items(uuid, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.cancel_ticket_atomic(uuid, text, uuid, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.cancel_ticket_atomic(uuid, text, uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.recall_ticket_atomic(uuid, text, uuid, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.recall_ticket_atomic(uuid, text, uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.accept_kitchen_ticket_atomic(uuid, uuid, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.accept_kitchen_ticket_atomic(uuid, uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.reopen_kitchen_ticket_atomic(uuid, uuid, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.reopen_kitchen_ticket_atomic(uuid, uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.send_to_kitchen_atomic(uuid, uuid, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.send_to_kitchen_atomic(uuid, uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.send_to_kitchen_atomic(uuid, uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.send_to_kitchen_atomic(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.route_kitchen_order(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.route_kitchen_order(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.assign_order_staff(uuid, uuid, uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.assign_order_staff(uuid, uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_order_item_status(uuid, text, integer) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.update_order_item_status(uuid, text, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.toggle_item_hold(uuid, boolean, uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.toggle_item_hold(uuid, boolean, uuid) FROM anon;

-- canonical server path keeps EXECUTE
GRANT EXECUTE ON FUNCTION public.mark_item_ready_atomic(uuid, uuid[], uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_order_ready(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_order_completed(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_order_all_served(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.prepare_order_items(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.void_order_item_atomic(uuid, text, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.comp_order_item_atomic(uuid, text, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.waste_order_item_atomic(uuid, text, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.cancel_order_items(uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.cancel_ticket_atomic(uuid, text, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.recall_ticket_atomic(uuid, text, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.accept_kitchen_ticket_atomic(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.reopen_kitchen_ticket_atomic(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.send_to_kitchen_atomic(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.send_to_kitchen_atomic(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.route_kitchen_order(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.assign_order_staff(uuid, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.update_order_item_status(uuid, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.toggle_item_hold(uuid, boolean, uuid) TO service_role;

-- ---- fail-safe: no anon/authenticated EXECUTE left on the unguarded set ----
DO $$
DECLARE
  v_left integer;
BEGIN
  SELECT count(*) INTO v_left FROM pg_proc p
  WHERE p.pronamespace='public'::regnamespace
    AND (has_function_privilege('anon',p.oid,'EXECUTE') OR has_function_privilege('authenticated',p.oid,'EXECUTE'))
    AND p.proname IN ('mark_item_ready_atomic','mark_order_ready','mark_order_completed','mark_order_all_served',
      'prepare_order_items','void_order_item_atomic','comp_order_item_atomic','waste_order_item_atomic',
      'cancel_order_items','cancel_ticket_atomic','recall_ticket_atomic','accept_kitchen_ticket_atomic',
      'reopen_kitchen_ticket_atomic','send_to_kitchen_atomic','route_kitchen_order','assign_order_staff',
      'update_order_item_status','toggle_item_hold','item_kitchen_step','item_set_hold');
  IF v_left <> 0 THEN
    RAISE EXCEPTION 'K-G3 FAIL-SAFE: % KDS entry point(s) still anon/authenticated-executable', v_left;
  END IF;
  IF NOT has_function_privilege('service_role','public.item_kitchen_step(text, uuid, text, text, jsonb, uuid)','EXECUTE')
     OR NOT has_function_privilege('service_role','public.item_set_hold(text, uuid, boolean, text, jsonb, uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'K-G3 FAIL-SAFE: service_role lost EXECUTE on canonical K entry points';
  END IF;
END;
$$;
