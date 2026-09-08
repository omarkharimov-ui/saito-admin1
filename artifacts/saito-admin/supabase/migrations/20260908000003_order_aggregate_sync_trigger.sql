-- ============================================================================
-- 2026-09-08 — ORDER → TABLE FLOOR AGGREGATE SYNC (trigger + no-op sync + reconciler)
--
-- APPROVED IMPLEMENTATION PASS — see ORDER_SYNC_TRIGGER_DESIGN_AUDIT.md (design)
-- and the implementation approval for the exact contract:
--
--   A) PRIMARY: orders trigger, AFTER INSERT/UPDATE/DELETE, AGGREGATE-ONLY,
--      fires only when an aggregate-driving field changed:
--        status, total_amount, guest_count, table_number, merged_into,
--        kitchen_status   (kitchen_status ADDED, documented deviation — see below)
--      On INSERT/DELETE: fire when the order is table-bound.
--      On table_number move: refresh BOTH floors.
--      Table-less / takeaway / delivery (table_number NULL): strict NO-OP.
--
--   B) NO-OP RULE (R-1 / decision C): sync_table_order_aggregates recomputes
--      the desired aggregates, compares to the current floor row, and skips
--      the UPDATE entirely when nothing changed → increment_table_floors_version
--      does not fire → no version churn, no updated_at churn, no outbox/realtime
--      churn. Real change → exactly one UPDATE → version++ as designed.
--
--   C) SAFETY NET (decision 4): public.reconcile_table_aggregates(p_max_table_number)
--      re-asserts every floor's aggregates via the same no-op rule; returns a
--      jsonb summary. Intended for pg_cron (recommended: every 15 min) or manual
--      operation. NOT scheduled by this migration (scheduling = separate decision).
--
--   STRICT BOUNDARY (R-2): this mechanism NEVER writes status, current_order_id,
--      reservation fields, merge/transfer state, or kitchen_status on
--      table_floors. It writes ONLY the six aggregate fields the legacy sync
--      already owned: total_amount, guest_count, order_count, has_pending,
--      oldest_pending_at, updated_at. Table 6/7 zombie state stays untouched.
--
--   DOCUMENTED DEVIATION: the approved guard list (status, total_amount,
--   guest_count, table_number, merged_into) does not cover has_pending /
--   oldest_pending_at, which depend on kitchen_status. A kitchen_status-only
--   order write (e.g. sent → ready) would otherwise leave has_pending drifted
--   — the exact drift class this migration exists to prevent. kitchen_status
--   is therefore included in the change guard. It changes rarely (one hop per
--   kitchen event) and only affects trigger firing, never the no-op rule.
--
-- FROZEN: no changes to merge V2 / P-1 / transfer / pointer / reservation
-- contracts; no old migrations touched; RLS/grants untouched.
-- ============================================================================

BEGIN;

-- ============================================================================
-- B) NO-OP-AWARE AGGREGATE SYNC (CREATE OR REPLACE; same signature, same
--    formula as the legacy function — callers unaffected)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.sync_table_order_aggregates(p_table_number integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_d_total numeric;
  v_d_guest numeric;
  v_d_count int;
  v_d_pending boolean;
  v_d_oldest  timestamptz;
  v_cur       public.table_floors;
BEGIN
  IF p_table_number IS NULL THEN
    RETURN;
  END IF;

  SELECT
    COALESCE(SUM(total_amount) FILTER (WHERE status NOT IN ('paid','cancelled','closed','refunded','partially_refunded','voided')), 0),
    COALESCE(SUM(guest_count)  FILTER (WHERE status NOT IN ('paid','cancelled','closed','refunded','partially_refunded','voided')), 0),
    COUNT(*) FILTER (WHERE status NOT IN ('paid','cancelled','closed','refunded','partially_refunded','voided')),
    EXISTS (SELECT 1 FROM public.orders
             WHERE table_number = p_table_number
               AND status NOT IN ('paid','cancelled','closed','refunded','partially_refunded','voided')
               AND kitchen_status IN ('pending','reserved','sent','accepted','preparing','cooking','ready','partially_ready','served')),
    (SELECT MIN(updated_at) FROM public.orders
      WHERE table_number = p_table_number
        AND status NOT IN ('paid','cancelled','closed','refunded','partially_refunded','voided')
        AND kitchen_status IN ('pending','reserved','sent','accepted','preparing','cooking','ready','partially_ready','served'))
  INTO v_d_total, v_d_guest, v_d_count, v_d_pending, v_d_oldest
  FROM public.orders
  WHERE table_number = p_table_number;

  SELECT * INTO v_cur FROM public.table_floors WHERE table_number = p_table_number FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;  -- table row does not exist (deleted floor / never materialized)
  END IF;

  -- ---- no-op rule: skip the UPDATE when every aggregate value already matches ----
  IF v_cur.total_amount        IS NOT DISTINCT FROM v_d_total
     AND v_cur.guest_count     IS NOT DISTINCT FROM v_d_guest
     AND v_cur.order_count     IS NOT DISTINCT FROM v_d_count
     AND v_cur.has_pending     IS NOT DISTINCT FROM v_d_pending
     AND v_cur.oldest_pending_at IS NOT DISTINCT FROM v_d_oldest
  THEN
    RETURN;
  END IF;

  UPDATE public.table_floors SET
    total_amount      = v_d_total,
    guest_count       = v_d_guest,
    order_count       = v_d_count,
    has_pending       = v_d_pending,
    oldest_pending_at = v_d_oldest,
    updated_at        = now()
  WHERE table_number = p_table_number;
END;
$function$;

-- ============================================================================
-- A) ORDERS TRIGGER — aggregate-change detection (AFTER, per row)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.sync_table_floors_on_order_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_new_table int;
  v_old_table int;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_new_table := NEW.table_number;
    v_old_table := NULL;
  ELSIF TG_OP = 'DELETE' THEN
    v_new_table := NULL;
    v_old_table := OLD.table_number;
  ELSE
    v_new_table := NEW.table_number;
    v_old_table := OLD.table_number;
  END IF;

  -- table-less / takeaway / delivery: no floor to keep in sync
  IF v_new_table IS NULL AND v_old_table IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'INSERT' OR TG_OP = 'DELETE' THEN
    -- order appeared or vanished on a table → aggregates must move
    IF v_new_table IS NOT NULL THEN PERFORM public.sync_table_order_aggregates(v_new_table); END IF;
    IF v_old_table IS NOT NULL AND v_old_table IS DISTINCT FROM v_new_table THEN
      PERFORM public.sync_table_order_aggregates(v_old_table);
    END IF;
  ELSE
    -- UPDATE: fire only on aggregate-driving fields
    IF (NEW.status        IS DISTINCT FROM OLD.status)
       OR (NEW.total_amount  IS DISTINCT FROM OLD.total_amount)
       OR (NEW.guest_count   IS DISTINCT FROM OLD.guest_count)
       OR (NEW.table_number  IS DISTINCT FROM OLD.table_number)
       OR (NEW.merged_into   IS DISTINCT FROM OLD.merged_into)
       OR (NEW.kitchen_status IS DISTINCT FROM OLD.kitchen_status)
    THEN
      IF v_new_table IS NOT NULL THEN PERFORM public.sync_table_order_aggregates(v_new_table); END IF;
      -- a move between tables must refresh the source floor too
      IF v_new_table IS DISTINCT FROM v_old_table AND v_old_table IS NOT NULL THEN
        PERFORM public.sync_table_order_aggregates(v_old_table);
      END IF;
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$function$;

DROP TRIGGER IF EXISTS trg_orders_sync_table_floors ON public.orders;
CREATE TRIGGER trg_orders_sync_table_floors
AFTER INSERT OR UPDATE OR DELETE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.sync_table_floors_on_order_change();

-- ============================================================================
-- C) SAFETY-NET RECONCILER (aggregate-only, no-op rule, audited)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.reconcile_table_aggregates(
  p_min_table_number integer DEFAULT NULL::integer,
  p_max_table_number integer DEFAULT NULL::integer,
  p_performed_by uuid DEFAULT NULL::uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_scanned int := 0;
  v_fixed   int := 0;
  v_first   int;
  v_last    int;
  v_fixed_tables int[];
  v_floor   public.table_floors;
BEGIN
  PERFORM public.validate_actor(p_performed_by);

  FOR v_floor IN
    SELECT * FROM public.table_floors
     WHERE (p_min_table_number IS NULL OR table_number >= p_min_table_number)
       AND (p_max_table_number IS NULL OR table_number <= p_max_table_number)
     ORDER BY table_number
  LOOP
    v_scanned := v_scanned + 1;
    PERFORM public.sync_table_order_aggregates(v_floor.table_number);
    -- detect whether the floor actually moved (no-op sync changed nothing)
    IF (SELECT version FROM public.table_floors WHERE table_number = v_floor.table_number)
       <> v_floor.version THEN
      v_fixed := v_fixed + 1;
      IF v_first IS NULL THEN v_first := v_floor.table_number; END IF;
      v_last := v_floor.table_number;
      v_fixed_tables := array_append(v_fixed_tables, v_floor.table_number);
    END IF;
  END LOOP;

  -- Audit ONLY when a repair actually happened, and OPLOG-ONLY (p_event NULL →
  -- no synthetic outbox event the frontend does not understand). A silent
  -- no-op run leaves no trace (correct: nothing changed).
  IF v_fixed > 0 THEN
    PERFORM public.g_table_audit(
      'reconcile_aggregates', NULL,
      v_first, NULL, NULL,
      jsonb_build_object('scanned', v_scanned),
      jsonb_build_object('fixed', v_fixed, 'tables', v_fixed_tables),
      p_performed_by, 'reconciler', 'order-agg-reconciler:v1',
      v_first, NULL, NULL, NULL);
  END IF;

  RETURN jsonb_build_object('scanned', v_scanned, 'fixed', v_fixed,
    'first_table', v_first, 'last_table', v_last, 'tables', v_fixed_tables);
END;
$function$;

COMMIT;
