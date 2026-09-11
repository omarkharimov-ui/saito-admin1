-- ============================================================================
-- 20260911000037 — K / G3 (part 4): item_kitchen_terminal 'recalled' -> pending
--
-- The frozen item registry has no `->recalled` edge; "recall" in this schema is
-- send-back-to-`pending` (cf. frozen recall_ticket_atomic). So action 'recalled'
-- must resolve to the real target 'pending' (registry: X->pending exists from
-- accepted/sent/preparing/ready/served/reserved/hot/recalled, perm kitchen.manage)
-- while the ACTION is still recorded as 'recalled' in audit/outbox metadata.
--
-- Only the target-resolution + idempotency check change; permission, location,
-- finalized-guard, stock, SSOT, audit, outbox are unchanged (034).
--
-- GOLDEN RULE 5: auto-commit.
-- ============================================================================

DROP FUNCTION IF EXISTS public.item_kitchen_terminal(text, uuid, text, text, jsonb, uuid);
CREATE OR REPLACE FUNCTION public.item_kitchen_terminal(p_token text, p_item_id uuid, p_action text, p_reason text, p_metadata jsonb, p_correlation_id uuid)
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
  v_target text;
  v_corr uuid := COALESCE(p_correlation_id, gen_random_uuid());
  v_op text := 'order_item.' || p_action;
  v_inv jsonb;
  v_total jsonb;
BEGIN
  IF p_action NOT IN ('voided','comped','wasted','cancelled','recalled') THEN
    RAISE EXCEPTION 'UNKNOWN_ACTION: % (allowed: voided, comped, wasted, cancelled, recalled)', p_action
      USING ERRCODE='P0001';
  END IF;
  -- 'recalled' is a KDS action, not an item status: it sends the item back to
  -- 'pending' (the frozen registry's recall semantics).
  v_target := CASE p_action WHEN 'recalled' THEN 'pending' ELSE p_action END;

  PERFORM set_session_staff(p_token);
  v_staff_id := current_staff_id();

  SELECT o.id, o.status, o.location_id, o.organization_id, o.apply_vat, o.service_charge_pct, o.total_amount INTO v_order
    FROM orders o JOIN order_items i ON i.order_id = o.id
   WHERE i.id = p_item_id FOR UPDATE OF o;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ITEM_NOT_FOUND' USING ERRCODE='P0001';
  END IF;
  SELECT * INTO v_item FROM order_items WHERE id = p_item_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ITEM_NOT_FOUND' USING ERRCODE='P0001';
  END IF;

  -- idempotent re-entry (G4)
  IF v_item.kitchen_status = v_target THEN
    RETURN jsonb_build_object('success', true, 'idempotent', true,
      'order_item_id', p_item_id, 'from_status', v_item.kitchen_status,
      'to_status', v_target, 'action', p_action, 'correlation_id', v_corr);
  END IF;

  -- finalized-order guard (G4): paid/closed/cancelled orders refuse KDS mutation
  IF v_order.status IN ('paid','closed','cancelled') THEN
    RAISE EXCEPTION 'ORDER_FINALIZED: use refund/reversal workflow for % orders',
      v_order.status USING ERRCODE='P0001';
  END IF;

  -- registry = source of truth (perm + manager override per edge)
  v_rule := validate_transition('item', v_item.kitchen_status, v_target);
  IF NOT (v_rule->>'valid')::boolean THEN
    RAISE EXCEPTION 'INVALID_ITEM_TRANSITION: % → % (%)',
      v_item.kitchen_status, v_target, v_rule->>'error' USING ERRCODE='P0001';
  END IF;

  v_allowed := authorize(p_token, COALESCE(v_rule->>'requires_permission','kitchen.manage'), v_order.location_id);
  IF NOT (v_allowed->>'allowed')::boolean THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: % → % requires [%] at % (reason: %)',
      v_item.kitchen_status, v_target,
      COALESCE(v_rule->>'requires_permission','kitchen.manage'),
      v_order.location_id, v_allowed->>'reason' USING ERRCODE='P0001';
  END IF;

  IF COALESCE(v_rule->>'requires_manager_override','false')::boolean THEN
    IF NOT COALESCE((SELECT has_permission(v_staff_id, 'void.approve')), false)
       AND NOT COALESCE((SELECT has_permission(v_staff_id, 'refund.approve')), false)
       AND NOT EXISTS (
          SELECT 1 FROM manager_overrides mo
          WHERE mo.requested_by = v_staff_id
            AND mo.permission = COALESCE(v_rule->>'requires_permission','kitchen.manage')
            AND mo.location_id = v_order.location_id
            AND mo.status = 'APPROVED' AND mo.expires_at > now()
       ) THEN
      RAISE EXCEPTION 'MANAGER_OVERRIDE_REQUIRED: % → % (approver perm [void.approve/refund.approve])',
        v_item.kitchen_status, v_target USING ERRCODE='P0001';
    END IF;
  END IF;

  UPDATE order_items SET kitchen_status = v_target, updated_at = now()
  WHERE id = p_item_id;

  IF v_target IN ('voided','wasted') THEN
    v_inv := _inventory_reverse_item(p_item_id, COALESCE(p_reason, p_action), v_staff_id, v_corr);
  END IF;

  IF v_target IN ('voided','cancelled','comped','wasted') THEN
    v_total := calculate_order_total_v3(
      v_order.id,
      COALESCE(v_order.apply_vat, false),
      COALESCE(v_order.service_charge_pct, 0) > 0
    );
  END IF;

  PERFORM log_order_event(v_order.id, 'kitchen_status_changed',
    jsonb_build_object('item', p_item_id, 'from_status', v_item.kitchen_status),
    jsonb_build_object('item', p_item_id, 'to_status', v_target),
    jsonb_build_object('reason', p_reason, 'correlation_id', v_corr, 'action', p_action),
    v_staff_id, NULL, NULL, NULL);

  INSERT INTO operation_logs (
    operation, order_id, performed_by, reason, old_state, new_state,
    location_id, organization_id, metadata
  ) VALUES (
    v_op, v_order.id, v_staff_id, p_reason,
    jsonb_build_object('kitchen_status', v_item.kitchen_status, 'order_total', v_order.total_amount),
    jsonb_build_object('kitchen_status', v_target,
      'order_total', COALESCE(v_total->>'total', v_order.total_amount::text)),
    v_order.location_id, v_order.organization_id,
    jsonb_build_object('idempotency_key', NULL, 'correlation_id', v_corr, 'inventory', v_inv)
  );

  INSERT INTO outbox_events (aggregate_type, aggregate_id, event_type, payload, status)
  VALUES ('order_item', p_item_id, v_op,
    jsonb_build_object('order_id', v_order.id, 'item_id', p_item_id,
      'from_status', v_item.kitchen_status, 'to_status', v_target,
      'reason', p_reason, 'performed_by', v_staff_id, 'correlation_id', v_corr,
      'location_id', v_order.location_id, 'action', p_action),
    'pending');

  RETURN jsonb_build_object('success', true, 'idempotent', false,
    'order_item_id', p_item_id, 'from_status', v_item.kitchen_status,
    'to_status', v_target, 'correlation_id', v_corr,
    'new_order_total', COALESCE(v_total->>'total', v_order.total_amount::text),
    'inventory', v_inv);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.item_kitchen_terminal(text, uuid, text, text, jsonb, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.item_kitchen_terminal(text, uuid, text, text, jsonb, uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.item_kitchen_terminal(text, uuid, text, text, jsonb, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.item_kitchen_terminal(text, uuid, text, text, jsonb, uuid) TO service_role;
