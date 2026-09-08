-- ============================================================================
-- P-1 — LEGACY LINEAGE-LESS UNMERGE FALLBACK FIX (transfer-contract freeze 2026-09-08)
--
-- Scope (single approved change — see TRANSFER_CONTRACT_AUDIT.md §8/§9 + freeze):
--   * ONLY unmerge_tables_atomic is rewritten (CREATE OR REPLACE).
--   * No changes to merge/transfer functions, schema, RLS, or triggers.
--   * T-2/T-3/T-4/T-5 verified working by the audit -> NO changes.
--   * No G_TRANSFER_TARGET_MERGED (rejected). No dead-function cleanup (deferred).
--
-- Bug (latent; confirmed synthetic case UR-6; no live production group has the shape):
--   Pre-V2 (legacy) merges wrote NO merge_lineage at all. In such a group a child
--   floor could be 'merged' with reservation_id NULL + current_order_id NULL while
--   the order it owned sits on the parent (orders.table_number = parent,
--   orders.merged_from_table = child). The child-kind fallback classified the child
--   as 'empty', so unmerge silently restored the child EMPTY — stranding its order
--   on the parent, never re-associated (no exception raised).
--
-- Fix (surgical, applies to LEGACY groups ONLY — gated on parent merge_lineage NULL):
--   1. Preflight: if in a lineage-less bill-merge group one child has MORE THAN ONE
--      non-final order at the parent claiming merged_from_table = that child ->
--      fail LOUD with G_UNMERGE_LEGACY_AMBIGUOUS (operator fixes data manually).
--   2. Fallback: lineage-less child (reservation_id NULL, current_order_id NULL) in a
--      bill-merge group with EXACTLY ONE such recoverable order -> child is restored
--      OCCUPIED with that order (order moved back to the child; legacy
--      merged_from_table / merged_into markers cleared; kitchen row re-pointed).
--   3. ZERO recoverable orders -> child was genuinely EMPTY (legacy behavior kept).
--   4. Parent fixup: if the recovered order WAS the parent's pointer order, the
--      stale-pointer trigger already cleared the parent's current_order_id when the
--      order moved to the child; the parent is reset to EMPTY. If the parent still
--      has other open orders, the release guard makes the unmerge fail loud — never
--      a silent pointer-less 'occupied' parent.
--
-- Real-data safety (read-only verified against production 2026-09-08):
--   legacy groups 3/4, 6/7, 17/16/18 each have ZERO non-final orders with
--   merged_from_table IN (their children) -> every P-1 branch is a no-op on current
--   production data; behavior for them is byte-identical to before.
-- ============================================================================

BEGIN;

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
  -- P-1 (legacy lineage-less recovery)
  v_legacy_candidate_orders int := 0;
  v_p1_recovered            int := 0;
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
    -- reservation is checked BEFORE the pointer: a LEGACY checked-in group has a
    -- reserved parent that still carries a pointer (e.g. real table 6) — it must
    -- restore as 'reserved' keeping that pointer, not as 'occupied'. A bill-merge
    -- parent never has a reservation_id, so this ordering is safe both ways.
    IF v_parent.reservation_id IS NOT NULL THEN
      v_mode := 'reservation-aware'; v_parent_kind := 'reserved'; v_resv_id := v_parent.reservation_id;
    ELSIF EXISTS (SELECT 1 FROM public.table_floors
                  WHERE table_number = ANY(v_children) AND reservation_id IS NOT NULL) THEN
      -- legacy reservation group: child still carries the reservation binding
      v_mode := 'reservation-aware'; v_parent_kind := 'reserved';
      SELECT reservation_id INTO v_resv_id FROM public.table_floors
       WHERE table_number = ANY(v_children) AND reservation_id IS NOT NULL ORDER BY table_number LIMIT 1;
    ELSIF v_parent.status = 'reserved' THEN
      -- legacy checked-in / manual-reserved group: parent shows 'reserved' but has no
      -- reservation record (reservation_id NULL) — e.g. real tables 6/7
      v_mode := 'reservation-aware'; v_parent_kind := 'reserved';
      -- v_resv_id stays NULL
    ELSIF v_parent.current_order_id IS NOT NULL THEN
      v_mode := 'bill-merge'; v_parent_kind := 'occupied';
      v_canonical_order := v_parent.current_order_id; v_canonical_from := p_parent_table_number;
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
  -- P-1 PREFLIGHT — lineage-less legacy bill-merge group: ambiguity fails loud
  -- ========================================================================
  IF v_mode = 'bill-merge' AND (v_plineage->'merge_lineage') IS NULL THEN
    IF EXISTS (SELECT 1 FROM public.orders
               WHERE table_number = p_parent_table_number
                 AND merged_from_table = ANY(v_children)
                 AND status NOT IN ('paid','cancelled','closed','refunded','partially_refunded','voided')
               GROUP BY merged_from_table
               HAVING count(*) > 1) THEN
      RETURN jsonb_build_object('success', false, 'error', 'G_UNMERGE_LEGACY_AMBIGUOUS',
        'detail', 'lineage-less bill-merge group: a child of parent table ' || p_parent_table_number ||
                  ' has multiple non-final orders at the parent claiming its merged_from_table; ' ||
                  'fix orders.merged_from_table manually and retry unmerge');
    END IF;
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
    IF v_parent_kind = 'reserved' AND (v_resv_id IS NULL OR v_resv_active) THEN
      -- case 5 / 7 + legacy checked-in / manual-reserved group (e.g. real 6/7):
      -- parent restores to 'reserved'. current_order_id + reservation display fields
      -- are intentionally NOT touched (a legacy reserved parent keeps its pointer);
      -- reservation_id is kept as-is when the group has no reservation record.
      UPDATE public.table_floors SET
        status = 'reserved', merged_into_table = NULL,
        reservation_id = COALESCE(v_resv_id, reservation_id),
        metadata = COALESCE(metadata,'{}'::jsonb) - 'merge_lineage',
        updated_at = now(), updated_by_terminal_id = p_performed_by_terminal_id
      WHERE table_number = p_parent_table_number;
    ELSE
      -- case 6 (parent was empty) / reservation gone (id set but inactive) -> parent EMPTY;
      -- drop the reservation_tables binding the merge added
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
    IF v_child_kind IS NULL OR v_child_kind NOT IN ('occupied','reserved','empty') THEN
      IF v_child_kind IS NULL AND v_mode = 'bill-merge'
         AND (v_plineage->'merge_lineage') IS NULL
         AND v_child.reservation_id IS NULL AND v_child.current_order_id IS NULL THEN
        -- P-1: lineage-less legacy child in a lineage-less bill-merge group.
        -- Its order (if any) was moved to the parent by the legacy merge and is
        -- claimed via orders.merged_from_table = this child.
        SELECT count(*) INTO v_legacy_candidate_orders
          FROM public.orders
         WHERE table_number = p_parent_table_number
           AND merged_from_table = v_child.table_number
           AND status NOT IN ('paid','cancelled','closed','refunded','partially_refunded','voided');
        -- count = 1 -> the child was OCCUPIED (order recovered below)
        -- count = 0 -> the child was genuinely EMPTY (legacy behavior preserved);
        -- count > 1 -> the preflight already failed loud (G_UNMERGE_LEGACY_AMBIGUOUS).
        IF v_legacy_candidate_orders = 1 THEN
          v_child_kind := 'occupied';
        ELSE
          v_child_kind := 'empty';
        END IF;
      ELSE
        v_child_kind := CASE WHEN v_child.reservation_id IS NOT NULL THEN 'reserved'
                             WHEN v_child.current_order_id IS NOT NULL THEN 'occupied'
                             WHEN v_mode = 'reservation-aware' THEN 'reserved'
                             ELSE 'empty' END;
      END IF;
    END IF;
    v_child_order_id := ((v_clineage->'merge_lineage')->>'order_id')::uuid;
    IF v_child_order_id IS NULL THEN v_child_order_id := v_child.current_order_id; END IF;
    -- P-1: a lineage-less legacy child classified 'occupied' above carries no pointer,
    -- so v_child_order_id is still NULL here -> recover the concrete order id.
    -- (kind='occupied' + order_id NULL can only arise from the P-1 branch above.)
    IF v_child_kind = 'occupied' AND v_child_order_id IS NULL
       AND v_mode = 'bill-merge' AND (v_plineage->'merge_lineage') IS NULL THEN
      SELECT id INTO v_child_order_id
        FROM public.orders
       WHERE table_number = p_parent_table_number
         AND merged_from_table = v_child.table_number
         AND status NOT IN ('paid','cancelled','closed','refunded','partially_refunded','voided')
       LIMIT 1;
      IF v_child_order_id IS NOT NULL THEN
        v_p1_recovered := 1;
      END IF;
    END IF;

    IF v_child_kind = 'occupied' AND v_child_order_id IS NOT NULL THEN
      -- child had its own order -> move it back to the child, child occupied
      -- (P-1: for a legacy lineage-less child this is the RECOVERED order)
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

    IF v_child_kind = 'reserved' AND (v_resv_id IS NULL OR v_resv_active) THEN
      IF v_resv_id IS NOT NULL THEN
        -- case 5 / 7 + legacy groups with a reservation record -> reserved,
        -- denormalized reservation fields restored from the canonical reservation
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
      ELSE
        -- legacy no-record group (e.g. real 6/7): reserved, keep the child's
        -- existing reservation fields untouched
        UPDATE public.table_floors SET
          status = 'reserved', current_order_id = NULL, merged_into_table = NULL,
          kitchen_status = NULL,
          metadata = COALESCE(metadata,'{}'::jsonb) - 'merge_lineage',
          updated_at = now(), updated_by_terminal_id = p_performed_by_terminal_id
        WHERE table_number = v_child.table_number;
      END IF;
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

  -- ========================================================================
  -- P-1 PARENT FIXUP — legacy lineage-less group only
  -- ========================================================================
  -- If the recovered order WAS the parent's pointer order (legacy case-2 shape),
  -- moving it to the child fired clear_stale_table_order_pointer and dropped the
  -- parent's current_order_id. An 'occupied' parent with no pointer is invalid:
  -- reset the parent to EMPTY. If the parent still holds other open orders the
  -- release guard makes this unmerge fail loud — never a silent pointer-less
  -- 'occupied' parent. If the parent kept its own pointer order, only re-sync.
  IF v_p1_recovered > 0 THEN
    IF NOT EXISTS (SELECT 1 FROM public.table_floors
                   WHERE table_number = p_parent_table_number AND current_order_id IS NOT NULL) THEN
      UPDATE public.table_floors SET
        status = 'empty', current_order_id = NULL, merged_into_table = NULL,
        guest_count = NULL, total_amount = 0, order_count = 0, has_pending = false,
        oldest_pending_at = NULL, bill_requested = false,
        metadata = COALESCE(metadata,'{}'::jsonb) - 'merge_lineage',
        updated_at = now(), updated_by_terminal_id = p_performed_by_terminal_id
      WHERE table_number = p_parent_table_number;
    END IF;
    PERFORM public.sync_table_order_aggregates(p_parent_table_number);
  END IF;

  IF v_unmerged = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'G_UNMERGE_NO_MERGED_CHILDREN');
  END IF;

  PERFORM public.g_table_audit(
    'unmerge_tables', 'table.unmerged',
    p_parent_table_number, v_parent.id, v_canonical_order,
    jsonb_build_object('mode', v_mode, 'children', v_children, 'parent_kind', v_parent_kind),
    jsonb_build_object('mode', v_mode, 'unmerged', v_children_summary, 'p1_recovered', v_p1_recovered > 0),
    p_performed_by, p_performed_by_terminal_id, 'contract-unmerge-v2:' || COALESCE(v_mode,'unknown'),
    p_parent_table_number, NULL, v_parent.location_id, v_parent.organization_id);

  RETURN jsonb_build_object('success', true, 'mode', v_mode,
    'parent_order_id', v_canonical_order, 'unmerged', v_children_summary, 'count', v_unmerged);
END;
$function$;

COMMIT;
