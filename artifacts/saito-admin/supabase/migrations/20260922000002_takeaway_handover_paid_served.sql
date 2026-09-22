-- ============================================================================
-- 20260922000002_takeaway_handover_paid_served.sql
--
-- TAKEAWAY HANDOVER (TƏHVİL ET) — payment ↔ fulfillment separation.
--
-- The order state machine (SSOT: state_transitions) already models handover as
-- the `served` status:
--   ready -> served   (hand over an UNPAID order; pay later via served->paid)
--   served -> paid    (cash out after handover)
-- but it was MISSING:
--   paid  -> served   (hand over a PREPAID order)
-- so a "ready + paid -> customer takes it -> done" flow was impossible: a paid
-- order could only go to closed, never marked as handed over.
--
-- We do NOT invent a new "completed" meaning (owner warning) — we complete the
-- EXISTING `served` lifecycle with the one missing edge. `served` is a valid
-- orders.status (CHECK constraint) and already in the vocabulary.
-- ============================================================================

INSERT INTO public.state_transitions
  (id, entity, from_status, to_status, requires_role, requires_manager_pin,
   description, is_active, created_at, requires_permission, requires_manager_override)
VALUES
  (gen_random_uuid(), 'order', 'paid', 'served', NULL, false,
   'PAID → SERVED (handover of a prepaid order)', true, now(),
   'orders.edit', false)
ON CONFLICT (entity, from_status, to_status) DO NOTHING;
