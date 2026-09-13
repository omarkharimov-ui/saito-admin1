CREATE OR REPLACE FUNCTION public.transition_order_atomic(p_token text, p_order_id uuid, p_new_status text, p_reason text DEFAULT NULL::text, p_metadata jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_allowed jsonb;
  v_rule jsonb;
  v_order RECORD;
  v_old_status text;
  v_old_kitchen text;
  v_staff_id uuid;
  v_table_number int;
  v_current_table_status text;
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

    -- 6a. kitchen_status sync (parity with the pre-G1 live path)
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

    -- 6b. kitchen_schedule parity
    IF p_new_status IN ('paid','closed','cancelled') THEN
      DELETE FROM public.kitchen_schedule WHERE order_id = p_order_id;
    ELSIF p_new_status = 'in_kitchen' THEN
      INSERT INTO public.kitchen_schedule (order_id, table_number, status, created_at, updated_at)
      SELECT p_order_id, v_table_number, 'preparing', NOW(), NOW()
      WHERE v_table_number IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM public.kitchen_schedule WHERE order_id = p_order_id);
    END IF;

    -- 6c. floor sync (L5/A, 2026-09-12, ratified): the table lifecycle is
    --     exactly empty / occupied / reserved. An active meal — including
    --     paid — KEEPS the table occupied (PAID+OCCUPIED is valid; kitchen/
    --     service progress lives in orders/order_items.kitchen_status +
    --     table.kitchen_status, never table.status). The ONLY transition this
    --     block performs is terminal cancellation freeing the table, and only
    --     when no other open order remains on this (table, location).
    --     'closed' is released by release_paid_table_atomic (explicit UI
    --     departure action) — never auto-emptied here.
    IF v_table_number IS NOT NULL AND v_table_number > 0 THEN
      IF p_new_status = 'cancelled' THEN
        SELECT status INTO v_current_table_status FROM table_floors
         WHERE table_number = v_table_number AND location_id = v_order.location_id FOR UPDATE;
        IF v_current_table_status = 'occupied'
           AND NOT EXISTS (SELECT 1 FROM orders o2
                           WHERE o2.table_number = v_table_number
                             AND o2.location_id = v_order.location_id
                             AND o2.status NOT IN ('paid','cancelled','closed','refunded','partially_refunded','voided'))
        THEN
          -- Guarded: table_release_guard (BEFORE trigger on table_floors)
          -- re-validates no-active-pointer / no-open-orders for the empty state.
          UPDATE table_floors SET
            status = 'empty',
            current_order_id = NULL,
            total_amount = 0,
            guest_count = NULL,
            order_count = 0,
            has_pending = false,
            oldest_pending_at = NULL,
            bill_requested = false,
            updated_at = now()
          WHERE table_number = v_table_number AND location_id = v_order.location_id;
          PERFORM public.sync_table_order_aggregates(v_table_number);
        END IF;
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
$function$

