-- =====================================================================
-- SAITO — PHASE 6: OFFLINE / RECONNECT FOUNDATION
-- PostgreSQL = SSOT. Realtime = publication only. Each operation is tracked
-- by (client_id, operation_id) so a reconnect never double-applies.
-- Financial operations (payment/refund/void/cash_close) always require the
-- server; the client queues only safe ops offline and reconciles on reconnect.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.sync_operations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     text NOT NULL,
  operation_id  text NOT NULL,
  op_type       text NOT NULL,
  status        text NOT NULL DEFAULT 'pending', -- pending | synced | rejected | conflict
  payload       jsonb,
  result        jsonb,
  error_text    text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  synced_at     timestamptz,
  UNIQUE (client_id, operation_id)
);

CREATE INDEX IF NOT EXISTS idx_sync_operations_client_op
  ON public.sync_operations (client_id, operation_id);

-- Idempotent operation reconciliation. Returns the stored result if the
-- operation already synced; otherwise delegates to the authoritative atomic
-- RPC (server wins; never trusts client state).
CREATE OR REPLACE FUNCTION public.sync_operation(
  p_client_id text,
  p_operation_id text,
  p_op_type text,
  p_payload jsonb,
  p_performed_by uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_rec sync_operations%ROWTYPE;
  v_out jsonb;
BEGIN
  SELECT * INTO v_rec
    FROM sync_operations
   WHERE client_id = p_client_id AND operation_id = p_operation_id;

  IF FOUND THEN
    IF v_rec.status = 'synced' THEN
      RETURN jsonb_build_object('success', true, 'status', 'synced', 'idempotent', true, 'result', v_rec.result);
    END IF;
    IF v_rec.status = 'rejected' THEN
      RETURN jsonb_build_object('success', false, 'status', 'rejected', 'error', v_rec.error_text);
    END IF;
    RETURN jsonb_build_object('success', true, 'status', v_rec.status, 'pending', true);
  END IF;

  BEGIN
    IF p_op_type = 'payment' THEN
      SELECT complete_payment_atomic(
        (p_payload->>'order_id')::uuid,
        p_payload->'payments',
        COALESCE(p_payload->>'payment_method', 'card'),
        COALESCE((p_payload->>'cash_amount')::numeric, 0),
        COALESCE((p_payload->>'card_amount')::numeric, 0),
        COALESCE((p_payload->>'tip_amount')::numeric, 0),
        COALESCE((p_payload->>'discount_amount')::numeric, 0),
        p_payload->>'discount_type',
        p_performed_by,
        p_payload->>'terminal_id',
        NULL
      ) INTO v_out;
    ELSIF p_op_type = 'refund' THEN
      SELECT refund_payment_atomic(
        (p_payload->>'order_id')::uuid,
        COALESCE((p_payload->>'amount')::numeric, 0),
        COALESCE(p_payload->>'method', 'cash'),
        p_payload->>'reason',
        p_performed_by,
        NULL
      ) INTO v_out;
    ELSIF p_op_type = 'void' THEN
      SELECT void_payment_atomic(
        (p_payload->>'payment_id')::uuid,
        p_payload->>'reason',
        p_performed_by
      ) INTO v_out;
    ELSIF p_op_type = 'cash_close' THEN
      SELECT close_cash_register_v2(
        (p_payload->>'session_id')::uuid,
        COALESCE((p_payload->>'actual_cash')::numeric, 0),
        p_performed_by,
        (p_payload->>'approved_by')::uuid,
        p_payload->>'approval_note'
      ) INTO v_out;
    ELSE
      INSERT INTO sync_operations (client_id, operation_id, op_type, status, payload, error_text)
      VALUES (p_client_id, p_operation_id, p_op_type, 'rejected', p_payload, 'UNKNOWN_OP_TYPE')
      ON CONFLICT (client_id, operation_id) DO NOTHING;
      RETURN jsonb_build_object('success', false, 'status', 'rejected', 'error', 'UNKNOWN_OP_TYPE');
    END IF;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO sync_operations (client_id, operation_id, op_type, status, payload, error_text)
    VALUES (p_client_id, p_operation_id, p_op_type, 'rejected', p_payload, SQLERRM)
    ON CONFLICT (client_id, operation_id) DO UPDATE SET status='rejected', error_text=EXCLUDED.error_text, payload=EXCLUDED.payload;
    RETURN jsonb_build_object('success', false, 'status', 'rejected', 'error', SQLERRM);
  END;

  INSERT INTO sync_operations (client_id, operation_id, op_type, status, payload, result, synced_at)
  VALUES (p_client_id, p_operation_id, p_op_type, 'synced', p_payload, v_out, now())
  ON CONFLICT (client_id, operation_id) DO UPDATE SET status='synced', result=EXCLUDED.result, synced_at=now();

  RETURN jsonb_build_object('success', true, 'status', 'synced', 'result', v_out);
END;
$$;

ALTER TABLE public.sync_operations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sync_operations_select ON public.sync_operations;
CREATE POLICY sync_operations_select ON public.sync_operations
  FOR SELECT USING (auth.role() IN ('authenticated', 'service_role'));

GRANT EXECUTE ON FUNCTION public.sync_operation(text, text, text, jsonb, uuid) TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sync_operations TO service_role;
