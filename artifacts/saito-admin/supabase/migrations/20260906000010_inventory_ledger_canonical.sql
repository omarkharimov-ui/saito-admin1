-- ============================================================
-- 0.4-H / M1 — Canonical Inventory Ledger (H1)
-- Additive schema + immutability. NO behavior change for
-- existing writers. Step 1 of the controlled execution
-- sequence (plan-0.4-H-inventory-boundary.md §17-18).
-- Blast radius verified live: only reverse_stock_deduction_for_items
-- updates inventory_logs (removed in M5); one app DELETE route
-- (inventory/[id]) is patched in the same step.
-- ============================================================

-- 1. Additive columns (H1.1)
ALTER TABLE public.inventory_logs
  ADD COLUMN IF NOT EXISTS unit            text,  -- UOM snapshot (gram/ml/piece)
  ADD COLUMN IF NOT EXISTS correlation_id  uuid,  -- reversal -> original link
  ADD COLUMN IF NOT EXISTS idempotency_key text,  -- retry/concurrency uniqueness
  ADD COLUMN IF NOT EXISTS performed_by    uuid;  -- actor (mirrors other tables)

-- 2. Enum extension (H1.1)
ALTER TYPE public.inventory_log_type ADD VALUE IF NOT EXISTS 'reversal';
ALTER TYPE public.inventory_log_type ADD VALUE IF NOT EXISTS 'historical_repair';

-- 3. Idempotency uniqueness (H4.1): UNIQUE(order_item_id) is insufficient
--    for multi-ingredient recipes; canonical invariant lives here.
CREATE UNIQUE INDEX IF NOT EXISTS inventory_logs_idempotency_uidx
  ON public.inventory_logs (idempotency_key) WHERE idempotency_key IS NOT NULL;

-- 4. Privilege hardening (H1.2 defense-in-depth). Ledger is INSERT-only;
--    INSERT stays open because REST direct-insert writers (procurement,
--    goods-receipt, waste, calibration, import) are still valid users of
--    the single mutation trigger until they are migrated to RPCs.
REVOKE UPDATE, DELETE ON public.inventory_logs FROM anon, authenticated, service_role, test_rls_role;

-- 5. Immutability (H1.2): hard block for EVERY caller, including service_role.
--    Repairs are new INSERT rows (historical_repair), never history edits.
CREATE OR REPLACE FUNCTION public.trg_inventory_logs_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'inventory_logs is immutable: UPDATE forbidden (ledger id %)', OLD.id;
  ELSIF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'inventory_logs is immutable: DELETE forbidden (ledger id %)', OLD.id;
  END IF;
  RETURN NULL;
END;
$function$;

CREATE TRIGGER trg_inventory_logs_immutable
  BEFORE UPDATE OR DELETE ON public.inventory_logs
  FOR EACH ROW EXECUTE FUNCTION public.trg_inventory_logs_immutable();