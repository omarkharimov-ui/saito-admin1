-- 0.4-C Item Preparation / Ready / Serve Atomic Operations
-- PART 1 (contract): stage timestamps, orders.kitchen_status 'sent', guard stamping,
--                    canonical order↔item kitchen aggregation
-- PART 2 (ops): item_kitchen_step engine + 6 public atomic RPCs
-- Pattern matches 0.4-A/B: registry-backed, authorize(), operation_logs + outbox sinks.
-- Idempotency: target-state noop + row-level serialization (order lock then item lock).

BEGIN;

-- ===================================================================================
-- PART 1 — CONTRACT
-- ===================================================================================

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS sent_at      timestamptz,
  ADD COLUMN IF NOT EXISTS accepted_at  timestamptz,
  ADD COLUMN IF NOT EXISTS started_at   timestamptz,
  ADD COLUMN IF NOT EXISTS ready_at     timestamptz,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz;

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_kitchen_status_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_kitchen_status_check CHECK (
  kitchen_status IS NULL OR
  kitchen_status = ANY (ARRAY['pending','accepted','preparing','cooking','partially_ready','ready','completed','cancelled','reserved','served','sent']::text[])
);

-- Stage timestamp stamping inside the item state-machine guard (BEFORE UPDATE).
-- First-writer-wins per stage; never overwrites. Existing served/terminal rules kept.
CREATE OR REPLACE FUNCTION public.trg_item_state_machine_guard()
RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_valid jsonb;
BEGIN
  IF OLD.kitchen_status IS NOT DISTINCT FROM NEW.kitchen_status THEN
    RETURN NEW;
  END IF;

  v_valid := validate_transition('item', OLD.kitchen_status, NEW.kitchen_status);
  IF NOT (v_valid->>'valid')::boolean THEN
    RAISE EXCEPTION 'INVALID_ITEM_TRANSITION [% → %]: % (item %)',
      OLD.kitchen_status, NEW.kitchen_status, v_valid->>'error', NEW.id
      USING ERRCODE = 'P0001';
  END IF;

  IF NEW.kitchen_status = 'sent' AND OLD.kitchen_status IS DISTINCT FROM 'sent'
     AND NEW.sent_at IS NULL THEN
    NEW.sent_at := now();
  END IF;
  IF NEW.kitchen_status = 'accepted' AND OLD.kitchen_status IS DISTINCT FROM 'accepted'
     AND NEW.accepted_at IS NULL THEN
    NEW.accepted_at := now();
  END IF;
  IF NEW.kitchen_status = 'preparing' AND OLD.kitchen_status IS DISTINCT FROM 'preparing'
     AND NEW.started_at IS NULL THEN
    NEW.started_at := now();
  END IF;
  IF NEW.kitchen_status = 'ready' AND OLD.kitchen_status IS DISTINCT FROM 'ready'
     AND NEW.ready_at IS NULL THEN
    NEW.ready_at := now();
  END IF;
  IF NEW.kitchen_status = 'completed' AND OLD.kitchen_status IS DISTINCT FROM 'completed'
     AND NEW.completed_at IS NULL THEN
    NEW.completed_at := now();
  END IF;

  IF NEW.kitchen_status = 'served' AND NEW.served_at IS NULL THEN
    NEW.served_at := now();
  END IF;
  IF NEW.kitchen_status IN ('voided','cancelled','comped','wasted') THEN
    NEW.served_at := NULL;
  END IF;

  RETURN NEW;
END;
$$;

-- Canonical order↔item kitchen aggregation.
-- Derived column orders.kitchen_status = f(active items). It is NOT part of the
-- orders.status state machine; it is an aggregate mirror for KDS/POS display.
-- Guard: never clobber finalized orders (0.4-A sets kitchen_status='completed' on paid).
CREATE OR REPLACE FUNCTION public.sync_order_kitchen_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_order_id UUID;
  v_new_status TEXT;
BEGIN
  -- fire point is order_items rows → resolve owning order explicitly
  IF TG_OP = 'DELETE' THEN
    SELECT order_id INTO v_order_id FROM order_items WHERE id = OLD.id;
  ELSE
    v_order_id := NEW.order_id;
  END IF;
  IF v_order_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  WITH agg AS (
    SELECT
      count(*) FILTER (WHERE kitchen_status NOT IN ('cancelled','comped','wasted','recalled')) AS active,
      count(*) FILTER (WHERE kitchen_status = 'served')   AS served,
      count(*) FILTER (WHERE kitchen_status = 'preparing') AS preparing,
      count(*) FILTER (WHERE kitchen_status = 'ready')    AS ready,
      count(*) FILTER (WHERE kitchen_status IN ('pending','sent','reserved','accepted')) AS pre_cook,
      count(*) FILTER (WHERE kitchen_status = 'accepted') AS accepted,
      count(*) FILTER (WHERE kitchen_status = 'sent')     AS sent,
      count(*) FILTER (WHERE kitchen_status = 'pending')  AS pending,
      count(*) FILTER (WHERE kitchen_status = 'reserved') AS reserved,
      count(*) FILTER (WHERE kitchen_status = 'completed') AS completed
    FROM order_items
    WHERE order_id = v_order_id
  )
  SELECT CASE
    WHEN active = 0 THEN 'cancelled'
    WHEN served > 0 THEN 'served'
    WHEN preparing > 0 AND (ready > 0 OR pre_cook > 0) THEN 'partially_ready'
    WHEN ready > 0 AND pre_cook > 0 THEN 'partially_ready'
    WHEN preparing > 0 THEN 'preparing'
    WHEN ready > 0 THEN 'ready'
    WHEN accepted > 0 THEN 'accepted'
    WHEN sent > 0 THEN 'sent'
    WHEN pending > 0 THEN 'pending'
    WHEN reserved > 0 THEN 'reserved'
    WHEN completed = active THEN 'completed'
    ELSE 'cancelled'
  END
  INTO v_new_status
  FROM agg;

  UPDATE orders
  SET kitchen_status = v_new_status
  WHERE id = v_order_id
    AND status NOT IN ('paid', 'cancelled', 'closed');

  RETURN COALESCE(NEW, OLD);
END;
$function$;

-- ensure the aggregation trigger is wired for INSERT/UPDATE/DELETE
DROP TRIGGER IF EXISTS trg_sync_order_kitchen_status ON public.order_items;
CREATE TRIGGER trg_sync_order_kitchen_status
  AFTER INSERT OR UPDATE OR DELETE ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.sync_order_kitchen_status();

-- ===================================================================================
-- PART 2 — ATOMIC OPS
-- ===================================================================================

-- Forward-only kitchen step engine. p_target must be a registered forward step.
-- Serialization: order row lock, then item row lock → dedupe of concurrent calls.
CREATE OR REPLACE FUNCTION public.item_kitchen_step(
  p_token text,
  p_item_id uuid,
  p_target text,
  p_reason text DEFAULT NULL,
  p_metadata jsonb DEFAULT NULL,
  p_correlation_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
BEGIN
  PERFORM set_session_staff(p_token);
  v_staff_id := current_staff_id();

  -- lock order row first (consistent lock ordering with order-level RPCs)
  SELECT o.id, o.status, o.location_id, o.organization_id
    INTO v_order
    FROM orders o
    JOIN order_items i ON i.order_id = o.id
   WHERE i.id = p_item_id
   FOR UPDATE OF o;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ITEM_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  -- then the item row
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

  -- canonical exact-step enforcement: no skip, no backward via canonical RPCs.
  -- (registry stays permissive for legacy writers; corrections are 0.4-D workflow)
  IF (p_target = 'sent'      AND v_item.kitchen_status <> 'pending')
     OR (p_target = 'accepted' AND v_item.kitchen_status <> 'sent')
     OR (p_target = 'preparing' AND v_item.kitchen_status <> 'accepted')
     OR (p_target = 'ready'     AND v_item.kitchen_status <> 'preparing')
     OR (p_target = 'served'    AND v_item.kitchen_status <> 'ready')
     OR (p_target = 'completed' AND v_item.kitchen_status <> 'served') THEN
    RAISE EXCEPTION 'INVALID_ITEM_TRANSITION: % → % bypasses canonical sequence (step % requires current state %). Corrections via 0.4-D workflow.',
      v_item.kitchen_status, p_target, p_target,
      CASE p_target WHEN 'sent' THEN 'pending' WHEN 'accepted' THEN 'sent'
                    WHEN 'preparing' THEN 'accepted' WHEN 'ready' THEN 'preparing'
                    WHEN 'served' THEN 'ready' WHEN 'completed' THEN 'served' END
      USING ERRCODE = 'P0001';
  END IF;

  -- registry check (also re-validated by the trigger)
  v_rule := validate_transition('item', v_item.kitchen_status, p_target);
  IF NOT (v_rule->>'valid')::boolean THEN
    RAISE EXCEPTION 'INVALID_ITEM_TRANSITION: % → % (%)',
      v_item.kitchen_status, p_target, v_rule->>'error' USING ERRCODE = 'P0001';
  END IF;

  v_allowed := authorize(
    p_token,
    COALESCE(v_rule->>'requires_permission', 'kitchen.manage'),
    v_order.location_id
  );
  IF NOT (v_allowed->>'allowed')::boolean THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: % → % requires [%] at % (reason: %)',
      v_item.kitchen_status, p_target,
      COALESCE(v_rule->>'requires_permission', 'kitchen.manage'),
      v_order.location_id, v_allowed->>'reason' USING ERRCODE = 'P0001';
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
      'reason', p_reason, 'performed_by', v_staff_id, 'correlation_id', v_corr),
    'pending');

  RETURN jsonb_build_object('success', true, 'idempotent', false,
    'order_item_id', v_updated.id, 'from_status', v_item.kitchen_status,
    'to_status', v_updated.kitchen_status,
    'correlation_id', v_corr);
END;
$$;

CREATE OR REPLACE FUNCTION public.send_item_atomic(
  p_token text, p_item_id uuid, p_reason text DEFAULT NULL,
  p_metadata jsonb DEFAULT NULL, p_correlation_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT item_kitchen_step(p_token, p_item_id, 'sent', p_reason, p_metadata, p_correlation_id)
$$;

CREATE OR REPLACE FUNCTION public.accept_item_atomic(
  p_token text, p_item_id uuid, p_reason text DEFAULT NULL,
  p_metadata jsonb DEFAULT NULL, p_correlation_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT item_kitchen_step(p_token, p_item_id, 'accepted', p_reason, p_metadata, p_correlation_id)
$$;

CREATE OR REPLACE FUNCTION public.start_item_atomic(
  p_token text, p_item_id uuid, p_reason text DEFAULT NULL,
  p_metadata jsonb DEFAULT NULL, p_correlation_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT item_kitchen_step(p_token, p_item_id, 'preparing', p_reason, p_metadata, p_correlation_id)
$$;

CREATE OR REPLACE FUNCTION public.ready_item_atomic(
  p_token text, p_item_id uuid, p_reason text DEFAULT NULL,
  p_metadata jsonb DEFAULT NULL, p_correlation_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT item_kitchen_step(p_token, p_item_id, 'ready', p_reason, p_metadata, p_correlation_id)
$$;

CREATE OR REPLACE FUNCTION public.serve_item_atomic(
  p_token text, p_item_id uuid, p_reason text DEFAULT NULL,
  p_metadata jsonb DEFAULT NULL, p_correlation_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT item_kitchen_step(p_token, p_item_id, 'served', p_reason, p_metadata, p_correlation_id)
$$;

CREATE OR REPLACE FUNCTION public.complete_item_atomic(
  p_token text, p_item_id uuid, p_reason text DEFAULT NULL,
  p_metadata jsonb DEFAULT NULL, p_correlation_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT item_kitchen_step(p_token, p_item_id, 'completed', p_reason, p_metadata, p_correlation_id)
$$;

COMMIT;