-- ============================================================================
-- 2026-09-08 — F-2: DB-side terminal provenance for the aggregate-sync floor write
--
-- FIX PASS (POS_FRONTEND_ORDER_AGG_SYNC_AUDIT.md finding F-2, approved):
-- the orders aggregate trigger rewrites table_floors WITHOUT a terminal id, so the
-- POS frontend's echo filter (record.updated_by_terminal_id === terminalId) cannot
-- recognise own-terminal floor echoes -> a redundant second floor fetch per action.
--
-- PROVENANCE SOURCE (pre-existing, canonical, frozen-contract):
--   orders.updated_by_terminal_id is already maintained by every live order-writing
--   path (22 public writers, incl. all frozen merge/unmerge/transfer/seat/dismiss
--   RPCs — verified: their order UPDATEs set updated_by_terminal_id =
--   p_performed_by_terminal_id). No new session plumbing is invented; this migration
--   only PROPAGATES the value the order already carries onto the floor row that the
--   trigger maintains.
--
-- CONTRACT:
--   * sync_table_order_aggregates gains an OPTIONAL 2nd arg
--     p_updated_by_terminal_id (default NULL). The 5 structural RPCs keep calling
--     the 1-arg form -> NULL -> floor terminal untouched (byte-identical behavior).
--   * Terminal is NOT part of the no-op aggregate comparison. The floor UPDATE runs
--     (a) on any aggregate change (writes terminal if provided) or
--     (b) ONLY when a non-NULL terminal differs from the current floor value
--     (terminal-only provenance write). No change at all -> no UPDATE (no version churn).
--   * p_updated_by_terminal_id NULL never overwrites an existing floor terminal.
--   * The trigger passes NEW/OLD (COALESCE) order terminal; DELETE passes OLD.
--   * GUEST-COUNT SEMANTICS: UNCHANGED from 20260908000003 (strict order-sum
--     formula). seat_guests_atomic explicitly writes the seating value and then
--     syncs; per approval F-6 = "do not invent a new guest-count rule", no new
--     preservation heuristic is added here.
--   * Outbox: the floor emit triggers are column-gated (UPDATE OF current_order_id /
--     UPDATE OF status) -> an aggregate+terminal floor write emits NO outbox event.
--   * No DDL on tables; no RLS change; no frozen-contract function modified.
-- ============================================================================

BEGIN;

-- Remove the legacy 1-arg body (added by 20260908000003). The 2-arg function below
-- (with a NULL default) is the SINGLE source of truth: the 5 structural RPCs call
-- the 1-arg form and now resolve to it via the default (terminal NULL = behavior
-- unchanged). CREATE OR REPLACE cannot change the arg list, hence the explicit drop.
DROP FUNCTION IF EXISTS public.sync_table_order_aggregates(integer);

CREATE OR REPLACE FUNCTION public.sync_table_order_aggregates(
  p_table_number integer,
  p_updated_by_terminal_id text DEFAULT NULL::text)
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
  v_agg_changed boolean;
  v_terminal_changed boolean;
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
    RETURN;
  END IF;

  v_agg_changed :=
       v_cur.total_amount        IS DISTINCT FROM v_d_total
    OR v_cur.guest_count         IS DISTINCT FROM v_d_guest
    OR v_cur.order_count         IS DISTINCT FROM v_d_count
    OR v_cur.has_pending         IS DISTINCT FROM v_d_pending
    OR v_cur.oldest_pending_at   IS DISTINCT FROM v_d_oldest;

  -- F-2: terminal provenance — write only when a concrete terminal is provided and
  -- differs from the current value. NULL never overwrites.
  v_terminal_changed :=
       p_updated_by_terminal_id IS NOT NULL
    AND v_cur.updated_by_terminal_id IS DISTINCT FROM p_updated_by_terminal_id;

  IF NOT v_agg_changed AND NOT v_terminal_changed THEN
    RETURN;  -- no-op rule: no UPDATE, no version churn
  END IF;

  UPDATE public.table_floors SET
    total_amount      = v_d_total,
    guest_count       = v_d_guest,
    order_count       = v_d_count,
    has_pending       = v_d_pending,
    oldest_pending_at = v_d_oldest,
    updated_at        = now(),
    updated_by_terminal_id = CASE
      WHEN p_updated_by_terminal_id IS NULL THEN updated_by_terminal_id
      ELSE p_updated_by_terminal_id
    END
  WHERE table_number = p_table_number;
END;
$function$;

CREATE OR REPLACE FUNCTION public.sync_table_floors_on_order_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_new_table  int;
  v_old_table  int;
  v_terminal   text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_new_table := NEW.table_number;
    v_old_table := NULL;
    v_terminal  := NEW.updated_by_terminal_id;
  ELSIF TG_OP = 'DELETE' THEN
    v_new_table := NULL;
    v_old_table := OLD.table_number;
    v_terminal  := OLD.updated_by_terminal_id;
  ELSE
    v_new_table := NEW.table_number;
    v_old_table := OLD.table_number;
    v_terminal  := COALESCE(NEW.updated_by_terminal_id, OLD.updated_by_terminal_id);
  END IF;

  IF v_new_table IS NULL AND v_old_table IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'INSERT' OR TG_OP = 'DELETE' THEN
    IF v_new_table IS NOT NULL THEN PERFORM public.sync_table_order_aggregates(v_new_table, v_terminal); END IF;
    IF v_old_table IS NOT NULL AND v_old_table IS DISTINCT FROM v_new_table THEN
      PERFORM public.sync_table_order_aggregates(v_old_table, v_terminal);
    END IF;
  ELSE
    IF (NEW.status        IS DISTINCT FROM OLD.status)
       OR (NEW.total_amount  IS DISTINCT FROM OLD.total_amount)
       OR (NEW.guest_count   IS DISTINCT FROM OLD.guest_count)
       OR (NEW.table_number  IS DISTINCT FROM OLD.table_number)
       OR (NEW.merged_into   IS DISTINCT FROM OLD.merged_into)
       OR (NEW.kitchen_status IS DISTINCT FROM OLD.kitchen_status)
    THEN
      IF v_new_table IS NOT NULL THEN PERFORM public.sync_table_order_aggregates(v_new_table, v_terminal); END IF;
      IF v_new_table IS DISTINCT FROM v_old_table AND v_old_table IS NOT NULL THEN
        PERFORM public.sync_table_order_aggregates(v_old_table, v_terminal);
      END IF;
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$function$;

COMMIT;
