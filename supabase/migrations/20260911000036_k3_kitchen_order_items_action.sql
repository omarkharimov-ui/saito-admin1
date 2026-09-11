-- ============================================================================
-- 20260911000036 — K / G3 (part 3): canonical ORDER-level KDS fan-out
--
-- kitchen/cancel + kitchen/recall operate on an ORDER (all its items), not a
-- single item. The legacy cancel_ticket_atomic / recall_ticket_atomic were
-- unguarded (validate_actor only, no permission, no location) and wrote the
-- order's kitchen_status by hand. Replace with a canonical fan-out that
-- reuses the per-item canonical action (item_kitchen_terminal) so every item
-- gets the same permission + location + idempotency + finalized-guard +
-- audit + outbox treatment.
--
--   kitchen_order_items_action(p_token, p_order_id, p_action, p_reason, p_corr)
--     p_action = 'cancel' | 'recall'
--     - cancel: each item -> cancelled (item_kitchen_terminal 'cancelled')
--     - recall: each item -> pending  (registry recall = send-back-to-pending;
--                action logged as 'recall')
--   Order-level kitchen_status is recomputed by the frozen trigger
--   trg_sync_order_kitchen_status after each item update (no manual write).
--
-- PERMISSION (K gate G3 model):
--   cancel (whole ticket) = order.void (management) — the item cancelled edges
--   carry order.void in the frozen registry; the order-level op inherits it.
--   recall = kitchen.manage (kitchen can send items back).
-- Enforced per-item by item_kitchen_terminal via the registry (authorize uses
-- the edge's requires_permission + location). No client performed_by.
--
-- CALLER SWEEP: cancel_ticket_atomic / recall_ticket_atomic referenced only by
-- /api/kitchen/cancel + /api/kitchen/recall (both being rewired); 0 DB callers.
--
-- GOLDEN RULE 5: auto-commit.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.kitchen_order_items_action(p_token text, p_order_id uuid, p_action text, p_reason text, p_correlation_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_staff_id uuid;
  v_order RECORD;
  v_perm text;
  v_allowed jsonb;
  v_item_ids uuid[];
  v_item_id uuid;
  v_done int := 0;
  v_denied int := 0;
  v_finalized int := 0;
  v_idem int := 0;
BEGIN
  IF p_action NOT IN ('cancel','recall') THEN
    RAISE EXCEPTION 'UNKNOWN_ACTION: % (allowed: cancel, recall)', p_action USING ERRCODE='P0001';
  END IF;
  v_perm := CASE p_action WHEN 'cancel' THEN 'order.void' ELSE 'kitchen.manage' END;

  -- identity + order lock
  PERFORM set_session_staff(p_token);
  v_staff_id := current_staff_id();
  SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND' USING ERRCODE='P0001';
  END IF;

  -- order-level permission + location gate (fast fail, then per-item re-check)
  v_allowed := authorize(p_token, v_perm, v_order.location_id);
  IF NOT (v_allowed->>'allowed')::boolean THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: order % % requires [%] at % (reason: %)',
      p_order_id, p_action, v_perm, v_order.location_id, v_allowed->>'reason' USING ERRCODE='P0001';
  END IF;

  -- target items (not already terminal)
  IF p_action = 'cancel' THEN
    SELECT array_agg(id) INTO v_item_ids FROM order_items
      WHERE order_id = p_order_id AND kitchen_status NOT IN ('cancelled','voided','comped','wasted');
  ELSE
    SELECT array_agg(id) INTO v_item_ids FROM order_items
      WHERE order_id = p_order_id AND kitchen_status NOT IN ('pending','cancelled','voided','comped','wasted');
  END IF;

  IF v_item_ids IS NULL OR array_length(v_item_ids,1) IS NULL THEN
    RETURN jsonb_build_object('success', true, 'order_id', p_order_id, 'action', p_action,
      'cancelled', 0, 'done', 0, 'note', 'no target items');
  END IF;

  FOREACH v_item_id IN ARRAY v_item_ids LOOP
    BEGIN
      IF p_action = 'cancel' THEN
        PERFORM item_kitchen_terminal(p_token, v_item_id, 'cancelled', p_reason, NULL, p_correlation_id);
      ELSE
        -- recall = send-back-to-pending (terminal fn maps 'recalled' -> pending)
        PERFORM item_kitchen_terminal(p_token, v_item_id, 'recalled', p_reason, NULL, p_correlation_id);
      END IF;
      v_done := v_done + 1;
    EXCEPTION WHEN SQLSTATE 'P0001' THEN
      IF SQLERRM LIKE 'ORDER_FINALIZED%' THEN v_finalized := v_finalized + 1;
      ELSIF SQLERRM LIKE 'PERMISSION_DENIED%' OR SQLERRM LIKE 'MANAGER_OVERRIDE_REQUIRED%' THEN v_denied := v_denied + 1;
      ELSIF SQLERRM LIKE 'INVALID_ITEM_TRANSITION%' THEN v_denied := v_denied + 1;
      ELSE RAISE; END IF;
    END;
  END LOOP;

  RETURN jsonb_build_object('success', v_denied = 0 OR v_done > 0,
    'order_id', p_order_id, 'action', p_action,
    'total', array_length(v_item_ids,1), 'done', v_done,
    'denied', v_denied, 'finalized_skipped', v_finalized,
    'performed_by', v_staff_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.kitchen_order_items_action(text, uuid, text, text, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.kitchen_order_items_action(text, uuid, text, text, uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.kitchen_order_items_action(text, uuid, text, text, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.kitchen_order_items_action(text, uuid, text, text, uuid) TO service_role;

-- ---- fail-safe ----
DO $$
BEGIN
  IF NOT has_function_privilege('service_role','public.kitchen_order_items_action(text, uuid, text, text, uuid)','EXECUTE')
     OR has_function_privilege('anon','public.kitchen_order_items_action(text, uuid, text, text, uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'K-G3 FAIL-SAFE: kitchen_order_items_action ACL not service-role-only';
  END IF;
END;
$$;
