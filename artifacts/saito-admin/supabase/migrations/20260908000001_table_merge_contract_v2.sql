-- ============================================================================
-- 0.4-G v2 — TABLE MERGE / UNMERGE 9-CASE CONTRACT
--
-- Frozen contract approved 2026-09-08 (see MERGE_CONTRACT_AUDIT.md).
-- This migration ONLY rewrites merge_tables_atomic + unmerge_tables_atomic
-- via CREATE OR REPLACE FUNCTION. No schema, RLS, trigger, or other-function
-- changes. Old migrations untouched. REST/frontend untouched.
--
-- Merge 9 cases:
--   1 Empty   + Empty     -> group, no order            (mode group-empty)
--   2 Empty   + Occupied  -> occupied order canonical   (mode bill-merge)
--   3 Occupied+ Empty     -> occupied order canonical   (mode bill-merge)
--   4 Occupied+ Occupied  -> parent order canonical     (mode bill-merge)
--   5 Reserved+ Empty     -> empty joins reservation    (mode reservation-aware)
--   6 Empty   + Reserved  -> reservation moves to parent(mode reservation-aware)
--   7 Reserved+ Reserved  -> only same reservation      (mode reservation-aware)
--   8 Reserved+ Occupied  -> G_MERGE_RESERVED_WITH_OCCUPIED
--   9 Occupied+ Reserved  -> G_MERGE_RESERVED_WITH_OCCUPIED
--
-- Statement ordering is designed to satisfy the frozen triggers:
--   * orders.table_number moved BEFORE parent pointer set (validate_pointer OK)
--   * child.current_order_id cleared via same 'merged' write (release guard OK)
--   * parent set to 'empty' only after its order has left (release guard OK)
-- Lineage for deterministic unmerge is stored in table_floors.metadata
-- (jsonb, default '{}', read by NO app code / DB function).
-- ============================================================================

BEGIN;

-- ============================================================================
-- G2v2 — MERGE (full 9-case contract)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.merge_tables_atomic(
  p_parent_table_number integer,
  p_child_table_numbers integer[],
  p_performed_by uuid DEFAULT NULL::uuid,
  p_performed_by_terminal_id text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_parent        table_floors;
  v_child         table_floors;
  v_parent_order  orders;
  v_child_order   orders;
  v_children      int[];
  v_parent_kind   text;
  v_child_kind    text;
  v_mode          text;
  v_group         text;
  v_resv_id       uuid;
  v_resv_name     text;
  v_resv_phone    text;
  v_resv_time     text;
  v_parent_order_id uuid;
  v_canonical_from  int;      -- table that currently hosts the group's canonical order
  v_resv_bound    int;
  v_resv_unbound  int;
  v_resv_distinct int;
  v_occ_count     int;
  v_r             int;
  v_paid          int;
  v_merged        int := 0;
  v_children_summary jsonb := '[]'::jsonb;
  v_children_lineage jsonb := '[]'::jsonb;
  v_old_state     jsonb;
BEGIN
  PERFORM public.validate_actor(p_performed_by);

  IF p_parent_table_number = ANY(p_child_table_numbers) THEN
    RETURN jsonb_build_object('success', false, 'error', 'G_MERGE_PARENT_IN_CHILD');
  END IF;
  v_children := (SELECT array_agg(tn ORDER BY tn) FROM (SELECT DISTINCT unnest(p_child_table_numbers) AS tn) x);
  IF v_children IS NULL OR array_length(v_children, 1) IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'G_MERGE_NO_CHILDREN');
  END IF;

  SELECT * INTO v_parent FROM public.table_floors
   WHERE table_number = p_parent_table_number FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'TABLE_NOT_FOUND');
  END IF;
  IF v_parent.merged_into_table IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'G_MERGE_PARENT_ALREADY_MERGED');
  END IF;

  -- lock children deterministically after parent
  FOR v_child IN SELECT * FROM public.table_floors
                 WHERE table_number = ANY(v_children) ORDER BY table_number FOR UPDATE LOOP
    NULL;
  END LOOP;
  IF (SELECT count(*) FROM public.table_floors WHERE table_number = ANY(v_children)) <> array_length(v_children, 1) THEN
    RETURN jsonb_build_object('success', false, 'error', 'G_MERGE_CHILD_NOT_FOUND');
  END IF;
  IF EXISTS (SELECT 1 FROM public.table_floors WHERE table_number = ANY(v_children)
             AND (location_id IS DISTINCT FROM v_parent.location_id
                  OR organization_id IS DISTINCT FROM v_parent.organization_id)) THEN
    RETURN jsonb_build_object('success', false, 'error', 'G_MERGE_LOCATION_MISMATCH');
  END IF;
  IF EXISTS (SELECT 1 FROM public.table_floors WHERE table_number = ANY(v_children)
             AND merged_into_table IS NOT NULL) THEN
    RETURN jsonb_build_object('success', false, 'error', 'G_MERGE_CHILD_ALREADY_MERGED');
  END IF;

  -- ---- classify parent + children by status ----
  v_parent_kind := CASE v_parent.status WHEN 'occupied' THEN 'occupied'
                                        WHEN 'reserved' THEN 'reserved'
                                        WHEN 'empty'    THEN 'empty' ELSE 'other' END;
  IF v_parent_kind = 'other' THEN
    RETURN jsonb_build_object('success', false, 'error',
      'G_MERGE_TABLE_STATE_INVALID (parent=' || p_parent_table_number || ')');
  END IF;

  SELECT
    count(*) FILTER (WHERE status = 'occupied') AS occ_c,
    count(*) FILTER (WHERE status = 'reserved') AS res_c
  INTO v_occ_count, v_resv_bound
  FROM public.table_floors
  WHERE table_number = p_parent_table_number OR table_number = ANY(v_children);

  -- cases 8/9: any reserved + any occupied in the same group is forbidden
  IF v_resv_bound > 0 AND v_occ_count > 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'G_MERGE_RESERVED_WITH_OCCUPIED');
  END IF;

  -- case 7 / multi-reserved: all reserved tables must share ONE reservation
  SELECT
    count(*) FILTER (WHERE reservation_id IS NOT NULL) AS bound,
    count(*) FILTER (WHERE reservation_id IS NULL)     AS unbound
  INTO v_resv_bound, v_resv_unbound
  FROM public.table_floors
  WHERE (table_number = p_parent_table_number OR table_number = ANY(v_children))
    AND status = 'reserved';
  SELECT count(DISTINCT reservation_id) INTO v_resv_distinct
  FROM public.table_floors
  WHERE (table_number = p_parent_table_number OR table_number = ANY(v_children))
    AND status = 'reserved' AND reservation_id IS NOT NULL;
  IF v_resv_distinct > 1 OR (v_resv_bound > 0 AND v_resv_unbound > 0) THEN
    RETURN jsonb_build_object('success', false, 'error', 'G_MERGE_RESERVATION_MISMATCH');
  END IF;

  -- canonical reservation (only one may exist once validated)
  v_resv_id := NULL;
  SELECT reservation_id, reservation_name, reservation_phone, reservation_time INTO v_resv_id, v_resv_name, v_resv_phone, v_resv_time
  FROM public.table_floors
  WHERE (table_number = p_parent_table_number OR table_number = ANY(v_children))
    AND status = 'reserved' AND reservation_id IS NOT NULL
  LIMIT 1;

  -- ---- per-table order validation ----
  -- parent (occupied): exactly one open unmerged order
  IF v_parent_kind = 'occupied' THEN
    SELECT count(*) INTO v_r FROM public.orders
     WHERE table_number = p_parent_table_number
       AND merged_into IS NULL
       AND status NOT IN ('paid','cancelled','closed','refunded','partially_refunded','voided');
    IF v_r = 0 THEN
      RETURN jsonb_build_object('success', false, 'error', 'G_MERGE_PARENT_NO_ORDER');
    END IF;
    IF v_r > 1 THEN
      RETURN jsonb_build_object('success', false, 'error', 'G_MERGE_PARENT_MULTIPLE');
    END IF;
    SELECT * INTO v_parent_order FROM public.orders
     WHERE table_number = p_parent_table_number
       AND merged_into IS NULL
       AND status NOT IN ('paid','cancelled','closed','refunded','partially_refunded','voided')
     ORDER BY created_at ASC LIMIT 1;
    v_parent_order_id := v_parent_order.id;
  END IF;

  FOR v_child IN SELECT * FROM public.table_floors
                 WHERE table_number = ANY(v_children) ORDER BY table_number LOOP
    v_child_kind := CASE v_child.status WHEN 'occupied' THEN 'occupied'
                                         WHEN 'reserved' THEN 'reserved'
                                         WHEN 'empty'    THEN 'empty' ELSE 'other' END;
    IF v_child_kind = 'other' THEN
      RETURN jsonb_build_object('success', false, 'error',
        'G_MERGE_TABLE_STATE_INVALID (child=' || v_child.table_number || ')');
    END IF;
    SELECT count(*) INTO v_r FROM public.orders
     WHERE table_number = v_child.table_number
       AND merged_into IS NULL
       AND status NOT IN ('paid','cancelled','closed','refunded','partially_refunded','voided');
    IF v_child_kind = 'occupied' THEN
      IF v_r = 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'G_MERGE_CHILD_NO_ORDER (child=' || v_child.table_number || ')');
      END IF;
      IF v_r > 1 THEN
        RETURN jsonb_build_object('success', false, 'error', 'G_MERGE_CHILD_MULTIPLE (child=' || v_child.table_number || ')');
      END IF;
    ELSIF v_r > 0 THEN
      -- a reserved/empty table must not carry an open order (inconsistent state)
      RETURN jsonb_build_object('success', false, 'error',
        'G_MERGE_TABLE_STATE_INVALID (child=' || v_child.table_number || ' has open order)');
    END IF;
  END LOOP;

  -- ---- payment guard on every open order in the group ----
  IF EXISTS (SELECT 1 FROM public.orders o
             JOIN public.payments p ON p.order_id = o.id
             WHERE (o.table_number = p_parent_table_number OR o.table_number = ANY(v_children))
               AND o.status NOT IN ('paid','cancelled','closed','refunded','partially_refunded','voided')
               AND p.status IN ('captured','pending')) THEN
    RETURN jsonb_build_object('success', false, 'error', 'G_MERGE_ORDER_PAID');
  END IF;

  -- ---- decide mode + canonical order host ----
  v_canonical_from := p_parent_table_number;
  IF v_resv_id IS NOT NULL THEN
    v_mode := 'reservation-aware';
    v_parent_order_id := NULL;          -- reserved tables carry no open order
  ELSIF v_occ_count > 0 THEN
    v_mode := 'bill-merge';
  ELSE
    v_mode := 'group-empty';
    v_parent_order_id := NULL;
  END IF;

  v_old_state := jsonb_build_object('parent_status', v_parent.status,
    'parent_order_id', v_parent_order_id, 'parent_reservation_id', v_resv_id,
    'children', v_children);
  v_group := 'group-' || p_parent_table_number;

  -- ========================================================================
  -- APPLY per child
  -- ========================================================================
  FOR v_child IN SELECT * FROM public.table_floors
                 WHERE table_number = ANY(v_children) ORDER BY table_number LOOP
    v_child_kind := CASE v_child.status WHEN 'occupied' THEN 'occupied'
                                         WHEN 'reserved' THEN 'reserved'
                                         WHEN 'empty'    THEN 'empty' ELSE 'other' END;

    IF v_child_kind = 'occupied' THEN
      SELECT * INTO v_child_order FROM public.orders
       WHERE table_number = v_child.table_number
         AND merged_into IS NULL
         AND status NOT IN ('paid','cancelled','closed','refunded','partially_refunded','voided')
       ORDER BY created_at ASC LIMIT 1;

      IF v_parent_kind = 'occupied' THEN
        -- case 4: child order merges INTO parent order (child lineage preserved)
        UPDATE public.orders SET
          merged_into = v_parent_order_id,
          merged_from_table = v_child.table_number,
          table_number = p_parent_table_number,
          updated_at = now(),
          version = COALESCE(version,0) + 1,
          updated_by_terminal_id = p_performed_by_terminal_id
        WHERE id = v_child_order.id;

        UPDATE public.kitchen_schedule SET
          table_number = p_parent_table_number, updated_at = now()
        WHERE order_id = v_child_order.id;

        v_children_lineage := v_children_lineage || jsonb_build_array(jsonb_build_object(
          'table', v_child.table_number, 'kind', 'occupied', 'order_id', v_child_order.id));
      ELSIF v_parent_order_id IS NULL THEN
        -- case 2: FIRST occupied child's order BECOMES canonical on (formerly empty) parent
        UPDATE public.orders SET
          table_number = p_parent_table_number,
          merged_from_table = v_child.table_number,
          merged_into = NULL,
          updated_at = now(),
          version = COALESCE(version,0) + 1,
          updated_by_terminal_id = p_performed_by_terminal_id
        WHERE id = v_child_order.id;

        UPDATE public.kitchen_schedule SET
          table_number = p_parent_table_number, updated_at = now()
        WHERE order_id = v_child_order.id;

        v_parent_order_id := v_child_order.id;
        v_canonical_from  := v_child.table_number;

        v_children_lineage := v_children_lineage || jsonb_build_array(jsonb_build_object(
          'table', v_child.table_number, 'kind', 'occupied', 'order_id', v_child_order.id));
      ELSE
        -- additional occupied child: merge its order into the established canonical
        UPDATE public.orders SET
          merged_into = v_parent_order_id,
          merged_from_table = v_child.table_number,
          table_number = p_parent_table_number,
          updated_at = now(),
          version = COALESCE(version,0) + 1,
          updated_by_terminal_id = p_performed_by_terminal_id
        WHERE id = v_child_order.id;

        UPDATE public.kitchen_schedule SET
          table_number = p_parent_table_number, updated_at = now()
        WHERE order_id = v_child_order.id;

        v_children_lineage := v_children_lineage || jsonb_build_array(jsonb_build_object(
          'table', v_child.table_number, 'kind', 'occupied', 'order_id', v_child_order.id));
      END IF;

      -- child floor -> merged / hidden
      UPDATE public.table_floors SET
        status = 'merged',
        current_order_id = NULL,
        merged_into_table = p_parent_table_number,
        kitchen_status = NULL,
        guest_count = NULL,
        total_amount = 0,
        order_count = 0,
        has_pending = false,
        oldest_pending_at = NULL,
        bill_requested = false,
        reservation_id = NULL,
        reservation_name = NULL,
        reservation_phone = NULL,
        reservation_time = NULL,
        metadata = COALESCE(metadata,'{}'::jsonb) || jsonb_build_object('merge_lineage',
          jsonb_build_object('mode', v_mode, 'kind', 'occupied',
            'order_id', v_child_order.id, 'parent_order_id', v_parent_order_id,
            'parent_reservation_id', v_resv_id, 'canonical_order_from', v_canonical_from)),
        updated_at = now(),
        updated_by_terminal_id = p_performed_by_terminal_id
      WHERE table_number = v_child.table_number;

      v_children_summary := v_children_summary || jsonb_build_array(jsonb_build_object(
        'child_table', v_child.table_number, 'kind', 'occupied',
        'order_id', v_child_order.id, 'total_amount', v_child_order.total_amount,
        'guest_count', v_child_order.guest_count));
      v_merged := v_merged + 1;
      CONTINUE;
    END IF;

    IF v_child_kind = 'reserved' THEN
      -- case 7: child reserved, same reservation as parent -> hide child in group
      UPDATE public.table_floors SET
        status = 'merged',
        current_order_id = NULL,
        merged_into_table = p_parent_table_number,
        kitchen_status = NULL,
        guest_count = NULL,
        has_pending = false,
        oldest_pending_at = NULL,
        bill_requested = false,
        -- keep reservation denormalized so unmerge can restore
        reservation_id = v_resv_id,
        reservation_name = v_resv_name,
        reservation_phone = v_resv_phone,
        reservation_time = v_resv_time,
        metadata = COALESCE(metadata,'{}'::jsonb) || jsonb_build_object('merge_lineage',
          jsonb_build_object('mode', v_mode, 'kind', 'reserved',
            'order_id', NULL, 'parent_order_id', NULL,
            'parent_reservation_id', v_resv_id, 'canonical_order_from', v_canonical_from)),
        updated_at = now(),
        updated_by_terminal_id = p_performed_by_terminal_id
      WHERE table_number = v_child.table_number;

      v_children_lineage := v_children_lineage || jsonb_build_array(jsonb_build_object(
        'table', v_child.table_number, 'kind', 'reserved', 'order_id', NULL));
      v_children_summary := v_children_summary || jsonb_build_array(jsonb_build_object(
        'child_table', v_child.table_number, 'kind', 'reserved'));
      v_merged := v_merged + 1;
      CONTINUE;
    END IF;

    -- child_kind = 'empty'
    IF v_mode = 'reservation-aware' AND v_resv_id IS NOT NULL THEN
      -- case 5/6: empty table joins the group reservation
      UPDATE public.table_floors SET
        status = 'merged',
        current_order_id = NULL,
        merged_into_table = p_parent_table_number,
        kitchen_status = NULL,
        guest_count = NULL,
        total_amount = 0,
        order_count = 0,
        has_pending = false,
        oldest_pending_at = NULL,
        bill_requested = false,
        reservation_id = v_resv_id,
        reservation_name = v_resv_name,
        reservation_phone = v_resv_phone,
        reservation_time = v_resv_time,
        metadata = COALESCE(metadata,'{}'::jsonb) || jsonb_build_object('merge_lineage',
          jsonb_build_object('mode', v_mode, 'kind', 'empty',
            'order_id', NULL, 'parent_order_id', v_parent_order_id,
            'parent_reservation_id', v_resv_id, 'canonical_order_from', v_canonical_from)),
        updated_at = now(),
        updated_by_terminal_id = p_performed_by_terminal_id
      WHERE table_number = v_child.table_number;

      -- attach the empty table to the reservation (trigger syncs reservations.table_ids)
      INSERT INTO public.reservation_tables (reservation_id, table_number, created_at)
      VALUES (v_resv_id, v_child.table_number, now())
      ON CONFLICT (reservation_id, table_number) DO NOTHING;
    ELSE
      -- case 1 (group-empty) or case 3 (occupied parent + empty child): plain group
      UPDATE public.table_floors SET
        status = 'merged',
        current_order_id = NULL,
        merged_into_table = p_parent_table_number,
        kitchen_status = NULL,
        guest_count = NULL,
        total_amount = 0,
        order_count = 0,
        has_pending = false,
        oldest_pending_at = NULL,
        bill_requested = false,
        reservation_id = NULL,
        reservation_name = NULL,
        reservation_phone = NULL,
        reservation_time = NULL,
        metadata = COALESCE(metadata,'{}'::jsonb) || jsonb_build_object('merge_lineage',
          jsonb_build_object('mode', v_mode, 'kind', 'empty',
            'order_id', NULL, 'parent_order_id', v_parent_order_id,
            'parent_reservation_id', v_resv_id, 'canonical_order_from', v_canonical_from)),
        updated_at = now(),
        updated_by_terminal_id = p_performed_by_terminal_id
      WHERE table_number = v_child.table_number;
    END IF;

    v_children_lineage := v_children_lineage || jsonb_build_array(jsonb_build_object(
      'table', v_child.table_number, 'kind', 'empty', 'order_id', NULL));
    v_children_summary := v_children_summary || jsonb_build_array(jsonb_build_object(
      'child_table', v_child.table_number, 'kind', 'empty'));
    v_merged := v_merged + 1;
  END LOOP;

  -- ========================================================================
  -- APPLY parent (final floor state)
  -- ========================================================================
  IF v_parent_kind = 'occupied' THEN
    -- case 3 / 4: parent keeps its own order (or case 2 parent became occupied via move)
    UPDATE public.table_floors SET
      status = 'occupied',
      current_order_id = v_parent_order_id,
      merged_into_table = NULL,
      metadata = COALESCE(metadata,'{}'::jsonb) || jsonb_build_object('merge_lineage',
        jsonb_build_object('mode', v_mode, 'parent_kind', 'occupied',
          'children', v_children_lineage, 'parent_order_id', v_parent_order_id,
          'parent_reservation_id', v_resv_id, 'canonical_order_from', v_canonical_from)),
      updated_at = now(),
      updated_by_terminal_id = p_performed_by_terminal_id
    WHERE table_number = p_parent_table_number;
    PERFORM public.sync_table_order_aggregates(p_parent_table_number);
  ELSIF v_parent_kind = 'reserved' THEN
    -- case 5 / 7: parent was reserved -> stays reserved; keep its existing reservation
    -- denormalized fields (already reflect the canonical display name/phone/time).
    UPDATE public.table_floors SET
      status = 'reserved',
      current_order_id = NULL,
      merged_into_table = NULL,
      metadata = COALESCE(metadata,'{}'::jsonb) || jsonb_build_object('merge_lineage',
        jsonb_build_object('mode', v_mode, 'parent_kind', 'reserved',
          'children', v_children_lineage, 'parent_order_id', NULL,
          'parent_reservation_id', v_resv_id, 'canonical_order_from', v_canonical_from)),
      updated_at = now(),
      updated_by_terminal_id = p_performed_by_terminal_id
    WHERE table_number = p_parent_table_number;
  ELSIF v_parent_kind = 'empty' AND v_resv_id IS NOT NULL THEN
    -- case 6: parent was empty, now carries the group reservation
    UPDATE public.table_floors SET
      status = 'reserved',
      current_order_id = NULL,
      merged_into_table = NULL,
      reservation_id = v_resv_id,
      reservation_name = v_resv_name,
      reservation_phone = v_resv_phone,
      reservation_time = v_resv_time,
      metadata = COALESCE(metadata,'{}'::jsonb) || jsonb_build_object('merge_lineage',
        jsonb_build_object('mode', v_mode, 'parent_kind', 'empty',
          'children', v_children_lineage, 'parent_order_id', NULL,
          'parent_reservation_id', v_resv_id, 'canonical_order_from', v_canonical_from)),
      updated_at = now(),
      updated_by_terminal_id = p_performed_by_terminal_id
    WHERE table_number = p_parent_table_number;
    -- parent (formerly empty) joins the reservation group
    INSERT INTO public.reservation_tables (reservation_id, table_number, created_at)
    VALUES (v_resv_id, p_parent_table_number, now())
    ON CONFLICT (reservation_id, table_number) DO NOTHING;
  ELSE
    -- case 1 (group-empty) / case 2 (parent empty, order moved in)
    IF v_mode = 'bill-merge' THEN
      -- case 2: parent was empty, child order now lives here -> occupied
      UPDATE public.table_floors SET
        status = 'occupied',
        current_order_id = v_parent_order_id,
        merged_into_table = NULL,
        metadata = COALESCE(metadata,'{}'::jsonb) || jsonb_build_object('merge_lineage',
          jsonb_build_object('mode', v_mode, 'parent_kind', 'empty',
            'children', v_children_lineage, 'parent_order_id', v_parent_order_id,
            'parent_reservation_id', NULL, 'canonical_order_from', v_canonical_from)),
        updated_at = now(),
        updated_by_terminal_id = p_performed_by_terminal_id
      WHERE table_number = p_parent_table_number;
      PERFORM public.sync_table_order_aggregates(p_parent_table_number);
    ELSE
      -- case 1: parent was empty, stays empty
      UPDATE public.table_floors SET
        status = 'empty',
        current_order_id = NULL,
        merged_into_table = NULL,
        guest_count = NULL,
        total_amount = 0,
        order_count = 0,
        has_pending = false,
        oldest_pending_at = NULL,
        bill_requested = false,
        metadata = COALESCE(metadata,'{}'::jsonb) || jsonb_build_object('merge_lineage',
          jsonb_build_object('mode', v_mode, 'parent_kind', 'empty',
            'children', v_children_lineage, 'parent_order_id', NULL,
            'parent_reservation_id', NULL, 'canonical_order_from', v_canonical_from)),
        updated_at = now(),
        updated_by_terminal_id = p_performed_by_terminal_id
      WHERE table_number = p_parent_table_number;
    END IF;
  END IF;

  -- refresh aggregates on merged children (order_count -> 0)
  FOR v_child IN SELECT * FROM public.table_floors WHERE table_number = ANY(v_children) ORDER BY table_number LOOP
    PERFORM public.sync_table_order_aggregates(v_child.table_number);
  END LOOP;

  PERFORM public.g_table_audit(
    'merge_tables', 'table.merged',
    p_parent_table_number, v_parent.id, v_parent_order_id,
    v_old_state,
    jsonb_build_object('mode', v_mode, 'merged_group_id', v_group, 'children', v_children_summary),
    p_performed_by, p_performed_by_terminal_id,
    'contract-merge-v2:' || v_mode,
    p_parent_table_number, NULL, v_parent.location_id, v_parent.organization_id);

  RETURN jsonb_build_object('success', true,
    'mode', v_mode,
    'parent_order_id', v_parent_order_id,
    'parent_reservation_id', v_resv_id,
    'merged_group_id', v_group,
    'merged_children', v_merged, 'children', v_children_summary);
END;
$function$;

-- ============================================================================
-- G3v2 — UNMERGE (lineage-driven restore)
-- Lineage is stored in table_floors.metadata.merge_lineage by the v2 merge:
--   parent: {mode, parent_kind, parent_order_id, parent_reservation_id,
--            canonical_order_from, children:[{table,kind,order_id}]}
--   child : {mode, kind, order_id, parent_order_id, parent_reservation_id, ...}
-- Restore rules (deterministic):
--   occupied child  -> its own order moves back to the child, child occupied
--   canonical order (case 2/3) -> moved back to the child that hosted it,
--                                 parent returns to EMPTY
--   empty child     -> EMPTY (+ its merged-in reservation_tables row removed)
--   reserved child  -> reserved again (its own reservation_tables row persists)
--   parent          -> its original pre-merge state per mode / parent_kind
-- Satisfies trg_table_release_guard + trg_validate_table_order_pointer:
--   the canonical order is moved back BEFORE any floor pointer is (re)set.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.unmerge_tables_atomic(
  p_parent_table_number integer,
  p_child_table_numbers integer[],
  p_performed_by uuid DEFAULT NULL::uuid,
  p_performed_by_terminal_id text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_parent          table_floors;
  v_child           table_floors;
  v_children        int[];
  v_plineage        jsonb;
  v_clineage        jsonb;
  v_mode            text;
  v_parent_kind     text;
  v_child_kind      text;
  v_resv_id         uuid;
  v_canonical_order uuid;
  v_canonical_from  int;
  v_child_order_id  uuid;
  v_resv_name       text;
  v_resv_phone      text;
  v_resv_time       text;
  v_resv_active     boolean;
  v_unmerged        int := 0;
  v_children_summary jsonb := '[]'::jsonb;
BEGIN
  PERFORM public.validate_actor(p_performed_by);

  IF p_parent_table_number = ANY(p_child_table_numbers) THEN
    RETURN jsonb_build_object('success', false, 'error', 'G_UNMERGE_PARENT_IN_CHILD');
  END IF;
  v_children := (SELECT array_agg(tn ORDER BY tn) FROM (SELECT DISTINCT unnest(p_child_table_numbers) AS tn) x);
  IF v_children IS NULL OR array_length(v_children, 1) IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'G_UNMERGE_NO_CHILDREN');
  END IF;

  SELECT * INTO v_parent FROM public.table_floors
   WHERE table_number = p_parent_table_number FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'TABLE_NOT_FOUND');
  END IF;
  FOR v_child IN SELECT * FROM public.table_floors
                 WHERE table_number = ANY(v_children) ORDER BY table_number FOR UPDATE LOOP
    NULL;
  END LOOP;
  IF (SELECT count(*) FROM public.table_floors WHERE table_number = ANY(v_children)) <> array_length(v_children, 1) THEN
    RETURN jsonb_build_object('success', false, 'error', 'G_UNMERGE_CHILD_NOT_FOUND');
  END IF;

  -- the group must actually be merged under this parent
  IF NOT EXISTS (SELECT 1 FROM public.table_floors
                 WHERE table_number = ANY(v_children)
                   AND merged_into_table = p_parent_table_number) THEN
    RETURN jsonb_build_object('success', false, 'error', 'G_UNMERGE_NO_MERGED_CHILDREN');
  END IF;

  -- ---- read parent lineage (fallback: infer from current state) ----
  v_plineage := v_parent.metadata;
  v_mode           := (v_plineage->'merge_lineage')->>'mode';
  v_parent_kind    := (v_plineage->'merge_lineage')->>'parent_kind';
  v_resv_id        := ((v_plineage->'merge_lineage')->>'parent_reservation_id')::uuid;
  v_canonical_order:= ((v_plineage->'merge_lineage')->>'parent_order_id')::uuid;
  v_canonical_from := ((v_plineage->'merge_lineage')->>'canonical_order_from')::int;

  IF v_mode IS NULL THEN
    IF v_parent.current_order_id IS NOT NULL THEN
      v_mode := 'bill-merge'; v_parent_kind := 'occupied';
      v_canonical_order := v_parent.current_order_id; v_canonical_from := p_parent_table_number;
    ELSIF v_parent.reservation_id IS NOT NULL THEN
      v_mode := 'reservation-aware'; v_parent_kind := 'reserved'; v_resv_id := v_parent.reservation_id;
    ELSE
      v_mode := 'group-empty'; v_parent_kind := 'empty';
    END IF;
  END IF;
  IF v_canonical_from IS NULL THEN v_canonical_from := p_parent_table_number; END IF;

  v_resv_active := EXISTS (SELECT 1 FROM public.reservations r
                           WHERE r.id = v_resv_id
                             AND r.status IN ('pending','confirmed','checked_in','seated'));

  -- ---- guards: no kitchen activity / payment on any open order in the group ----
  IF EXISTS (SELECT 1 FROM public.orders
             WHERE (table_number = p_parent_table_number OR table_number = ANY(v_children))
               AND status NOT IN ('paid','cancelled','closed','refunded','partially_refunded','voided')
               AND kitchen_status IN ('sent','accepted','preparing','cooking','ready','partially_ready','served')) THEN
    RETURN jsonb_build_object('success', false, 'error', 'G_UNMERGE_KITCHEN_ACTIVE');
  END IF;
  IF EXISTS (SELECT 1 FROM public.orders o JOIN public.payments p ON p.order_id = o.id
             WHERE (o.table_number = p_parent_table_number OR o.table_number = ANY(v_children))
               AND o.status NOT IN ('paid','cancelled','closed','refunded','partially_refunded','voided')
               AND p.status IN ('captured','pending')) THEN
    RETURN jsonb_build_object('success', false, 'error', 'G_UNMERGE_ORDER_PAID');
  END IF;

  -- ========================================================================
  -- PHASE 1 — parent first (move canonical order back, then set parent state)
  -- ========================================================================
  IF v_mode = 'bill-merge' AND v_canonical_order IS NOT NULL
     AND v_canonical_from <> p_parent_table_number AND v_canonical_from = ANY(v_children) THEN
    -- case 2 (or extra canonical): the group's canonical order belongs to a child -> move it back FIRST
    UPDATE public.orders SET
      table_number = v_canonical_from,
      merged_into = NULL,
      merged_from_table = NULL,
      updated_at = now(),
      version = COALESCE(version,0) + 1,
      updated_by_terminal_id = p_performed_by_terminal_id
    WHERE id = v_canonical_order;
    UPDATE public.kitchen_schedule SET table_number = v_canonical_from, updated_at = now()
    WHERE order_id = v_canonical_order;
    -- clear_stale_table_order_pointer now drops the parent's pointer to this order
  END IF;

  IF v_mode = 'bill-merge' THEN
    IF v_parent_kind = 'occupied' AND v_canonical_order IS NOT NULL THEN
      -- case 3 / 4: parent keeps the group's canonical order
      UPDATE public.table_floors SET
        status = 'occupied',
        current_order_id = v_canonical_order,
        merged_into_table = NULL,
        metadata = COALESCE(metadata,'{}'::jsonb) - 'merge_lineage',
        updated_at = now(), updated_by_terminal_id = p_performed_by_terminal_id
      WHERE table_number = p_parent_table_number;
      PERFORM public.sync_table_order_aggregates(p_parent_table_number);
    ELSE
      -- case 2: parent was empty (order already moved to the child) -> back to EMPTY
      UPDATE public.table_floors SET
        status = 'empty', current_order_id = NULL, merged_into_table = NULL,
        guest_count = NULL, total_amount = 0, order_count = 0, has_pending = false,
        oldest_pending_at = NULL, bill_requested = false,
        metadata = COALESCE(metadata,'{}'::jsonb) - 'merge_lineage',
        updated_at = now(), updated_by_terminal_id = p_performed_by_terminal_id
      WHERE table_number = p_parent_table_number;
    END IF;
  ELSIF v_mode = 'reservation-aware' THEN
    IF v_resv_id IS NOT NULL AND v_resv_active THEN
      SELECT name, phone, time::text INTO v_resv_name, v_resv_phone, v_resv_time
      FROM public.reservations WHERE id = v_resv_id;
    END IF;
    IF v_parent_kind = 'reserved' AND v_resv_active THEN
      -- case 5 / 7: parent was reserved -> restore reserved (its reservation row persists)
      UPDATE public.table_floors SET
        status = 'reserved', current_order_id = NULL, merged_into_table = NULL,
        reservation_id = v_resv_id, reservation_name = v_resv_name,
        reservation_phone = v_resv_phone, reservation_time = v_resv_time,
        metadata = COALESCE(metadata,'{}'::jsonb) - 'merge_lineage',
        updated_at = now(), updated_by_terminal_id = p_performed_by_terminal_id
      WHERE table_number = p_parent_table_number;
    ELSE
      -- case 6 (parent was empty) / reservation gone -> parent EMPTY; drop the binding merge added
      IF v_resv_id IS NOT NULL THEN
        DELETE FROM public.reservation_tables
         WHERE reservation_id = v_resv_id AND table_number = p_parent_table_number;
      END IF;
      UPDATE public.table_floors SET
        status = 'empty', current_order_id = NULL, merged_into_table = NULL,
        guest_count = NULL, total_amount = 0, order_count = 0, has_pending = false,
        oldest_pending_at = NULL, bill_requested = false,
        reservation_id = NULL, reservation_name = NULL, reservation_phone = NULL, reservation_time = NULL,
        metadata = COALESCE(metadata,'{}'::jsonb) - 'merge_lineage',
        updated_at = now(), updated_by_terminal_id = p_performed_by_terminal_id
      WHERE table_number = p_parent_table_number;
    END IF;
  ELSE
    -- group-empty: parent was empty, stays empty
    UPDATE public.table_floors SET
      status = 'empty', current_order_id = NULL, merged_into_table = NULL,
      guest_count = NULL, total_amount = 0, order_count = 0, has_pending = false,
      oldest_pending_at = NULL, bill_requested = false,
      reservation_id = NULL, reservation_name = NULL, reservation_phone = NULL, reservation_time = NULL,
      metadata = COALESCE(metadata,'{}'::jsonb) - 'merge_lineage',
      updated_at = now(), updated_by_terminal_id = p_performed_by_terminal_id
    WHERE table_number = p_parent_table_number;
  END IF;

  -- ========================================================================
  -- PHASE 2 — restore each child to its original state
  -- ========================================================================
  FOR v_child IN SELECT * FROM public.table_floors
                 WHERE table_number = ANY(v_children) ORDER BY table_number LOOP
    IF v_child.merged_into_table IS DISTINCT FROM p_parent_table_number THEN
      CONTINUE;  -- not part of this group
    END IF;

    v_clineage := v_child.metadata;
    v_child_kind := (v_clineage->'merge_lineage')->>'kind';
    IF v_child_kind NOT IN ('occupied','reserved','empty') THEN
      v_child_kind := CASE WHEN v_child.reservation_id IS NOT NULL THEN 'reserved'
                           WHEN v_child.current_order_id IS NOT NULL THEN 'occupied'
                           ELSE 'empty' END;
    END IF;
    v_child_order_id := ((v_clineage->'merge_lineage')->>'order_id')::uuid;
    IF v_child_order_id IS NULL THEN v_child_order_id := v_child.current_order_id; END IF;

    IF v_child_kind = 'occupied' AND v_child_order_id IS NOT NULL THEN
      -- child had its own order -> move it back to the child, child occupied
      UPDATE public.orders SET
        table_number = v_child.table_number,
        merged_into = NULL, merged_from_table = NULL,
        updated_at = now(), version = COALESCE(version,0) + 1,
        updated_by_terminal_id = p_performed_by_terminal_id
      WHERE id = v_child_order_id;
      UPDATE public.kitchen_schedule SET table_number = v_child.table_number, updated_at = now()
      WHERE order_id = v_child_order_id;
      UPDATE public.table_floors SET
        status = 'occupied', current_order_id = v_child_order_id, merged_into_table = NULL,
        kitchen_status = NULL,
        reservation_id = NULL, reservation_name = NULL, reservation_phone = NULL, reservation_time = NULL,
        metadata = COALESCE(metadata,'{}'::jsonb) - 'merge_lineage',
        updated_at = now(), updated_by_terminal_id = p_performed_by_terminal_id
      WHERE table_number = v_child.table_number;
      v_children_summary := v_children_summary || jsonb_build_array(jsonb_build_object(
        'table', v_child.table_number, 'restored', 'occupied', 'order_id', v_child_order_id));
      v_unmerged := v_unmerged + 1;
      CONTINUE;
    END IF;

    IF v_child_kind = 'reserved' AND v_resv_id IS NOT NULL AND v_resv_active THEN
      -- child was reserved (its own reservation row persists) -> reserved
      IF v_resv_name IS NULL THEN
        SELECT name, phone, time::text INTO v_resv_name, v_resv_phone, v_resv_time
        FROM public.reservations WHERE id = v_resv_id;
      END IF;
      UPDATE public.table_floors SET
        status = 'reserved', current_order_id = NULL, merged_into_table = NULL,
        kitchen_status = NULL,
        reservation_id = v_resv_id, reservation_name = v_resv_name,
        reservation_phone = v_resv_phone, reservation_time = v_resv_time,
        metadata = COALESCE(metadata,'{}'::jsonb) - 'merge_lineage',
        updated_at = now(), updated_by_terminal_id = p_performed_by_terminal_id
      WHERE table_number = v_child.table_number;
      v_children_summary := v_children_summary || jsonb_build_array(jsonb_build_object(
        'table', v_child.table_number, 'restored', 'reserved', 'reservation_id', v_resv_id));
      v_unmerged := v_unmerged + 1;
      CONTINUE;
    END IF;

    -- child was empty (or reservation gone) -> EMPTY; drop the reservation binding merge added
    IF v_resv_id IS NOT NULL THEN
      DELETE FROM public.reservation_tables
       WHERE reservation_id = v_resv_id AND table_number = v_child.table_number;
    END IF;
    UPDATE public.table_floors SET
      status = 'empty', current_order_id = NULL, merged_into_table = NULL,
      kitchen_status = NULL, guest_count = NULL, total_amount = 0, order_count = 0,
      has_pending = false, oldest_pending_at = NULL, bill_requested = false,
      reservation_id = NULL, reservation_name = NULL, reservation_phone = NULL, reservation_time = NULL,
      metadata = COALESCE(metadata,'{}'::jsonb) - 'merge_lineage',
      updated_at = now(), updated_by_terminal_id = p_performed_by_terminal_id
    WHERE table_number = v_child.table_number;
    v_children_summary := v_children_summary || jsonb_build_array(jsonb_build_object(
      'table', v_child.table_number, 'restored', 'empty'));
    v_unmerged := v_unmerged + 1;
  END LOOP;

  -- refresh aggregates on restored children
  FOR v_child IN SELECT * FROM public.table_floors
                 WHERE table_number = ANY(v_children) ORDER BY table_number LOOP
    PERFORM public.sync_table_order_aggregates(v_child.table_number);
  END LOOP;

  IF v_unmerged = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'G_UNMERGE_NO_MERGED_CHILDREN');
  END IF;

  PERFORM public.g_table_audit(
    'unmerge_tables', 'table.unmerged',
    p_parent_table_number, v_parent.id, v_canonical_order,
    jsonb_build_object('mode', v_mode, 'children', v_children, 'parent_kind', v_parent_kind),
    jsonb_build_object('mode', v_mode, 'unmerged', v_children_summary),
    p_performed_by, p_performed_by_terminal_id, 'contract-unmerge-v2:' || COALESCE(v_mode,'unknown'),
    p_parent_table_number, NULL, v_parent.location_id, v_parent.organization_id);

  RETURN jsonb_build_object('success', true, 'mode', v_mode,
    'parent_order_id', v_canonical_order, 'unmerged', v_children_summary, 'count', v_unmerged);
END;
$function$;

COMMIT;
