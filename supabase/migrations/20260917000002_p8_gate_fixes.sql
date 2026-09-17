-- =============================================================================
-- P-8 GATE FIXES (2026-09-17) — two real defects found by .p8-gate.cjs run 1.
-- Both are P-8-scope contract fixes (D-11 / D-12), not new scope:
--
-- FIX A (D-11): payment_idempotency_keys.order_id has FOREIGN KEY -> orders(id).
--   The ratified P-8 drawer-namespace idempotency (D-11, P-4 pattern) stores the
--   DRAWER SESSION id in order_id for namespace='drawer'. With the FK in place
--   every token-path drawer write carrying an idempotency key
--   (close_cash_register_v2 / cash_in_atomic / cash_out_atomic, p_idempotency_key
--   non-NULL) failed with an FK violation -> the production UI (which now always
--   sends keys) would 409/500 on every drawer close.
--   Integrity remains enforced by: (namespace, key) unique, the per-namespace
--   binding check on replay (entity + amount), and the P-4 rule that the key is
--   INSERTed only after the domain write in the same transaction. The FK was
--   redundant with the domain write for the 'order' namespace (the pay/refund
--   routes re-validate the order before the key insert). Dropped here.
--
-- FIX B (D-12): outbox_events.metadata is NOT NULL DEFAULT '{}'::jsonb, but
--   emit_outbox_event INSERTed p_metadata verbatim — an explicit NULL argument
--   (as passed by auto_clockout_staff) overrides the column default and violates
--   NOT NULL -> auto_clockout_staff() failed on EVERY run with an eligible
--   shift (the entire Q4 auto-clockout cron feature was non-functional).
--   COALESCE both jsonb args in the shared helper (covers all current and
--   future callers; '{}' is exactly the column default).
-- =============================================================================

-- ── FIX A ────────────────────────────────────────────────────────────────────
ALTER TABLE public.payment_idempotency_keys
  DROP CONSTRAINT IF EXISTS payment_idempotency_keys_order_id_fkey;

-- ── FIX B ────────────────────────────────────────────────────────────────────
-- NOTE: parameter DEFAULTs must be preserved — the live function declares
-- `DEFAULT '{}'::jsonb` on both jsonb args; CREATE OR REPLACE refuses to
-- remove parameter defaults ("cannot remove parameter defaults").
CREATE OR REPLACE FUNCTION public.emit_outbox_event(
  p_aggregate_type text,
  p_aggregate_id uuid,
  p_event_type text,
  p_payload jsonb DEFAULT '{}'::jsonb,
  p_metadata jsonb DEFAULT '{}'::jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO outbox_events (aggregate_type, aggregate_id, event_type, payload, metadata)
  VALUES (p_aggregate_type, p_aggregate_id, p_event_type,
          COALESCE(p_payload, '{}'::jsonb),
          COALESCE(p_metadata, '{}'::jsonb))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
