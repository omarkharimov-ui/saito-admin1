-- ============================================================================
-- 20260911000024 — F-05 (frozen): pointer lifecycle — cancel/void clears
-- current_order_id; live open order is canonical; stale pointer never shadows.
--
-- ROOT CAUSE: sync_table_order_aggregates recomputed totals/guests/count on
-- every order change but NEVER current_order_id; clear_stale_table_order_pointer
-- only fired on table MOVES. So a cancelled/voided order left a stale pointer
-- with no runtime recompute (3 rows in production).
-- FIX (runtime correctness, NOT cron): the canonical pointer is now recomputed
-- inside sync_table_order_aggregates (fires on every order insert/update/delete
-- via trg_orders_sync_table_floors): pointer = latest OPEN order on
-- (table, location), else NULL. A stale/cancelled pointer therefore never
-- shadows a live open order. One-time repair of the 3 existing stale rows.
-- ============================================================================

-- 1) canonical pointer recompute in the existing sync fn (location-scoped, F-03)
CREATE OR REPLACE FUNCTION public.sync_table_order_aggregates(
  p_table_number integer,
  p_updated_by_terminal_id text DEFAULT NULL::text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_d_total numeric;
  v_d_guest numeric;
  v_d_count int;
  v_d_pending boolean;
  v_d_oldest  timestamptz;
  v_cur       public.table_floors;
  v_agg_changed boolean;
  v_terminal_changed boolean;
  v_ptr uuid;
  v_ptr_to_write uuid;
  v_ptr_changed boolean;
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

  -- F-05 (frozen): canonical pointer = latest OPEN order on (table, location);
  -- a stale/cancelled pointer never shadows a live open order; NULL if none.
  SELECT o.id INTO v_ptr FROM public.orders o
   WHERE o.table_number = p_table_number AND o.location_id = v_cur.location_id
     AND o.status NOT IN ('paid','cancelled','closed','refunded','partially_refunded','voided')
   ORDER BY o.updated_at DESC, o.id DESC LIMIT 1;
  -- Guard-safe write: clearing to NULL is always allowed; setting a LIVE pointer
  -- is only allowed when the table is NOT in a released state (empty/cleaning) —
  -- table_release_guard (BEFORE trigger) forbids an active pointer on a released
  -- table. In the (rare) inconsistent case (released table + open order) we leave
  -- the pointer untouched and let the state machine reconcile it.
  IF v_ptr IS NULL THEN
    v_ptr_to_write := NULL;
  ELSIF v_cur.status IN ('empty','cleaning') THEN
    v_ptr_to_write := v_cur.current_order_id;
  ELSE
    v_ptr_to_write := v_ptr;
  END IF;
  v_ptr_changed := v_cur.current_order_id IS DISTINCT FROM v_ptr_to_write;

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

  IF NOT v_agg_changed AND NOT v_terminal_changed AND NOT v_ptr_changed THEN
    RETURN;  -- no-op rule: no UPDATE, no version churn
  END IF;

  UPDATE public.table_floors SET
    current_order_id  = v_ptr_to_write,
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
$$;
GRANT EXECUTE ON FUNCTION public.sync_table_order_aggregates(integer, text) TO service_role;

-- 2) one-time repair: recompute pointer for every table that currently has a
--    stale (cancelled/voided/missing) current_order_id.
DO $$
DECLARE
  v_tbl record;
BEGIN
  FOR v_tbl IN
    SELECT id FROM public.table_floors
    WHERE current_order_id IS NOT NULL
      AND ( NOT EXISTS (SELECT 1 FROM public.orders o WHERE o.id = current_order_id)
            OR (SELECT status FROM public.orders o WHERE o.id = current_order_id)
               IN ('paid','cancelled','closed','refunded','partially_refunded','voided') )
  LOOP
    -- recompute via the (now pointer-aware) aggregate fn using the table number
    PERFORM public.sync_table_order_aggregates(
      (SELECT table_number FROM public.table_floors WHERE id = v_tbl.id)
    );
  END LOOP;
END;
$$;
