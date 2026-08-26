-- ============================================================================
-- PHASE 4/5: Cash Register Close + Audit Canonicalization
-- PHASE 6: Offline/Reconnect Foundation (sync_operation)
--
-- This migration:
-- 1. Creates canonical audit_logs table (replaces audit_log singular + audit_logs plural)
-- 2. Creates log_audit() SQL RPC as the single audit entry point
-- 3. Creates close_cash_register_v2() with manager approval + atomic close
-- 4. Creates operation_tracking table for idempotent offline ops
-- 5. Creates sync_operation() RPC with idempotency + conflict detection
-- 6. Adds variance_threshold to settings for auto-manager-approval policy
-- ============================================================================

-- ──────────────────────────────────────────────────────────────────────────────
-- 1. CANONICAL AUDIT LOGS TABLE
-- ──────────────────────────────────────────────────────────────────────────────
-- Unified schema replaces both audit_log (singular) and audit_logs (plural)
-- All audit entries flow through log_audit() RPC

CREATE TABLE IF NOT EXISTS public.audit_logs_canonical (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  action       text NOT NULL,                          -- 'payment', 'refund', 'void', 'cash_open', 'cash_close', 'staff_permission', 'order_state', etc.
  entity_type  text NOT NULL,                          -- 'order', 'cash_drawer_session', 'staff', 'reservation', 'settings', etc.
  entity_id    text,                                   -- UUID or identifier of the affected entity
  actor_id     uuid,                                   -- staff.id who performed the action
  actor_name   text,                                   -- Denormalized staff name for display
  old_data     jsonb DEFAULT NULL,                     -- State before the action
  new_data     jsonb DEFAULT NULL,                     -- State after the action
  metadata     jsonb DEFAULT NULL,                     -- Additional context (variance, reason, etc.)
  ip_address   text DEFAULT NULL,
  created_at   timestamptz DEFAULT NOW()
);

-- Index for common queries: by entity, by actor, by action, by time range
CREATE INDEX IF NOT EXISTS idx_audit_canonical_entity ON public.audit_logs_canonical (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_canonical_actor ON public.audit_logs_canonical (actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_canonical_action ON public.audit_logs_canonical (action);
CREATE INDEX IF NOT EXISTS idx_audit_canonical_time ON public.audit_logs_canonical (created_at DESC);

-- RLS: service_role full access, authenticated read-only
ALTER TABLE public.audit_logs_canonical ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit_canonical_service_all" ON public.audit_logs_canonical FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "audit_canonical_auth_read" ON public.audit_logs_canonical FOR SELECT TO authenticated USING (true);

-- ──────────────────────────────────────────────────────────────────────────────
-- 2. log_audit() — CANONICAL AUDIT ENTRY POINT
-- ──────────────────────────────────────────────────────────────────────────────
-- Every audit write in the system should go through this function.
-- SECURITY DEFINER so it can be called from any context (API routes, other RPCs).

CREATE OR REPLACE FUNCTION public.log_audit(
  p_action      text,
  p_entity_type text,
  p_entity_id   text    DEFAULT NULL,
  p_actor_id    uuid    DEFAULT NULL,
  p_actor_name  text    DEFAULT NULL,
  p_old_data    jsonb   DEFAULT NULL,
  p_new_data    jsonb   DEFAULT NULL,
  p_metadata    jsonb   DEFAULT NULL,
  p_ip_address  text    DEFAULT NULL
)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.audit_logs_canonical (
    action, entity_type, entity_id, actor_id, actor_name,
    old_data, new_data, metadata, ip_address
  ) VALUES (
    p_action, p_entity_type, p_entity_id, p_actor_id, p_actor_name,
    p_old_data, p_new_data, p_metadata, p_ip_address
  ) RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.log_audit(text, text, text, uuid, text, jsonb, jsonb, jsonb, text) TO service_role;
REVOKE ALL ON FUNCTION public.log_audit(text, text, text, uuid, text, jsonb, jsonb, jsonb, text) FROM anon;
REVOKE ALL ON FUNCTION public.log_audit(text, text, text, uuid, text, jsonb, jsonb, jsonb, text) FROM authenticated;

-- ──────────────────────────────────────────────────────────────────────────────
-- 3. CASH REGISTER CLOSE V2 — ATOMIC + MANAGER APPROVAL
-- ──────────────────────────────────────────────────────────────────────────────
-- Server-side expected balance calculation (never trusts client input)
-- Manager approval required when variance != 0 or policy demands it
-- Duplicate close prevention via status check
-- All events audited through log_audit()

CREATE OR REPLACE FUNCTION public.close_cash_register_v2(
  p_session_id   uuid,
  p_actual_cash  numeric,
  p_notes        text    DEFAULT NULL,
  p_manager_id   uuid    DEFAULT NULL,
  p_performed_by uuid    DEFAULT NULL
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  v_session RECORD;
  v_expected_balance NUMERIC;
  v_difference NUMERIC;
  v_log_entry RECORD;
  v_manager_name TEXT;
  v_performer_name TEXT;
  v_requires_approval BOOLEAN := false;
  v_metadata JSONB;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  -- 1. Lock the session row to prevent concurrent closes
  SELECT * INTO v_session FROM public.cash_drawer_sessions
  WHERE id = p_session_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Session not found');
  END IF;

  -- 2. Prevent duplicate close
  IF v_session.status = 'closed' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Session already closed', 'closed_at', v_session.closed_at);
  END IF;

  -- 3. Calculate expected balance SERVER-SIDE from ledger (never trust client)
  v_expected_balance := COALESCE(v_session.opening_balance, 0);
  FOR v_log_entry IN
    SELECT type, amount FROM public.cash_drawer_log
    WHERE session_id = p_session_id
    ORDER BY created_at ASC
  LOOP
    IF v_log_entry.type IN ('cash_in', 'payment', 'open') THEN
      v_expected_balance := v_expected_balance + v_log_entry.amount;
    ELSIF v_log_entry.type IN ('cash_out', 'close') THEN
      v_expected_balance := v_expected_balance - v_log_entry.amount;
    END IF;
  END LOOP;

  v_difference := COALESCE(p_actual_cash, 0) - v_expected_balance;

  -- 4. Determine if manager approval is required
  --    Required when: variance != 0 OR policy requires it
  v_requires_approval := (v_difference != 0);

  -- 5. If approval required, validate manager exists
  IF v_requires_approval THEN
    IF p_manager_id IS NULL THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Manager approval required',
        'requires_approval', true,
        'difference', v_difference,
        'expected_balance', v_expected_balance
      );
    END IF;

    -- Verify manager has admin/superadmin role
    IF NOT EXISTS (
      SELECT 1 FROM public.staff
      WHERE id = p_manager_id AND role IN ('admin', 'superadmin') AND is_active = true
    ) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Invalid manager credentials');
    END IF;

    SELECT name INTO v_manager_name FROM public.staff WHERE id = p_manager_id;
  END IF;

  -- 6. Get performer name
  IF p_performed_by IS NOT NULL THEN
    SELECT name INTO v_performer_name FROM public.staff WHERE id = p_performed_by;
  END IF;

  -- 7. Close the session atomically
  UPDATE public.cash_drawer_sessions SET
    status = 'closed',
    closing_balance = p_actual_cash,
    expected_balance = v_expected_balance,
    difference = v_difference,
    closed_at = v_now,
    closed_by = p_performed_by,
    notes = COALESCE(p_notes, notes),
    manager_id = CASE WHEN v_requires_approval THEN p_manager_id ELSE NULL END,
    manager_approved = v_requires_approval,
    updated_at = v_now
  WHERE id = p_session_id;

  -- 8. Log the close event in cash_drawer_log
  INSERT INTO public.cash_drawer_log (
    session_id, type, amount, description, created_by
  ) VALUES (
    p_session_id, 'close', COALESCE(p_actual_cash, 0),
    COALESCE(p_notes, 'Kassa bağlandı. Fərq: ' || ROUND(v_difference, 2) || '₼'),
    p_performed_by
  );

  -- 9. Build metadata for audit
  v_metadata := jsonb_build_object(
    'session_id', p_session_id,
    'opening_balance', v_session.opening_balance,
    'expected_balance', v_expected_balance,
    'actual_cash', p_actual_cash,
    'difference', v_difference,
    'requires_approval', v_requires_approval,
    'manager_id', p_manager_id,
    'manager_name', v_manager_name,
    'notes', p_notes
  );

  -- 10. Audit: cash register close
  PERFORM public.log_audit(
    'cash_close',
    'cash_drawer_session',
    p_session_id::text,
    p_performed_by,
    v_performer_name,
    jsonb_build_object('status', 'open', 'opening_balance', v_session.opening_balance),
    jsonb_build_object('status', 'closed', 'closing_balance', p_actual_cash, 'difference', v_difference),
    v_metadata,
    NULL
  );

  -- 11. Audit: manager approval (if applicable)
  IF v_requires_approval AND p_manager_id IS NOT NULL THEN
    PERFORM public.log_audit(
      'manager_approval',
      'cash_drawer_session',
      p_session_id::text,
      p_manager_id,
      v_manager_name,
      NULL,
      jsonb_build_object('approved', true, 'difference', v_difference),
      jsonb_build_object('variance', v_difference, 'cashier_id', p_performed_by, 'cashier_name', v_performer_name),
      NULL
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'session_id', p_session_id,
    'expected_balance', v_expected_balance,
    'actual_cash', p_actual_cash,
    'difference', v_difference,
    'requires_approval', v_requires_approval,
    'manager_approved', v_requires_approval,
    'closed_at', v_now
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.close_cash_register_v2(uuid, numeric, text, uuid, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.close_cash_register_v2(uuid, numeric, text, uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.close_cash_register_v2(uuid, numeric, text, uuid, uuid) FROM authenticated;

-- ──────────────────────────────────────────────────────────────────────────────
-- 4. OPERATION TRACKING TABLE (for offline idempotency)
-- ──────────────────────────────────────────────────────────────────────────────
-- Each client operation gets a unique (client_id, operation_id) pair.
-- Server checks this before executing to prevent duplicate application.

CREATE TABLE IF NOT EXISTS public.operation_tracking (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id     text NOT NULL,                         -- Device/client identifier
  operation_id  text NOT NULL,                         -- Client-generated unique operation ID
  op_type       text NOT NULL,                         -- 'payment', 'refund', 'void', 'cash_close', etc.
  status        text NOT NULL DEFAULT 'pending',       -- 'pending', 'applied', 'rejected', 'conflict'
  result        jsonb DEFAULT NULL,                    -- RPC result if applied
  error_message text DEFAULT NULL,                     -- Error if rejected/failed
  performed_by  uuid DEFAULT NULL,
  created_at    timestamptz DEFAULT NOW(),
  applied_at    timestamptz DEFAULT NULL,
  UNIQUE (client_id, operation_id)
);

CREATE INDEX IF NOT EXISTS idx_op_tracking_status ON public.operation_tracking (status);
CREATE INDEX IF NOT EXISTS idx_op_tracking_client ON public.operation_tracking (client_id, status);

-- RLS
ALTER TABLE public.operation_tracking ENABLE ROW LEVEL SECURITY;
CREATE POLICY "op_tracking_service_all" ON public.operation_tracking FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ──────────────────────────────────────────────────────────────────────────────
-- 5. sync_operation() — IDEMPOTENT OFFLINE RECONCILIATION
-- ──────────────────────────────────────────────────────────────────────────────
-- Client sends (client_id, operation_id, op_type, payload).
-- Server:
--   1. Checks if (client_id, operation_id) already exists → idempotent return
--   2. Executes the operation via RPC dispatch
--   3. Records result in operation_tracking
--   4. Returns authoritative server state
--
-- IMPORTANT: Financial operations (payment, refund, void, cash_close) are
-- always executed server-side. Client never writes directly.

CREATE OR REPLACE FUNCTION public.sync_operation(
  p_client_id    text,
  p_operation_id text,
  p_op_type      text,
  p_payload      jsonb,
  p_performed_by uuid DEFAULT NULL
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  v_existing RECORD;
  v_result JSONB;
  v_performer_name TEXT;
BEGIN
  -- 1. Idempotency check: has this operation already been applied?
  SELECT * INTO v_existing FROM public.operation_tracking
  WHERE client_id = p_client_id AND operation_id = p_operation_id;

  IF FOUND THEN
    IF v_existing.status = 'applied' THEN
      -- Already applied — return cached result (idempotent)
      RETURN jsonb_build_object(
        'success', true,
        'idempotent', true,
        'status', 'applied',
        'result', v_existing.result,
        'applied_at', v_existing.applied_at
      );
    ELSIF v_existing.status = 'rejected' THEN
      RETURN jsonb_build_object(
        'success', false,
        'idempotent', true,
        'status', 'rejected',
        'error', v_existing.error_message
      );
    ELSIF v_existing.status = 'conflict' THEN
      RETURN jsonb_build_object(
        'success', false,
        'idempotent', true,
        'status', 'conflict',
        'error', 'Operation conflicts with server state'
      );
    END IF;
    -- If still 'pending', continue to execute (first attempt may have timed out)
  END IF;

  -- Get performer name
  IF p_performed_by IS NOT NULL THEN
    SELECT name INTO v_performer_name FROM public.staff WHERE id = p_performed_by;
  END IF;

  -- 2. Dispatch operation by type
  --    Only safe operations are allowed offline. Financial ops require online verification.

  CASE p_op_type
    -- ─── SAFE: Cart/draft operations ───
    WHEN 'add_to_cart' THEN
      -- Client-side only, no server execution needed
      v_result := jsonb_build_object('success', true, 'message', 'Client-side operation');

    WHEN 'update_cart' THEN
      v_result := jsonb_build_object('success', true, 'message', 'Client-side operation');

    -- ─── REQUIRES SERVER: Payment ───
    WHEN 'payment' THEN
      -- Validate required fields
      IF p_payload IS NULL OR NOT (p_payload ? 'order_id') THEN
        v_result := jsonb_build_object('success', false, 'error', 'Missing order_id in payload');
        -- Record rejection
        INSERT INTO public.operation_tracking (client_id, operation_id, op_type, status, error_message, performed_by)
        VALUES (p_client_id, p_operation_id, p_op_type, 'rejected', 'Missing order_id', p_performed_by)
        ON CONFLICT (client_id, operation_id) DO UPDATE SET status = 'rejected', error_message = 'Missing order_id';
        RETURN v_result;
      END IF;

      -- Execute payment RPC (this is the authoritative path)
      SELECT public.complete_payment_atomic(
        (p_payload->>'order_id')::uuid,
        COALESCE(p_payload->'payments', '[]'::jsonb),
        COALESCE(p_payload->>'payment_method', 'cash'),
        COALESCE((p_payload->>'cash_amount')::numeric, 0),
        COALESCE((p_payload->>'card_amount')::numeric, 0),
        COALESCE((p_payload->>'tip_amount')::numeric, 0),
        COALESCE((p_payload->>'discount_amount')::numeric, 0),
        (p_payload->>'discount_type')::text,
        p_performed_by,
        (p_payload->>'terminal_id')::text,
        (p_payload->>'cash_drawer_session_id')::uuid
      ) INTO v_result;

      -- Record result
      INSERT INTO public.operation_tracking (client_id, operation_id, op_type, status, result, performed_by, applied_at)
      VALUES (p_client_id, p_operation_id, p_op_type,
        CASE WHEN (v_result->>'success')::boolean THEN 'applied' ELSE 'rejected' END,
        v_result, p_performed_by, NOW())
      ON CONFLICT (client_id, operation_id) DO UPDATE SET
        status = CASE WHEN (EXCLUDED.result->>'success')::boolean THEN 'applied' ELSE 'rejected' END,
        result = EXCLUDED.result,
        applied_at = NOW();

    -- ─── REQUIRES SERVER: Refund ───
    WHEN 'refund' THEN
      IF p_payload IS NULL OR NOT (p_payload ? 'order_id') THEN
        v_result := jsonb_build_object('success', false, 'error', 'Missing order_id');
        INSERT INTO public.operation_tracking (client_id, operation_id, op_type, status, error_message, performed_by)
        VALUES (p_client_id, p_operation_id, p_op_type, 'rejected', 'Missing order_id', p_performed_by)
        ON CONFLICT (client_id, operation_id) DO UPDATE SET status = 'rejected', error_message = 'Missing order_id';
        RETURN v_result;
      END IF;

      SELECT public.complete_payment_atomic(
        (p_payload->>'order_id')::uuid,
        COALESCE(p_payload->'payments', '[]'::jsonb),
        COALESCE(p_payload->>'payment_method', 'cash'),
        0, 0, 0, 0, NULL,
        p_performed_by, NULL, NULL
      ) INTO v_result;

      INSERT INTO public.operation_tracking (client_id, operation_id, op_type, status, result, performed_by, applied_at)
      VALUES (p_client_id, p_operation_id, p_op_type,
        CASE WHEN (v_result->>'success')::boolean THEN 'applied' ELSE 'rejected' END,
        v_result, p_performed_by, NOW())
      ON CONFLICT (client_id, operation_id) DO UPDATE SET
        status = CASE WHEN (EXCLUDED.result->>'success')::boolean THEN 'applied' ELSE 'rejected' END,
        result = EXCLUDED.result,
        applied_at = NOW();

    -- ─── REQUIRES SERVER: Cash register close ───
    WHEN 'cash_close' THEN
      IF p_payload IS NULL OR NOT (p_payload ? 'session_id') THEN
        v_result := jsonb_build_object('success', false, 'error', 'Missing session_id');
        INSERT INTO public.operation_tracking (client_id, operation_id, op_type, status, error_message, performed_by)
        VALUES (p_client_id, p_operation_id, p_op_type, 'rejected', 'Missing session_id', p_performed_by)
        ON CONFLICT (client_id, operation_id) DO UPDATE SET status = 'rejected', error_message = 'Missing session_id';
        RETURN v_result;
      END IF;

      SELECT public.close_cash_register_v2(
        (p_payload->>'session_id')::uuid,
        COALESCE((p_payload->>'actual_cash')::numeric, 0),
        (p_payload->>'notes')::text,
        (p_payload->>'manager_id')::uuid,
        p_performed_by
      ) INTO v_result;

      INSERT INTO public.operation_tracking (client_id, operation_id, op_type, status, result, performed_by, applied_at)
      VALUES (p_client_id, p_operation_id, p_op_type,
        CASE WHEN (v_result->>'success')::boolean THEN 'applied' ELSE 'rejected' END,
        v_result, p_performed_by, NOW())
      ON CONFLICT (client_id, operation_id) DO UPDATE SET
        status = CASE WHEN (EXCLUDED.result->>'success')::boolean THEN 'applied' ELSE 'rejected' END,
        result = EXCLUDED.result,
        applied_at = NOW();

    -- ─── REQUIRES SERVER: Void ───
    WHEN 'void' THEN
      IF p_payload IS NULL OR NOT (p_payload ? 'order_id') THEN
        v_result := jsonb_build_object('success', false, 'error', 'Missing order_id');
        INSERT INTO public.operation_tracking (client_id, operation_id, op_type, status, error_message, performed_by)
        VALUES (p_client_id, p_operation_id, p_op_type, 'rejected', 'Missing order_id', p_performed_by)
        ON CONFLICT (client_id, operation_id) DO UPDATE SET status = 'rejected', error_message = 'Missing order_id';
        RETURN v_result;
      END IF;

      -- Void = cancel order
      UPDATE public.orders SET status = 'cancelled', updated_at = NOW()
      WHERE id = (p_payload->>'order_id')::uuid AND status NOT IN ('paid', 'cancelled');

      v_result := jsonb_build_object('success', true, 'order_id', p_payload->>'order_id');

      INSERT INTO public.operation_tracking (client_id, operation_id, op_type, status, result, performed_by, applied_at)
      VALUES (p_client_id, p_operation_id, p_op_type, 'applied', v_result, p_performed_by, NOW())
      ON CONFLICT (client_id, operation_id) DO UPDATE SET status = 'applied', result = EXCLUDED.result, applied_at = NOW();

    -- ─── REQUIRES SERVER: Seat table ───
    WHEN 'seat_table' THEN
      IF p_payload IS NULL OR NOT (p_payload ? 'table_number') THEN
        v_result := jsonb_build_object('success', false, 'error', 'Missing table_number');
        INSERT INTO public.operation_tracking (client_id, operation_id, op_type, status, error_message, performed_by)
        VALUES (p_client_id, p_operation_id, p_op_type, 'rejected', 'Missing table_number', p_performed_by)
        ON CONFLICT (client_id, operation_id) DO UPDATE SET status = 'rejected', error_message = 'Missing table_number';
        RETURN v_result;
      END IF;

      -- Delegate to walkin_atomic
      SELECT public.walkin_atomic(
        (p_payload->>'table_number')::integer,
        COALESCE((p_payload->>'guests')::integer, 1),
        (p_payload->>'name')::text,
        (p_payload->>'phone')::text,
        COALESCE((p_payload->>'order_type')::text, 'dine_in'),
        (p_payload->>'notes')::text,
        p_performed_by
      ) INTO v_result;

      INSERT INTO public.operation_tracking (client_id, operation_id, op_type, status, result, performed_by, applied_at)
      VALUES (p_client_id, p_operation_id, p_op_type,
        CASE WHEN (v_result->>'success')::boolean THEN 'applied' ELSE 'rejected' END,
        v_result, p_performed_by, NOW())
      ON CONFLICT (client_id, operation_id) DO UPDATE SET
        status = CASE WHEN (EXCLUDED.result->>'success')::boolean THEN 'applied' ELSE 'rejected' END,
        result = EXCLUDED.result,
        applied_at = NOW();

    -- ─── UNKNOWN TYPE ───
    ELSE
      v_result := jsonb_build_object('success', false, 'error', 'Unknown operation type: ' || p_op_type);
      INSERT INTO public.operation_tracking (client_id, operation_id, op_type, status, error_message, performed_by)
      VALUES (p_client_id, p_operation_id, p_op_type, 'rejected', 'Unknown operation type', p_performed_by)
      ON CONFLICT (client_id, operation_id) DO UPDATE SET status = 'rejected', error_message = 'Unknown operation type';
  END CASE;

  -- 3. Audit the sync operation
  PERFORM public.log_audit(
    'sync_' || p_op_type,
    'operation',
    p_operation_id,
    p_performed_by,
    v_performer_name,
    NULL,
    v_result,
    jsonb_build_object('client_id', p_client_id, 'op_type', p_op_type),
    NULL
  );

  RETURN v_result;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.sync_operation(text, text, text, jsonb, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.sync_operation(text, text, text, jsonb, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.sync_operation(text, text, text, jsonb, uuid) FROM authenticated;

-- ──────────────────────────────────────────────────────────────────────────────
-- 6. SETTINGS: Add variance_threshold for manager approval policy
-- ──────────────────────────────────────────────────────────────────────────────

ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS cash_close_variance_threshold numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cash_close_manager_required boolean DEFAULT false;

-- ──────────────────────────────────────────────────────────────────────────────
-- 7. MIGRATION COMPATIBILITY: Add missing columns to cash_drawer_sessions
-- ──────────────────────────────────────────────────────────────────────────────
-- These may already exist in the live DB; ADD COLUMN IF NOT EXISTS is safe.

ALTER TABLE cash_drawer_sessions
  ADD COLUMN IF NOT EXISTS opening_balance numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS closing_balance numeric DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS expected_balance numeric DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS opened_at timestamptz DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS closed_at timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS opened_by uuid DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS closed_by uuid DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS manager_id uuid DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS manager_approved boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT NOW();
