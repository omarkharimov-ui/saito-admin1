-- ============================================================================
-- 20260911000001 — A#1: Outbox consumer (outbox_pump) + expired reservations
-- Design: A1_OUTBOX_CRON_DESIGN.md (SSOT: tək RPC consumer; pg_cron 30s pump)
--
-- GOLDEN RULE 5: auto-commit. NO BEGIN/COMMIT/ROLLBACK in this file.
-- Idempotent: DROP/CREATE + OR REPLACE, safe to re-run.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) outbox_pump() — single SSOT consumer for outbox_events
--    claim (FOR UPDATE SKIP LOCKED) → dispatch → processed | retry(backoff) | failed(dead-letter)
--    Malformed JSON payload is a perma-failure (payload is immutable).
--    Notification failures never fail the event (UI notification gap is tolerable;
--    event itself carries the data).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.outbox_pump(
  p_batch_size INT DEFAULT 200
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch outbox_events%ROWTYPE;
  v_done INT := 0;
  v_failed INT := 0;
  v_noop INT := 0;
BEGIN
  FOR v_batch IN
    SELECT * FROM outbox_events
    WHERE status IN ('pending','processing')
      AND (next_retry_at IS NULL OR next_retry_at <= now())
    ORDER BY created_at ASC
    LIMIT GREATEST(1, COALESCE(p_batch_size, 200))
    FOR UPDATE SKIP LOCKED
  LOOP
    BEGIN
      PERFORM public.outbox_dispatch(v_batch);
      -- allowed status values (outbox_events_status_check):
      --   pending, processing, completed, failed, dead
      -- success → 'completed'; transient → 'pending'+backoff; perma → 'dead'
      UPDATE outbox_events
      SET status = 'completed',
          processed_at = now(),
          next_retry_at = NULL,
          error_message = NULL
      WHERE id = v_batch.id;
      v_done := v_done + 1;
    EXCEPTION
      WHEN others THEN
        IF v_batch.retry_count + 1 < v_batch.max_retries THEN
          UPDATE outbox_events
          SET status = 'pending',
              retry_count = retry_count + 1,
              next_retry_at = now() + make_interval(secs => (retry_count + 1) * 60),
              error_message = left(coalesce(SQLERRM, 'unknown'), 500)
          WHERE id = v_batch.id;
        ELSE
          UPDATE outbox_events
          SET status = 'dead',
              retry_count = retry_count + 1,
              error_message = left(coalesce(SQLERRM, 'unknown'), 500)
          WHERE id = v_batch.id;
          v_failed := v_failed + 1;
        END IF;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'processed', v_done,
    'failed', v_failed,
    'remaining', (SELECT count(*) FROM outbox_events WHERE status IN ('pending','processing') AND (next_retry_at IS NULL OR next_retry_at <= now()))
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.outbox_pump(INT) TO service_role;

-- ----------------------------------------------------------------------------
-- 1b) outbox_dispatch() — event handler switch (handlers live in this one place)
--     Known-but-no-action event types: marked 'noop' (backlog drain).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.outbox_dispatch(p_ev public.outbox_events)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_p jsonb;
  v_order RECORD;
  v_ingredient RECORD;
  v_recent INT;
BEGIN
  BEGIN
    v_p := p_ev.payload::jsonb;
  EXCEPTION WHEN others THEN
    RAISE 'malformed payload (permanent failure): %', left(coalesce(SQLERRM,'unknown'), 300);
  END;

  -- NOOP types (realtime already covers POS/KDS via supabase_realtime publication;
  -- kept for future consumers via outbox).
  IF p_ev.event_type LIKE 'table.%'
     OR p_ev.event_type LIKE 'kds.%'
     OR p_ev.event_type LIKE 'location.%'
     OR p_ev.event_type LIKE 'staff.%'
  THEN
    RETURN;
  END IF;

  IF p_ev.event_type = 'order.status_changed' THEN
    SELECT o.id, o.order_number, o.status, o.location_id, o.organization_id
    INTO v_order
    FROM orders o
    WHERE o.id = p_ev.aggregate_id;
    IF v_order.id IS NULL THEN
      RETURN;
    END IF;
    IF v_order.status = 'paid' THEN
      INSERT INTO notifications (type, title, body, data)
      VALUES (
        'order',
        'Order paid: ' || coalesce(v_order.order_number::text, ''),
        'Order ' || coalesce(v_order.order_number::text, '') || ' payment complete',
        jsonb_build_object('order_id', v_order.id, 'order_number', v_order.order_number, 'status', 'paid')
      );
    ELSIF v_order.status IN ('cancelled', 'voided') THEN
      INSERT INTO notifications (type, title, body, data)
      VALUES (
        'order_cancelled',
        'Order cancelled: ' || coalesce(v_order.order_number::text, ''),
        coalesce(v_p->>'reason', 'Order cancelled'),
        jsonb_build_object('order_id', v_order.id, 'order_number', v_order.order_number, 'status', v_order.status, 'reason', v_p->>'reason')
      );
    END IF;
    RETURN;
  END IF;

  IF p_ev.event_type = 'payment.failed' THEN
    SELECT o.id, o.status, o.order_number, o.location_id, o.organization_id
    INTO v_order
    FROM orders o
    WHERE o.id = p_ev.aggregate_id
      AND o.status NOT IN ('closed', 'cancelled', 'voided');
    IF v_order.id IS NULL THEN
      RETURN;
    END IF;
    SELECT count(*) INTO v_recent
    FROM payment_attempts pa
    JOIN payments pm ON pm.id = pa.payment_id
    WHERE pm.order_id = v_order.id
      AND pa.status = 'failed'
      AND (pa.completed_at IS NULL OR pa.completed_at >= now() - interval '15 minutes');
    IF v_recent > 0 THEN
      INSERT INTO notifications (type, title, body, data)
      VALUES (
        'payment',
        'Payment failed: ' || coalesce(v_order.order_number::text, ''),
        'A payment attempt failed for order ' || coalesce(v_order.order_number::text, '') || ' — retry or use another method',
        jsonb_build_object('order_id', v_order.id, 'order_number', v_order.order_number, 'failed_attempts', v_recent)
      );
    END IF;
    RETURN;
  END IF;

  IF p_ev.event_type = 'payment.refunded'
     OR p_ev.event_type LIKE 'order.refund.%'
  THEN
    SELECT o.id, o.order_number, o.location_id, o.organization_id, pr.amount, pr.performed_by_name
    INTO v_order
    FROM payment_refunds pr
    JOIN orders o ON o.id = pr.order_id
    WHERE pr.order_id = p_ev.aggregate_id
      AND pr.status = 'completed'
      AND pr.created_at >= now() - interval '1 hour'
    ORDER BY pr.created_at DESC
    LIMIT 1;
    IF v_order.id IS NULL THEN
      RETURN;
    END IF;
    INSERT INTO notifications (type, title, body, data)
    VALUES (
      'payment',
      'Refund: ' || coalesce(v_order.order_number::text, ''),
      coalesce(v_order.performed_by_name, 'System') || ' processed a refund of ' || coalesce(v_order.amount::text, '') || ' for order ' || coalesce(v_order.order_number::text, ''),
      jsonb_build_object('order_id', v_order.id, 'order_number', v_order.order_number, 'amount', v_order.amount, 'performed_by', v_order.performed_by_name)
    );
    RETURN;
  END IF;

  IF p_ev.event_type = 'inventory.stock_changed' THEN
    SELECT i.id, i.name, i.unit, i.current_stock, i.critical_limit
    INTO v_ingredient
    FROM ingredients i
    WHERE i.id = p_ev.aggregate_id;
    IF v_ingredient.id IS NULL OR v_ingredient.critical_limit IS NULL OR v_ingredient.critical_limit <= 0 THEN
      RETURN;
    END IF;
    IF v_ingredient.current_stock <= v_ingredient.critical_limit THEN
      SELECT count(*) INTO v_recent
      FROM notifications
      WHERE type = 'stock'
        AND title = 'Ehtiyat azalıb: ' || v_ingredient.name
        AND created_at >= now() - interval '4 hours';
      IF v_recent = 0 THEN
        INSERT INTO notifications (type, title, body, data)
        VALUES (
          'stock',
          'Ehtiyat azalıb: ' || v_ingredient.name,
          v_ingredient.name || ': ' || v_ingredient.current_stock::text || ' ' || coalesce(v_ingredient.unit, '') || ' (threshold: ' || v_ingredient.critical_limit::text || ')',
          jsonb_build_object('ingredient_id', v_ingredient.id, 'name', v_ingredient.name, 'current_stock', v_ingredient.current_stock, 'critical_limit', v_ingredient.critical_limit)
        );
      END IF;
    END IF;
    RETURN;
  END IF;

  -- Unknown event type: no-op (forward compatible).
  RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION public.outbox_dispatch(public.outbox_events) TO service_role;

-- ----------------------------------------------------------------------------
-- 2) process_expired_reservations_atomic()
--    confirmed + date < now-15d → no_show      (+ notification + operation_logs)
--    pending   + date < now-1h  → cancelled(auto_expired_reservation)
--
--    Table release + draft-order cancel are ALREADY handled by the existing
--    trigger trg_cleanup_reservation_draft_orders (on status → cancelled/no_show).
--    If the table_release_guard blocks that trigger (table has a live order
--    pointer / open orders), the per-reservation block is caught: the
--    reservation stays in its original status (UNTOUCHED) and is reported in
--    'skipped' for manual review. Batch never aborts on a single table.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.process_expired_reservations_atomic()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_r RECORD;
  v_no_show INT := 0;
  v_cancelled INT := 0;
  v_skipped INT := 0;
  v_skip_reasons JSONB := '[]'::jsonb;
BEGIN
  FOR v_r IN
    SELECT * FROM reservations
    WHERE (status = 'confirmed' AND date < CURRENT_DATE - interval '15 days')
       OR (status = 'pending' AND date < CURRENT_DATE - interval '1 hour')
    ORDER BY date ASC
    FOR UPDATE
  LOOP
    BEGIN
      IF v_r.status = 'confirmed' THEN
        UPDATE reservations SET status = 'no_show', no_show_at = now(), updated_at = now()
        WHERE id = v_r.id;
        v_no_show := v_no_show + 1;
        INSERT INTO notifications (type, title, body, data)
        VALUES (
        'reservation',
        'No-show: ' || coalesce(v_r.name, ''),
          coalesce(v_r.name, '') || ' — ' || v_r.date::text || ' ' || coalesce(v_r.time::text, '') || ' reservation marked no-show (expired)',
          jsonb_build_object('reservation_id', v_r.id, 'name', v_r.name, 'date', v_r.date, 'time', v_r.time, 'new_status', 'no_show')
        );
      ELSE
        UPDATE reservations SET status = 'cancelled', cancelled_at = now(), cancelled_reason = 'auto_expired_reservation', updated_at = now()
        WHERE id = v_r.id;
        v_cancelled := v_cancelled + 1;
      END IF;

      INSERT INTO operation_logs (operation, old_state, new_state)
      VALUES (
        'process_expired_reservation',
        jsonb_build_object('status', v_r.status, 'date', v_r.date),
        jsonb_build_object('status', CASE WHEN v_r.status = 'confirmed' THEN 'no_show' ELSE 'cancelled' END)
      );
    EXCEPTION
      WHEN OTHERS THEN
        -- trigger (trg_cleanup_reservation_draft_orders) was blocked by
        -- table_release_guard → reservation stays untouched, flag for manual review
        v_skipped := v_skipped + 1;
        v_skip_reasons := v_skip_reasons || jsonb_build_array(
          v_r.name || ' (' || v_r.status || ' ' || v_r.date::text || '): ' || left(coalesce(SQLERRM,'unknown'), 300)
        );
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'no_show', v_no_show,
    'cancelled', v_cancelled,
    'skipped', v_skipped,
    'skip_reasons', v_skip_reasons
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.process_expired_reservations_atomic() TO service_role;
