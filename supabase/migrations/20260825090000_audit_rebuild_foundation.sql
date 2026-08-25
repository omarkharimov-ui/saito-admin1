-- =====================================================================
-- SAITO ADMIN 1 — PAYMENT / CASH / STAFF AUDIT-REBUILD FOUNDATION
-- Applied: 2026-08-25  (audit + targeted hardening, additive & backward compatible)
-- Goal: enforce SSOT (Supabase/Postgres = authoritative), atomic RPCs as
--       business-operation boundary, realtime = propagation only.
-- =====================================================================

-- ---------------------------------------------------------------------
-- PART A — PAYMENT INTEGRITY (idempotency + ledger-derived state)
-- ---------------------------------------------------------------------

-- idempotency_keys: store computed result so identical retries dedupe
ALTER TABLE public.payment_idempotency_keys
  ADD COLUMN IF NOT EXISTS result jsonb;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'payment_idempotency_keys_key_unique'
  ) THEN
    ALTER TABLE public.payment_idempotency_keys
      ADD CONSTRAINT payment_idempotency_keys_key_unique UNIQUE (key);
  END IF;
END $$;

-- Recompute orders.* money fields from the order_payments ledger (SSOT).
-- Cash = tender in cash set; Card/non-cash = everything else. Refunds tracked separately.
CREATE OR REPLACE FUNCTION public.recalculate_order_payment_state(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $f$
DECLARE
  v_paid     NUMERIC := 0;
  v_cash     NUMERIC := 0;
  v_refund   NUMERIC := 0;
  v_order    RECORD;
  v_payable  NUMERIC;
  v_method   TEXT;
BEGIN
  SELECT COALESCE(SUM(amount), 0)
    INTO v_paid
    FROM order_payments
   WHERE order_id = p_order_id
     AND COALESCE(status, 'success') IN ('success', 'paid', 'authorized')
     AND COALESCE(is_refund, false) = false;

  SELECT COALESCE(SUM(amount), 0)
    INTO v_cash
    FROM order_payments
   WHERE order_id = p_order_id
     AND COALESCE(status, 'success') IN ('success', 'paid', 'authorized')
     AND COALESCE(is_refund, false) = false
     AND payment_method IN ('cash', 'nağd');

  SELECT COALESCE(SUM(amount), 0)
    INTO v_refund
    FROM order_payments
   WHERE order_id = p_order_id
     AND COALESCE(is_refund, false) = true;

  SELECT * INTO v_order FROM orders WHERE id = p_order_id;
  IF NOT FOUND THEN RETURN; END IF;

  v_payable := COALESCE(v_order.total_amount, 0) - COALESCE(v_order.discount_amount, 0);

  v_method := v_order.payment_method;
  IF v_paid > 0 THEN
    IF v_cash > 0 AND (v_paid - v_cash) > 0 THEN v_method := 'split';
    ELSIF (v_paid - v_cash) > 0 THEN v_method := 'card';
    ELSE v_method := 'cash';
    END IF;
  END IF;

  UPDATE orders SET
    paid_amount   = v_paid,
    cash_amount   = v_cash,
    card_amount   = (v_paid - v_cash),
    refund_amount = v_refund,
    payment_method = CASE WHEN v_paid > 0 THEN v_method ELSE v_order.payment_method END,
    status = CASE
               WHEN v_payable > 0 AND v_paid >= v_payable THEN 'paid'
               WHEN v_paid > 0 THEN v_order.status
               ELSE v_order.status
             END,
    paid_at = CASE
                WHEN v_payable > 0 AND v_paid >= v_payable AND v_order.paid_at IS NULL THEN NOW()
                ELSE v_order.paid_at
              END,
    version   = COALESCE(v_order.version, 0) + 1,
    updated_at = NOW()
  WHERE id = p_order_id;
END;
$f$;

-- Hardened canonical payment completion (replaces the 11-arg overload used by
-- the POS /api/orders/pay route). Adds automatic idempotency (derived key from
-- inputs) and derives all money state from the ledger instead of call params.
CREATE OR REPLACE FUNCTION public.complete_payment_atomic(
  p_order_id uuid,
  p_payments jsonb,
  p_payment_method text,
  p_cash_amount numeric,
  p_card_amount numeric,
  p_tip_amount numeric,
  p_discount_amount numeric,
  p_discount_type text,
  p_performed_by uuid,
  p_performed_by_terminal_id text,
  p_cash_drawer_session_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_order RECORD;
  v_payment JSONB;
  v_table RECORD;
  v_other_active_count INT;
  v_key TEXT;
  v_existing JSONB;
  v_payable NUMERIC;
  v_result JSONB;
BEGIN
  -- Automatic idempotency: identical payloads (e.g. triple-click / network retry)
  -- collapse to a single authoritative result.
  v_key := md5(
    p_order_id::text || COALESCE(p_payments::text, '') ||
    COALESCE(p_discount_amount, 0)::text || COALESCE(p_cash_amount, 0)::text ||
    COALESCE(p_card_amount, 0)::text || COALESCE(p_tip_amount, 0)::text
  );

  SELECT result INTO v_existing
    FROM payment_idempotency_keys
   WHERE key = v_key AND status = 'completed';
  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  INSERT INTO payment_idempotency_keys (key, order_id, amount, status, result)
  VALUES (v_key, p_order_id, COALESCE(p_cash_amount, 0) + COALESCE(p_card_amount, 0), 'processing', NULL)
  ON CONFLICT (key) DO NOTHING;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'ORDER_NOT_FOUND');
  END IF;

  IF v_order.status = 'paid' THEN
    PERFORM recalculate_order_payment_state(p_order_id);
    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
    v_result := jsonb_build_object(
      'success', true, 'message', 'ALREADY_PAID', 'order_id', p_order_id,
      'paid_amount', v_order.paid_amount, 'table_number', v_order.table_number,
      'tip_amount', v_order.tip_amount, 'cogs', v_order.cogs, 'profit', v_order.profit
    );
    UPDATE payment_idempotency_keys SET status = 'completed', result = v_result WHERE key = v_key;
    RETURN v_result;
  END IF;

  IF v_order.status = 'cancelled' THEN
    RETURN jsonb_build_object('success', false, 'error', 'ORDER_ALREADY_CANCELLED');
  END IF;

  FOR v_payment IN SELECT * FROM jsonb_array_elements(p_payments) LOOP
    INSERT INTO public.order_payments (
      order_id, payment_method, method, amount, currency, status,
      split_group_id, is_partial, is_refund, created_by, reference
    ) VALUES (
      p_order_id,
      COALESCE(v_payment->>'method', 'cash'),
      COALESCE(v_payment->>'method', 'cash'),
      COALESCE((v_payment->>'amount')::NUMERIC, 0),
      COALESCE(v_payment->>'currency', 'AZN'),
      COALESCE(v_payment->>'status', 'success'),
      (v_payment->>'split_group_id')::UUID,
      COALESCE((v_payment->>'is_partial')::BOOLEAN, false),
      COALESCE((v_payment->>'is_refund')::BOOLEAN, false),
      p_performed_by,
      COALESCE(v_payment->>'transaction_id', NULL)
    );
  END LOOP;

  -- Derive money state from the ledger (SSOT)
  PERFORM recalculate_order_payment_state(p_order_id);
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;

  v_payable := v_order.total_amount - COALESCE(v_order.discount_amount, 0);

  -- Side effects only when authoritative ledger says fully paid
  IF v_payable > 0 AND v_order.paid_amount >= v_payable THEN
    PERFORM public.deduct_stock_for_order(p_order_id);

    IF v_order.table_number IS NOT NULL AND v_order.table_number > 0 THEN
      SELECT COUNT(*) INTO v_other_active_count
        FROM public.orders
       WHERE table_number = v_order.table_number
         AND id != p_order_id
         AND status NOT IN ('paid', 'cancelled', 'closed');
      IF v_other_active_count = 0 THEN
        SELECT * INTO v_table
          FROM public.table_floors
         WHERE table_number = v_order.table_number FOR UPDATE;
        IF FOUND THEN
          UPDATE public.table_floors SET
            status = 'cleaning', current_order_id = NULL, guest_count = NULL,
            total_amount = 0, order_count = 0, bill_requested = false,
            kitchen_status = NULL, updated_at = NOW()
          WHERE table_number = v_order.table_number;
        END IF;
      END IF;
    END IF;
  END IF;

  INSERT INTO public.operation_logs (
    table_number, order_id, action, old_values, new_values, performed_by
  ) VALUES (
    v_order.table_number, p_order_id, 'complete_payment',
    jsonb_build_object('status', v_order.status),
    jsonb_build_object('status', v_order.status, 'paid_amount', v_order.paid_amount),
    p_performed_by
  );

  v_result := jsonb_build_object(
    'success', true, 'order_id', p_order_id, 'paid_amount', v_order.paid_amount,
    'table_number', v_order.table_number, 'tip_amount', v_order.tip_amount,
    'cogs', v_order.cogs, 'profit', v_order.profit
  );

  UPDATE payment_idempotency_keys SET status = 'completed', result = v_result WHERE key = v_key;
  RETURN v_result;
END;
$function$;

-- ---------------------------------------------------------------------
-- PART B — CASH REGISTER (canonical model + un-break close)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.cash_registers (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  terminal_id text,
  location    text,
  status      text NOT NULL DEFAULT 'active',
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.cash_drawer_sessions
  ADD COLUMN IF NOT EXISTS register_id uuid REFERENCES public.cash_registers(id);

CREATE INDEX IF NOT EXISTS idx_cash_drawer_sessions_register
  ON public.cash_drawer_sessions(register_id);

INSERT INTO public.cash_registers (name, terminal_id, location, status)
SELECT 'Əsas Kassa', 'POS-01', 'Restoran', 'active'
WHERE NOT EXISTS (SELECT 1 FROM public.cash_registers WHERE name = 'Əsas Kassa');

-- Authoritative expected balance = opening + payments/cash_in - cash_out.
CREATE OR REPLACE FUNCTION public.recalculate_cash_session(p_session_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_session cash_drawer_sessions%ROWTYPE;
  v_expected NUMERIC;
BEGIN
  SELECT * INTO v_session FROM cash_drawer_sessions WHERE id = p_session_id FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT COALESCE(v_session.opening_balance, 0)
         + COALESCE(SUM(CASE WHEN type IN ('payment', 'cash_in', 'card_payment') THEN amount ELSE 0 END), 0)
         - COALESCE(SUM(CASE WHEN type IN ('cash_out') THEN amount ELSE 0 END), 0)
    INTO v_expected
  FROM cash_drawer_log
  WHERE session_id = p_session_id;

  UPDATE cash_drawer_sessions
     SET expected_balance = v_expected
   WHERE id = p_session_id;
  RETURN v_expected;
END;
$$;

CREATE OR REPLACE FUNCTION public.open_cash_register(
  p_register_id uuid DEFAULT NULL,
  p_opening_balance numeric DEFAULT 0,
  p_opened_by uuid DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO cash_drawer_sessions (register_id, opening_balance, status, opened_by, notes)
  VALUES (p_register_id, COALESCE(p_opening_balance, 0), 'open', p_opened_by, p_notes)
  RETURNING id INTO v_id;

  INSERT INTO cash_drawer_log (session_id, type, amount, description, created_by)
  VALUES (v_id, 'open', COALESCE(p_opening_balance, 0), COALESCE(p_notes, 'Kassa açıldı'), p_opened_by);

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.close_cash_register_v2(
  p_session_id uuid,
  p_actual_cash numeric,
  p_closed_by uuid DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_expected NUMERIC; v_diff NUMERIC;
BEGIN
  v_expected := recalculate_cash_session(p_session_id);
  v_diff := COALESCE(p_actual_cash, 0) - COALESCE(v_expected, 0);

  UPDATE cash_drawer_sessions SET
    status = 'closed',
    closed_at = now(),
    closing_balance = COALESCE(p_actual_cash, 0),
    expected_balance = v_expected,
    difference = v_diff,
    closed_by = p_closed_by,
    notes = COALESCE(p_notes, notes)
  WHERE id = p_session_id;

  INSERT INTO cash_drawer_log (session_id, type, amount, description, created_by)
  VALUES (p_session_id, 'close', COALESCE(p_actual_cash, 0),
          COALESCE(p_notes, 'Kassa bağlandı. Fərq: ' || v_diff), p_closed_by);

  RETURN jsonb_build_object(
    'session_id', p_session_id, 'expected_balance', v_expected,
    'actual_cash', p_actual_cash, 'difference', v_diff
  );
END;
$$;

-- Fix legacy close_cash_register: it referenced shifts.manager_approved /
-- shifts.manager_id which do NOT exist -> runtime error. Rewritten to match the
-- real shifts schema (manager kept in notes) and compute expected from ledger.
CREATE OR REPLACE FUNCTION public.close_cash_register(
  p_shift_id uuid,
  p_actual_cash numeric,
  p_notes text DEFAULT NULL,
  p_manager_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_shift shifts%ROWTYPE;
  v_expected NUMERIC;
  v_diff NUMERIC;
BEGIN
  SELECT * INTO v_shift FROM shifts WHERE id = p_shift_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SHIFT_NOT_FOUND'; END IF;
  IF v_shift.closed_at IS NOT NULL THEN RAISE EXCEPTION 'SHIFT_ALREADY_CLOSED'; END IF;

  SELECT COALESCE(SUM(op.amount), 0)
    INTO v_expected
    FROM order_payments op
    JOIN orders o ON o.id = op.order_id
   WHERE op.payment_method IN ('cash', 'nağd')
     AND o.status = 'paid'
     AND o.created_by = v_shift.staff_id
     AND o.paid_at BETWEEN v_shift.opened_at AND now();

  v_diff := COALESCE(p_actual_cash, 0) - v_expected;

  UPDATE shifts SET
    closed_at = now(),
    expected_cash = v_expected,
    actual_cash = COALESCE(p_actual_cash, 0),
    difference = v_diff,
    notes = COALESCE(p_notes, '') || COALESCE(' | manager:' || p_manager_id::text, ''),
    updated_at = now()
  WHERE id = p_shift_id;

  RETURN jsonb_build_object(
    'shift_id', p_shift_id, 'expected_cash', v_expected,
    'actual_cash', p_actual_cash, 'difference', v_diff
  );
END;
$$;

-- ---------------------------------------------------------------------
-- PART C — STAFF ROLES & PERMISSIONS FOUNDATION (additive)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.permissions (
  key         text PRIMARY KEY,
  description text
);

CREATE TABLE IF NOT EXISTS public.roles (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name      text UNIQUE NOT NULL,
  is_system boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.role_permissions (
  role_id       uuid NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  permission_key text NOT NULL REFERENCES public.permissions(key) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_key)
);

ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS role_id uuid REFERENCES public.roles(id);

INSERT INTO public.permissions (key, description) VALUES
  ('orders.view', 'View orders'),
  ('orders.create', 'Create orders'),
  ('orders.edit', 'Edit orders'),
  ('orders.cancel', 'Cancel orders'),
  ('payments.create', 'Create payments'),
  ('payments.refund', 'Refund payments'),
  ('payments.void', 'Void payments'),
  ('cash.open', 'Open cash register'),
  ('cash.close', 'Close cash register'),
  ('cash.in', 'Cash in'),
  ('cash.out', 'Cash out'),
  ('discount.create', 'Create discounts'),
  ('discount.approve', 'Approve discounts'),
  ('staff.view', 'View staff'),
  ('staff.manage', 'Manage staff'),
  ('reports.view', 'View reports'),
  ('inventory.view', 'View inventory'),
  ('inventory.adjust', 'Adjust inventory'),
  ('reservations.view', 'View reservations'),
  ('reservations.manage', 'Manage reservations'),
  ('kitchen.view', 'View kitchen'),
  ('kitchen.manage', 'Manage kitchen')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.roles (name, is_system) VALUES
  ('owner', true), ('admin', true), ('manager', true), ('cashier', true),
  ('waiter', true), ('host', true), ('kitchen', true), ('bartender', true),
  ('stock', true), ('accountant', true)
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_key)
SELECT r.id, p.key
  FROM roles r, permissions p
 WHERE (r.name IN ('owner', 'admin'))
    OR (r.name = 'manager' AND p.key IN (
         'orders.view','orders.create','orders.edit','orders.cancel',
         'payments.create','payments.refund','payments.void',
         'cash.open','cash.close','cash.in','cash.out',
         'discount.create','discount.approve',
         'staff.view','staff.manage','reports.view',
         'inventory.view','inventory.adjust',
         'reservations.view','reservations.manage',
         'kitchen.view','kitchen.manage'))
    OR (r.name = 'cashier' AND p.key IN (
         'orders.view','orders.create','orders.edit','orders.cancel',
         'payments.create','payments.refund',
         'cash.open','cash.close','cash.in','cash.out',
         'discount.create','reports.view'))
    OR (r.name = 'waiter' AND p.key IN ('orders.view','orders.create','orders.edit','reservations.view'))
    OR (r.name = 'host' AND p.key IN ('reservations.view','reservations.manage','orders.view'))
    OR (r.name = 'kitchen' AND p.key IN ('kitchen.view','kitchen.manage','orders.view'))
    OR (r.name = 'bartender' AND p.key IN ('orders.view','orders.create','orders.edit','payments.create'))
    OR (r.name = 'stock' AND p.key IN ('inventory.view','inventory.adjust','staff.view'))
    OR (r.name = 'accountant' AND p.key IN ('reports.view','cash.open','cash.close','cash.in','cash.out','staff.view','payments.refund'))
ON CONFLICT (role_id, permission_key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.has_permission(p_staff_id uuid, p_permission text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM staff s
      JOIN roles r ON r.id = s.role_id
      JOIN role_permissions rp ON rp.role_id = r.id
     WHERE s.id = p_staff_id AND rp.permission_key = p_permission
  ) OR EXISTS (
    SELECT 1 FROM staff s WHERE s.id = p_staff_id AND s.role = 'admin'
  );
$$;

-- ---------------------------------------------------------------------
-- PART D — UNIFIED AUDIT ENTRY POINT (audit_logs is canonical)
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.log_audit(
  p_action text,
  p_entity_type text,
  p_entity_id text,
  p_performed_by uuid DEFAULT NULL,
  p_old_data jsonb DEFAULT NULL,
  p_new_data jsonb DEFAULT NULL,
  p_details jsonb DEFAULT NULL,
  p_terminal text DEFAULT NULL,
  p_ip text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO audit_logs (
    action, target_type, target_id, performed_by,
    old_data, new_data, details, table_name, record_id, staff_id, ip_address, created_at
  ) VALUES (
    p_action, p_entity_type, p_entity_id, p_performed_by,
    p_old_data, p_new_data, p_details, p_entity_type, p_entity_id,
    p_performed_by, p_ip, now()
  ) RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- ---------------------------------------------------------------------
-- RLS for new tables (service_role bypasses; authenticated can read)
-- ---------------------------------------------------------------------

ALTER TABLE public.cash_registers      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roles               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cash_registers_select ON public.cash_registers;
CREATE POLICY cash_registers_select ON public.cash_registers
  FOR SELECT USING (auth.role() IN ('authenticated', 'service_role'));
DROP POLICY IF EXISTS permissions_select ON public.permissions;
CREATE POLICY permissions_select ON public.permissions
  FOR SELECT USING (auth.role() IN ('authenticated', 'service_role'));
DROP POLICY IF EXISTS roles_select ON public.roles;
CREATE POLICY roles_select ON public.roles
  FOR SELECT USING (auth.role() IN ('authenticated', 'service_role'));
DROP POLICY IF EXISTS role_permissions_select ON public.role_permissions;
CREATE POLICY role_permissions_select ON public.role_permissions
  FOR SELECT USING (auth.role() IN ('authenticated', 'service_role'));

GRANT EXECUTE ON FUNCTION public.recalculate_order_payment_state(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.complete_payment_atomic(uuid, jsonb, text, numeric, numeric, numeric, numeric, text, uuid, text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.recalculate_cash_session(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.open_cash_register(uuid, numeric, uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.close_cash_register_v2(uuid, numeric, uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.close_cash_register(uuid, numeric, text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_permission(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.log_audit(text, text, text, uuid, jsonb, jsonb, jsonb, text, text) TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cash_registers TO service_role;
GRANT SELECT ON public.permissions, public.roles, public.role_permissions TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.roles, public.role_permissions TO service_role;
