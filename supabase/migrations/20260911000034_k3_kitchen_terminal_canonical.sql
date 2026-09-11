-- ============================================================================
-- 20260911000034 — K / G3+G4: canonical terminal KDS item action + order.void
--                  role matrix (K-07) + G2 follow-up revokes
--
-- USER-FROZEN CONTRACTS (K gate G3/G4, confirmed):
--   G3: "Bütün canlı KDS item mutation-ları → item_kitchen_step" canonical family.
--       Permission model: prepare/accept/ready/recall/hold = kitchen.manage;
--       kitchen waste = kitchen.manage + waste rule (manager override if needed);
--       void/comp = order.void; manager override only per approval rule; client
--       performed_by qəbul edilmir.
--   G4: finalized (paid/closed/cancelled) order üzərində normal KDS mutation
--       keçməməlidir → ORDER_FINALIZED (refund/reversal = frozen O flow);
--       bütün K mutation-ları idempotent olmalıdır.
--   K-07: order.void registry-də var, AMMA heç bir role verilməyib → business
--       responsibility matrix-i: manager / admin / superadmin (kitchen YOX,
--       cashier/owner/waiter YOX).
--
-- EVIDENCE (K-0, real DB):
--   item_kitchen_step (forward golden) already: set_session_staff → identity →
--   order FOR UPDATE → item FOR UPDATE → idempotent noop → ORDER_FINALIZED guard
--   → canonical-sequence → validate_transition('item') → authorize(perm,
--   order.location_id) → log_order_event + operation_logs + outbox(order_item).
--   Terminal/recall actions are NOT forward steps, so this companion
--   item_kitchen_terminal implements the SAME structure for
--   voided / comped / wasted / cancelled / recalled:
--     - registry = source of truth (perm per edge, requires_manager_override)
--     - idempotent: already at target → success noop
--     - finalized-order guard (G4): paid/closed/cancelled order → RAISE
--       ORDER_FINALIZED (except: void/comp/waste/cancel of an item whose ORDER
--       is cancelled is still refused — the whole order is gone)
--     - stock reversal via _inventory_reverse_item (void/waste) — idempotent by
--       inventory_logs uniqueness; SSOT total via calculate_order_total_v3
--       (void/cancel excluded from subtotal by frozen O math; comped/wasted
--       stay in subtotal by frozen O semantics — NOT changed here)
--   item machine guard trigger (frozen) re-validates EVERY status change for
--   all callers; sync_order_kitchen_status trigger (frozen) recomputes the
--   order.kitchen_status after each item change — no manual order writes needed.
--
-- G2 follow-up (K sweep, same class as K-03): record_item_waste /
--   return_to_stock / reverse_stock_for_items were `authenticated`-executable
--   stock fns with no authz inside; routes call them via service role.
--   REVOKE authenticated (+anon) — service_role keeps the server path.
--
-- GOLDEN RULE 5: auto-commit.
-- ============================================================================

-- ---- 1. K-07: order.void role matrix (business responsibility, NOT everyone) ----
-- void/comp/waste/cancel authority = management: manager / admin / superadmin.
-- (manager already holds void.approve+refund.approve; admin/superadmin too.)
INSERT INTO role_permissions (role_id, permission_key)
SELECT r.id, 'order.void' FROM roles r
WHERE r.name IN ('manager','admin','superadmin')
  AND NOT EXISTS (
    SELECT 1 FROM role_permissions x
    WHERE x.role_id = r.id AND x.permission_key = 'order.void'
  );

-- waste keeps kitchen.manage (kitchen can waste) — already held by kitchen +
-- superadmin; no new grant needed (per the confirmed model).

-- ---- 2. item_kitchen_terminal — canonical terminal KDS item action ----
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
  v_target := p_action;

  -- 1. AUTH (identity ONLY from session token)
  PERFORM set_session_staff(p_token);
  v_staff_id := current_staff_id();

  -- 2. lock order row first (consistent lock ordering with item_kitchen_step)
  SELECT o.id, o.status, o.location_id, o.organization_id INTO v_order
    FROM orders o JOIN order_items i ON i.order_id = o.id
   WHERE i.id = p_item_id FOR UPDATE OF o;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ITEM_NOT_FOUND' USING ERRCODE='P0001';
  END IF;
  -- 3. then the item row
  SELECT * INTO v_item FROM order_items WHERE id = p_item_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ITEM_NOT_FOUND' USING ERRCODE='P0001';
  END IF;

  -- 4. IDEMPOTENT re-entry: already at target → success noop (G4)
  IF v_item.kitchen_status = v_target THEN
    RETURN jsonb_build_object('success', true, 'idempotent', true,
      'order_item_id', p_item_id, 'from_status', v_item.kitchen_status,
      'to_status', v_target, 'correlation_id', v_corr);
  END IF;

  -- 5. G4 finalized-order guard: paid/closed/cancelled orders do NOT accept
  --    normal KDS mutation — use the frozen O refund/reversal workflow.
  IF v_order.status IN ('paid','closed','cancelled') THEN
    RAISE EXCEPTION 'ORDER_FINALIZED: use refund/reversal workflow for % orders',
      v_order.status USING ERRCODE='P0001';
  END IF;

  -- 6. registry = source of truth (perm + manager override per edge)
  v_rule := validate_transition('item', v_item.kitchen_status, v_target);
  IF NOT (v_rule->>'valid')::boolean THEN
    RAISE EXCEPTION 'INVALID_ITEM_TRANSITION: % → % (%)',
      v_item.kitchen_status, v_target, v_rule->>'error' USING ERRCODE='P0001';
  END IF;

  -- 7. AUTHORIZATION (session + staff + org + location-scope permission)
  v_allowed := authorize(p_token, COALESCE(v_rule->>'requires_permission','kitchen.manage'), v_order.location_id);
  IF NOT (v_allowed->>'allowed')::boolean THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: % → % requires [%] at % (reason: %)',
      v_item.kitchen_status, v_target,
      COALESCE(v_rule->>'requires_permission','kitchen.manage'),
      v_order.location_id, v_allowed->>'reason' USING ERRCODE='P0001';
  END IF;

  -- 8. MANAGER OVERRIDE GATE (registry requires_manager_override=true edges:
  --    comped / wasted / ready-cancelled / ready-voided / served-voided etc.)
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

  -- 9. MUTATION (frozen item-machine guard re-validates + sets canonical times)
  UPDATE order_items SET kitchen_status = v_target, updated_at = now()
  WHERE id = p_item_id;

  -- 10. side effects (void/waste → stock reversal, idempotent internally)
  IF v_target IN ('voided','wasted') THEN
    v_inv := _inventory_reverse_item(p_item_id, COALESCE(p_reason, p_action), v_staff_id, v_corr);
  END IF;

  -- 11. SSOT total (frozen O math: voided/cancelled excluded from subtotal;
  --     comped/wasted stay in subtotal by frozen O semantics)
  IF v_target IN ('voided','cancelled','comped','wasted') THEN
    v_total := calculate_order_total_v3(
      v_order.id,
      COALESCE(v_order.apply_vat, false),
      COALESCE(v_order.service_charge_pct, 0) > 0
    );
  END IF;

  -- 12. AUDIT
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
      'order_total', COALESCE(v_total->>'total', v_order.total_amount)),
    v_order.location_id, v_order.organization_id,
    jsonb_build_object('idempotency_key', NULL, 'correlation_id', v_corr,
      'inventory', v_inv)
  );

  -- 13. OUTBOX (G6 spine; order-level kitchen_status is recomputed by the
  --     frozen trg_sync_order_kitchen_status trigger after the item update)
  INSERT INTO outbox_events (aggregate_type, aggregate_id, event_type, payload, status)
  VALUES ('order_item', p_item_id, v_op,
    jsonb_build_object('order_id', v_order.id, 'item_id', p_item_id,
      'from_status', v_item.kitchen_status, 'to_status', v_target,
      'reason', p_reason, 'performed_by', v_staff_id, 'correlation_id', v_corr,
      'location_id', v_order.location_id),
    'pending');

  RETURN jsonb_build_object('success', true, 'idempotent', false,
    'order_item_id', p_item_id, 'from_status', v_item.kitchen_status,
    'to_status', v_target, 'correlation_id', v_corr,
    'new_order_total', COALESCE(v_total->>'total', v_order.total_amount),
    'inventory', v_inv);
END;
$$;

-- canonical K entry points: service_role-only (server path), no anon/authenticated
REVOKE EXECUTE ON FUNCTION public.item_kitchen_terminal(text, uuid, text, text, jsonb, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.item_kitchen_terminal(text, uuid, text, text, jsonb, uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.item_kitchen_terminal(text, uuid, text, text, jsonb, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.item_kitchen_terminal(text, uuid, text, text, jsonb, uuid) TO service_role;

-- ---- 3. G2 follow-up: stock fns — revoke authenticated (+anon); keep service_role ----
REVOKE EXECUTE ON FUNCTION public.record_item_waste(uuid, integer, text, text, uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.record_item_waste(uuid, integer, text, text, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.return_to_stock(uuid, integer, text, text, uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.return_to_stock(uuid, integer, text, text, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.reverse_stock_for_items(text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.reverse_stock_for_items(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.record_item_waste(uuid, integer, text, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.return_to_stock(uuid, integer, text, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.reverse_stock_for_items(text) TO service_role;

-- ---- fail-safe ----
DO $$
BEGIN
  -- order.void granted to exactly the management roles
  IF NOT (SELECT count(*) FROM role_permissions rp JOIN roles r ON r.id=rp.role_id
          WHERE rp.permission_key='order.void' AND r.name IN ('manager','admin','superadmin')) = 3 THEN
    RAISE EXCEPTION 'K-G3 FAIL-SAFE: order.void not granted to manager/admin/superadmin';
  END IF;
  IF (SELECT count(*) FROM role_permissions rp JOIN roles r ON r.id=rp.role_id
          WHERE rp.permission_key='order.void' AND r.name NOT IN ('manager','admin','superadmin')) <> 0 THEN
    RAISE EXCEPTION 'K-G3 FAIL-SAFE: order.void leaked to a non-management role';
  END IF;
  -- canonical terminal fn exists + service-role-only
  IF NOT has_function_privilege('service_role','public.item_kitchen_terminal(text, uuid, text, text, jsonb, uuid)','EXECUTE')
     OR has_function_privilege('anon','public.item_kitchen_terminal(text, uuid, text, text, jsonb, uuid)','EXECUTE')
     OR has_function_privilege('authenticated','public.item_kitchen_terminal(text, uuid, text, text, jsonb, uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'K-G3 FAIL-SAFE: item_kitchen_terminal ACL not service-role-only';
  END IF;
END;
$$;
