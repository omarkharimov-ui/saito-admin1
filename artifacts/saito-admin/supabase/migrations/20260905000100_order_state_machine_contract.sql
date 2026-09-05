-- ============================================================
-- 0.4-A: Order Identity & State Machine Contract
-- Contract layer ON LEGACY text status (chosen: no enum migration,
-- keeps 163 existing order RPCs + 689 live orders intact).
--
--  Canonical machine (mapped to legacy labels):
--   DRAFT(draft) → OPEN(new/open) → SENT(confirmed) → PREPARING(in_kitchen)
--   → PARTIALLY_READY(partially_ready) → READY(ready) → SERVED(served)
--   → PAYMENT_PENDING(payment_pending) → PAID(paid) → CLOSED(closed)
--   Exceptions: VOIDED(voided), CANCELLED(cancelled),
--               REFUNDED(refunded/partially_refunded), REOPENED(reopen edges)
--
--  Enforcement points:
--   1. state_transitions registry = ONLY source of truth (append-only).
--   2. requires_permission + requires_manager_override per edge.
--   3. trg_order_state_machine_guard: fires on ANY status UPDATE,
--      validates via registry, sets canonical timestamps, coarse kitchen sync.
--   4. transition_order_atomic: canonical app-facing RPC with
--      auth → authorize(location+permission) → transition → audit → outbox.
-- ============================================================

BEGIN;

-- 1. Canonical status vocabulary — add VOIDED to orders.status CHECK
--    (fixes latent bug: dismiss_table_state_aware / void_items_state_aware
--     were already writing 'voided' but the CHECK never allowed it)
ALTER TABLE public.orders DROP CONSTRAINT orders_status_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_status_check CHECK (
  status = ANY (ARRAY[
    'draft','new','open','confirmed','in_kitchen','preparing','partially_ready','ready',
    'served','payment_pending','paid','closed','cancelled',
    'refunded','partially_refunded','voided'
  ])
);
COMMENT ON CONSTRAINT orders_status_check ON public.orders IS
  '0.4-A canonical order status vocabulary (legacy text labels, enforced)';

-- 2. reopened_at audit column (REOPENED exception state)
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS reopened_at timestamptz;

-- 3. state_transitions registry — permission gating columns
ALTER TABLE public.state_transitions
  ADD COLUMN IF NOT EXISTS requires_permission text;
ALTER TABLE public.state_transitions
  ADD COLUMN IF NOT EXISTS requires_manager_override boolean NOT NULL DEFAULT false;

-- 4. Unique constraint for idempotent edge registration
CREATE UNIQUE INDEX IF NOT EXISTS state_transitions_entity_from_to_uidx
  ON public.state_transitions (entity, from_status, to_status);

-- 5. Canonical transition registry (order entity)
--    UPSERT semantics: existing edges get permission/manager enrichment,
--    new canonical edges (VOIDED / REFUNDED / REOPENED / canonical path) are added.
INSERT INTO public.state_transitions
  (entity, from_status, to_status, requires_permission, requires_manager_override, description)
VALUES
  -- --- canonical lifecycle ---
  ('order','draft','new',                 'orders.create', false, 'DRAFT → OPEN (order created)'),
  ('order','draft','open',                'orders.create', false, 'DRAFT → OPEN (canonical label)'),
  ('order','new','confirmed',             'orders.edit',   false, 'OPEN → SENT (confirmed by staff)'),
  ('order','open','confirmed',            'orders.edit',   false, 'OPEN → SENT (canonical label)'),
  ('order','confirmed','in_kitchen',      'orders.edit',   false, 'SENT → PREPARING (sent to kitchen)'),
  ('order','in_kitchen','partially_ready','orders.edit',   false, 'PREPARING → PARTIALLY_READY'),
  ('order','in_kitchen','ready',          'orders.edit',   false, 'PREPARING → READY'),
  ('order','partially_ready','ready',     'orders.edit',   false, 'PARTIALLY_READY → READY'),
  ('order','confirmed','ready',           'orders.edit',   true,  'Direct fire: SENT → READY (kitchen bypass, manager)'),
  ('order','ready','served',              'orders.edit',   false, 'READY → SERVED'),
  ('order','served','payment_pending',    'orders.edit',   false, 'SERVED → PAYMENT_PENDING (bill requested)'),
  ('order','payment_pending','paid',      'orders.edit',   false, 'PAYMENT_PENDING → PAID (payment completed)'),
  ('order','paid','closed',               'orders.edit',   false, 'PAID → CLOSED (order archived)'),
  -- --- direct payment edges (counter / walk-in / financial) — manager gated ---
  ('order','served','paid',               'payments.void', true,  'SERVED → PAID (cashout without bill step)'),
  ('order','confirmed','paid',            'payments.void', true,  'Prepaid / counter pay'),
  ('order','new','paid',                  'payments.void', true,  'Walk-in cash accept without confirm'),
  ('order','draft','paid',                'payments.void', true,  'Draft accepted directly'),
  -- --- VOIDED (exception) — never after payment ---
  ('order','draft','voided',              'order.void',    false, 'VOID before any activity'),
  ('order','new','voided',                'order.void',    false, 'VOID open order'),
  ('order','open','voided',               'order.void',    false, 'VOID open order (canonical)'),
  ('order','confirmed','voided',          'order.void',    false, 'VOID confirmed order'),
  ('order','in_kitchen','voided',         'order.void',    true,  'VOID in kitchen (manager override)'),
  ('order','partially_ready','voided',    'order.void',    true,  'VOID partially ready (manager)'),
  ('order','ready','voided',              'order.void',    true,  'VOID ready (manager)'),
  ('order','served','voided',             'order.void',    true,  'VOID served (manager)'),
  ('order','payment_pending','voided',    'payments.void', true,  'VOID at payment stage (manager)'),
  -- --- CANCELLED (exception) ---
  ('order','voided','cancelled',          'orders.cancel', false, 'VOIDED → CANCELLED (archive terminal)'),
  ('order','refunded','cancelled',        'orders.cancel', false, 'REFUNDED → CANCELLED (archive terminal)'),
  ('order','partially_refunded','cancelled','orders.cancel', false, 'PARTIAL REFUND → CANCELLED'),
  -- --- REFUNDED (exception) — only after payment ---
  ('order','paid','refunded',             'refund.approve', true, 'PAID → REFUNDED (full refund, manager)'),
  ('order','closed','refunded',           'refund.approve', true, 'CLOSED → REFUNDED (manager)'),
  ('order','partially_refunded','refunded','refund.approve', true, 'PARTIAL → FULL refund'),
  ('order','paid','partially_refunded',   'refund.approve', true, 'PAID → PARTIALLY_REFUNDED'),
  ('order','closed','partially_refunded', 'refund.approve', true, 'CLOSED → PARTIALLY_REFUNDED'),
  -- --- REOPENED (exception) — manager gated ---
  ('order','paid','confirmed',            'orders.edit',   true,  'REOPEN paid order (manager)'),
  ('order','paid','new',                  'orders.edit',   true,  'REOPEN paid → active (undo auto-close)'),
  ('order','closed','new',                'orders.edit',   true,  'REOPEN closed order (manager)'),
  ('order','closed','open',               'orders.edit',   true,  'REOPEN closed → canonical open'),
  ('order','refunded','new',              'orders.edit',   true,  'REOPEN refunded (manager)'),
  ('order','partially_refunded','confirmed','orders.edit', true,  'REOPEN partial refund'),
  -- --- undo operations (saito_undo / ops) ---
  ('order','voided','new',                'orders.edit',   true,  'Undo void → active'),
  ('order','cancelled','new',             'orders.edit',   true,  'Undo cancel → active'),
  -- --- existing legacy cancellation edges (enriched with permission) ---
  ('order','confirmed','cancelled',       'orders.cancel', false, 'Cancel confirmed'),
  ('order','draft','cancelled',           'orders.cancel', false, 'Cancel draft'),
  ('order','in_kitchen','cancelled',      'orders.cancel', true,  'Cancel in kitchen (manager)'),
  ('order','new','cancelled',             'orders.cancel', false, 'Cancel open'),
  ('order','open','cancelled',            'orders.cancel', false, 'Cancel open (legacy label)'),
  ('order','preparing','cancelled',       'orders.cancel', false, 'Cancel preparing (legacy label)'),
  ('order','partially_ready','cancelled', 'orders.cancel', true,  'Cancel partially ready'),
  ('order','payment_pending','cancelled', 'orders.cancel', true,  'Cancel at payment (manager)'),
  ('order','ready','cancelled',           'orders.cancel', true,  'Cancel ready (manager)'),
  ('order','served','cancelled',          'orders.cancel', true,  'Cancel served (manager)'),
  -- --- legacy-compat: process_order_payment pays from any non-paid status ---
  ('order','open','paid',                 'payments.void', true,  'Legacy pay from open'),
  ('order','preparing','paid',            'payments.void', true,  'Legacy pay from preparing'),
  ('order','in_kitchen','paid',           'payments.void', true,  'Legacy pay from in_kitchen'),
  ('order','partially_ready','paid',      'payments.void', true,  'Legacy pay from partially_ready'),
  ('order','ready','paid',                'payments.void', true,  'Legacy pay from ready'),
  -- --- legacy-compat: void from preparing ---
  ('order','preparing','voided',          'order.void',    true,  'VOID preparing (manager)')
ON CONFLICT (entity, from_status, to_status) DO UPDATE SET
  requires_permission = EXCLUDED.requires_permission,
  requires_manager_override = EXCLUDED.requires_manager_override,
  is_active = true,
  description = EXCLUDED.description;

-- 6. validate_transition — expose permission + override for the new layer
CREATE OR REPLACE FUNCTION validate_transition(p_entity text, p_from_status text, p_to_status text)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  v_rule RECORD;
BEGIN
  SELECT * INTO v_rule
  FROM public.state_transitions
  WHERE entity = p_entity
    AND from_status = p_from_status
    AND to_status = p_to_status
    AND is_active = true;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'valid', false,
      'error', format('Invalid transition: %s → %s for %s', p_from_status, p_to_status, p_entity)
    );
  END IF;

  RETURN jsonb_build_object(
    'valid', true,
    'requires_role', v_rule.requires_role,
    'requires_permission', v_rule.requires_permission,
    'requires_manager_override', v_rule.requires_manager_override,
    'description', v_rule.description
  );
END;
$$;

-- 7. Central guard trigger — ANY status write must pass the registry.
CREATE OR REPLACE FUNCTION trg_order_state_machine_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_valid jsonb;
BEGIN
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  -- (a) Registry is the only source of truth for transitions
  v_valid := validate_transition('order', OLD.status, NEW.status);
  IF NOT (v_valid->>'valid')::boolean THEN
    RAISE EXCEPTION 'INVALID_TRANSITION [% → %]: % (order %)',
      OLD.status, NEW.status, v_valid->>'error', NEW.id USING ERRCODE='P0001';
  END IF;

  -- (b) Canonical timestamps (first time only)
  IF NEW.status = 'paid'          AND NEW.paid_at IS NULL      THEN NEW.paid_at      := now(); END IF;
  IF NEW.status = 'closed'        AND NEW.closed_at IS NULL    THEN NEW.closed_at    := now(); END IF;
  IF NEW.status = 'cancelled'     AND NEW.cancelled_at IS NULL THEN NEW.cancelled_at := now(); END IF;
  IF NEW.status IN ('refunded','partially_refunded') AND NEW.refunded_at IS NULL THEN NEW.refunded_at := now(); END IF;
  IF NEW.status IN ('new','open','confirmed','in_kitchen')
     AND OLD.status IN ('paid','closed','cancelled','refunded','partially_refunded','voided')
  THEN
    NEW.reopened_at := now();
  END IF;

  -- (c) Coarse kitchen_status sync per contract
  IF NEW.status IN ('paid','closed','refunded','partially_refunded')
     AND COALESCE(NEW.kitchen_status,'') NOT IN ('completed','cancelled')
  THEN
    NEW.kitchen_status := 'completed';
  END IF;
  IF NEW.status = 'cancelled' THEN NEW.kitchen_status := 'cancelled'; END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_order_state_machine_guard ON public.orders;
CREATE TRIGGER trg_order_state_machine_guard
  BEFORE UPDATE OF status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION trg_order_state_machine_guard();

-- 8. Canonical transition RPC — the only app-facing entry point.
CREATE OR REPLACE FUNCTION transition_order_atomic(
  p_token text,
  p_order_id uuid,
  p_new_status text,
  p_reason text DEFAULT NULL,
  p_metadata jsonb DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_allowed jsonb;
  v_rule jsonb;
  v_order RECORD;
  v_old_status text;
  v_old_kitchen text;
  v_staff_id uuid;
  v_approver_key text;
  v_has_approver boolean := false;
  v_overr boolean := false;
BEGIN
  -- 1. AUTH
  PERFORM set_session_staff(p_token);
  v_staff_id := current_staff_id();

  -- 2. Lock order
  SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND' USING ERRCODE='P0001';
  END IF;

  v_old_status  := v_order.status;
  v_old_kitchen := v_order.kitchen_status;

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
        COALESCE(v_rule->>'requires_permission', 'orders.edit'),
        v_order.location_id, v_allowed->>'reason' USING ERRCODE='P0001';
    END IF;

    -- 5. MANAGER OVERRIDE GATE (0.3-H integration)
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

    -- 6. ATOMIC UPDATE (guard trigger re-validates + sets timestamps)
    UPDATE orders SET
      status = p_new_status,
      version = COALESCE(version, 0) + 1,
      updated_at = now()
    WHERE id = p_order_id;
  END IF;

  -- 7. AUDIT (order_events + audit_logs + operation_logs)
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
      jsonb_build_object('reopened', v_order.status IS DISTINCT FROM p_new_status AND p_new_status IN ('new','open','confirmed','in_kitchen')));

    -- 8. OUTBOX
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
    'new_status', p_new_status
  );
END;
$$;

COMMIT;