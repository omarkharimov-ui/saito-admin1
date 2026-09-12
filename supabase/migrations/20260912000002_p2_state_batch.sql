-- =============================================================================
-- P-2 STATE BATCH (ratified 2026-09-12) — single clean migration
--   S1: drop entity='table' (25 orphan rows, 0 consumers, model mismatch vs F)
--   S2: register entity='payment' transition map (moved OUT of
--       update_payment_status() body into the single SSOT state_transitions)
--   S3: DB guard trigger on order_payments.status (table-level enforcement,
--       closes the service_role direct-write gap)
-- DO-NOT (ratified): table_floors model, F logic, legacy NULL rows, 'cooking'
-- item state, drawer/approval machines, P-1 contracts, UI.
-- Freeze contract: P2_STATE_CONTRACT_DRAFT_2026-09-12.md (ratified).
-- =============================================================================

-- ===== S1: drop orphaned 'table' entity rows (0 consumers; F model is procedural) =====
DELETE FROM public.state_transitions WHERE entity = 'table';

-- ===== S2: payment entity in the registry (map = exact update_payment_status contract) =====
INSERT INTO public.state_transitions
  (id, entity, from_status, to_status, requires_role, requires_manager_pin, description, is_active, created_at, requires_permission, requires_manager_override)
VALUES
  (gen_random_uuid(),'payment','pending','processing',NULL,false,'Capture initiated',true,now(),NULL,false),
  (gen_random_uuid(),'payment','pending','cancelled',NULL,false,'Pending cancelled',true,now(),NULL,false),
  (gen_random_uuid(),'payment','processing','authorized',NULL,false,'Authorization succeeded',true,now(),NULL,false),
  (gen_random_uuid(),'payment','processing','captured',NULL,false,'Direct capture (card) succeeded',true,now(),NULL,false),
  (gen_random_uuid(),'payment','processing','failed',NULL,false,'Processing failed',true,now(),NULL,false),
  (gen_random_uuid(),'payment','processing','declined',NULL,false,'Issuer declined',true,now(),NULL,false),
  (gen_random_uuid(),'payment','processing','cancelled',NULL,false,'Processing cancelled',true,now(),NULL,false),
  (gen_random_uuid(),'payment','processing','unknown',NULL,false,'Provider response unknown',true,now(),NULL,false),
  (gen_random_uuid(),'payment','authorized','captured',NULL,false,'Capture succeeded',true,now(),NULL,false),
  (gen_random_uuid(),'payment','authorized','voided',NULL,false,'Authorized payment voided before capture',true,now(),NULL,false),
  (gen_random_uuid(),'payment','authorized','cancelled',NULL,false,'Authorized payment cancelled',true,now(),NULL,false),
  (gen_random_uuid(),'payment','captured','settled',NULL,false,'Captured funds settled',true,now(),NULL,false),
  (gen_random_uuid(),'payment','captured','refunded',NULL,false,'Full refund (amount reconciliation)',true,now(),NULL,false),
  (gen_random_uuid(),'payment','captured','partially_refunded',NULL,false,'Partial refund (amount reconciliation)',true,now(),NULL,false),
  (gen_random_uuid(),'payment','failed','pending',NULL,false,'Retry: back to pending',true,now(),NULL,false),
  (gen_random_uuid(),'payment','failed','processing',NULL,false,'Retry: re-process',true,now(),NULL,false),
  (gen_random_uuid(),'payment','declined','pending',NULL,false,'Retry: back to pending',true,now(),NULL,false),
  (gen_random_uuid(),'payment','declined','processing',NULL,false,'Retry: re-process',true,now(),NULL,false),
  (gen_random_uuid(),'payment','unknown','captured',NULL,false,'Reconciled as captured (statement match)',true,now(),NULL,false),
  (gen_random_uuid(),'payment','unknown','failed',NULL,false,'Reconciled as failed (statement match)',true,now(),NULL,false),
  (gen_random_uuid(),'payment','unknown','cancelled',NULL,false,'Reconciled as cancelled',true,now(),NULL,false),
  (gen_random_uuid(),'payment','partially_refunded','refunded',NULL,false,'Remaining balance refunded',true,now(),NULL,false)
ON CONFLICT (entity, from_status, to_status) DO NOTHING;

-- ===== S2b: drop the stale 8-state CHECK on order_payments.status =====
-- It pre-blocked 4 of the 12 ratified registry states (processing/declined/unknown/
-- cancelled). Replaced by the registry guard below, which is STRICTLY TIGHTER:
-- the old CHECK only validated the NEW value; the guard validates the TRANSITION
-- (from->to must be an active registry row) + rejects unsetting.
ALTER TABLE public.order_payments DROP CONSTRAINT IF EXISTS order_payments_status_check;

-- ===== S3: table-level state guard on order_payments.status =====
-- Contract (P-2 freeze):
--   * INSERT: free (canonical writers insert 'captured'; legacy rows are NULL).
--   * UPDATE NULL -> X : allowed (init of legacy/unset status, first set wins).
--   * UPDATE X -> NULL : REJECTED (status is not unsettable once set).
--   * UPDATE X -> Y    : allowed IFF state_transitions has an active 'payment'
--                        row X->Y; otherwise RAISE (INVALID_PAYMENT_TRANSITION).
-- Evidence the canonical path is unaffected (2026-09-12 live function audit):
--   complete_payment_atomic_v2 / refund_with_inventory INSERT only (status
--   'captured'); saito_reverse_payment UPDATEs payment_method, never status;
--   no other function UPDATEs order_payments.status.
CREATE OR REPLACE FUNCTION public.trg_order_payment_state_machine_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_valid jsonb;
BEGIN
  IF TG_OP <> 'UPDATE' OR (OLD.status IS NOT DISTINCT FROM NEW.status) THEN
    RETURN NEW;
  END IF;
  IF OLD.status IS NULL THEN
    -- first set of an unset (legacy NULL) status: allowed
    RETURN NEW;
  END IF;
  IF NEW.status IS NULL THEN
    RAISE EXCEPTION 'INVALID_PAYMENT_TRANSITION [payment status cannot be unset: % -> NULL]', OLD.status USING ERRCODE='P0001';
  END IF;
  v_valid := validate_transition('payment', OLD.status, NEW.status);
  IF NOT (v_valid->>'valid')::boolean THEN
    RAISE EXCEPTION 'INVALID_PAYMENT_TRANSITION [% -> %]: % (payment %)', OLD.status, NEW.status, v_valid->>'error', OLD.id USING ERRCODE='P0001';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_payment_state_machine_guard ON public.order_payments;
CREATE TRIGGER trg_payment_state_machine_guard
BEFORE UPDATE ON public.order_payments
FOR EACH ROW EXECUTE FUNCTION trg_order_payment_state_machine_guard();

COMMENT ON FUNCTION public.trg_order_payment_state_machine_guard() IS 'P-2: order_payments.status is transition-validated against state_transitions entity=''payment'' (single SSOT). NULL init allowed; unset rejected; X->Y must exist in registry.';
COMMENT ON TRIGGER trg_payment_state_machine_guard ON public.order_payments IS 'P-2: payment state machine guard (fires on status change only; INSERTs unaffected).';

-- ===== sanity: registry counts after batch =====
DO $$
DECLARE
  n_tbl integer; n_pay integer;
BEGIN
  SELECT count(*) INTO n_tbl FROM public.state_transitions WHERE entity='table';
  IF n_tbl <> 0 THEN RAISE EXCEPTION 'P-2 sanity: entity=table rows remain: %', n_tbl; END IF;
  SELECT count(*) INTO n_pay FROM public.state_transitions WHERE entity='payment';
  IF n_pay <> 22 THEN RAISE EXCEPTION 'P-2 sanity: entity=payment rows = % (expect 22)', n_pay; END IF;
END $$;
