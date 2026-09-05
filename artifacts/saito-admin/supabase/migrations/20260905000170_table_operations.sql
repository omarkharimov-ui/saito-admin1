-- ============================================================================
-- 0.4-G — TABLE OPERATIONS: Transfer / Merge / Unmerge / Dismiss / Clear /
--        Seat Guests / Walk-in (pre-order + scheduled) + Event Contract
--        + Table 14 legacy canonicalization
--
-- Depends on frozen 0.4-A..F.
-- All RPC signatures kept identical to the legacy versions so upstream calls
-- remain source-compatible. Every op: deterministic row locking, actor
-- validation, contract preconditions, audit + outbox event (G8), aggregates
-- recomputed from orders (orders.table_number stays SSOT).
-- ============================================================================

BEGIN;

-- ============================================================================
-- G0 helper: recompute table mirror fields from the SSOT (orders)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.sync_table_order_aggregates(p_table_number integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.table_floors tf SET
    total_amount   = COALESCE((SELECT sum(total_amount)  FROM public.orders
                                WHERE table_number = tf.table_number
                                  AND status NOT IN ('paid','cancelled','closed','refunded','partially_refunded','voided')), 0),
    guest_count    = COALESCE((SELECT sum(guest_count)  FROM public.orders
                                WHERE table_number = tf.table_number
                                  AND status NOT IN ('paid','cancelled','closed','refunded','partially_refunded','voided')), 0),
    order_count    = (SELECT count(*) FROM public.orders
                       WHERE table_number = tf.table_number
                         AND status NOT IN ('paid','cancelled','closed','refunded','partially_refunded','voided')),
    has_pending    = EXISTS (SELECT 1 FROM public.orders
                              WHERE table_number = tf.table_number
                                AND status NOT IN ('paid','cancelled','closed','refunded','partially_refunded','voided')
                                AND kitchen_status IN ('pending','reserved','sent','accepted','preparing','cooking','ready','partially_ready','served')),
    oldest_pending_at = (SELECT min(updated_at) FROM public.orders
                          WHERE table_number = tf.table_number
                            AND status NOT IN ('paid','cancelled','closed','refunded','partially_refunded','voided')
                            AND kitchen_status IN ('pending','reserved','sent','accepted','preparing','cooking','ready','partially_ready','served')),
    updated_at     = now()
  WHERE tf.table_number = p_table_number;
END;
$function$;

-- ============================================================================
-- G0 helper: audit + outbox producer (G8). One correlation id per operation.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.g_table_audit(
  p_op text, p_event text,
  p_table_number integer, p_table_id uuid,
  p_order_id uuid, p_old jsonb, p_new jsonb,
  p_actor uuid, p_terminal text, p_reason text,
  p_source integer, p_target integer,
  p_loc uuid, p_org uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_corr uuid := gen_random_uuid();
BEGIN
  INSERT INTO public.operation_logs
    (operation, order_id, source_table_number, target_table_number,
     old_state, new_state, performed_by, reason,
     location_id, organization_id, correlation_id, created_at)
  VALUES
    (p_op, p_order_id, p_source, p_target,
     COALESCE(p_old, '{}'::jsonb), COALESCE(p_new, '{}'::jsonb), p_actor, p_reason,
     p_loc, p_org, v_corr, now());

  IF p_event IS NOT NULL THEN
    INSERT INTO public.outbox_events (aggregate_type, aggregate_id, event_type, payload, status, metadata)
    VALUES ('table', p_table_id, p_event,
      jsonb_build_object(
        'table_number',            p_table_number,
        'order_id',                p_order_id,
        'old_state',               p_old,
        'new_state',               p_new,
        'source_table_number',     p_source,
        'target_table_number',     p_target,
        'location_id',             p_loc,
        'organization_id',         p_org,
        'performed_by',            p_actor,
        'terminal_id',             p_terminal,
        'reason',                  p_reason,
        'correlation_id',          v_corr),
      'pending',
      jsonb_build_object('operation', p_op, 'terminal_id', p_terminal, 'correlation_id', v_corr));
  END IF;
END;
$function$;

-- ============================================================================
-- G5/G9: release to empty/cleaning must fresh the kitchen mirror.
-- Canonical: kitchen_status NULL == no kitchen activity pending.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.table_release_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.status IN ('empty','cleaning') THEN
    IF NEW.current_order_id IS NOT NULL THEN
      RAISE EXCEPTION 'TABLE_ORDER_POINTER_ACTIVE: table % cannot be released while it still points order %',
        NEW.table_number, NEW.current_order_id USING ERRCODE = 'P0001';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.table_number = NEW.table_number
        AND o.status NOT IN ('paid','cancelled','closed','refunded','partially_refunded','voided')
    ) THEN
      RAISE EXCEPTION 'TABLE_OPEN_ORDERS: table % cannot be empty while open orders exist; close/dismiss them first',
        NEW.table_number USING ERRCODE = 'P0001';
    END IF;
    NEW.kitchen_status := NULL;
  END IF;
  RETURN NEW;
END;
$function$;

-- ============================================================================
-- G1 — TRANSFER
-- ============================================================================
CREATE OR REPLACE FUNCTION public.transfer_table_atomic(
  p_from_table integer,
  p_to_table integer,
  p_performed_by uuid DEFAULT NULL::uuid,
  p_performed_by_terminal_id text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_from RECORD;
  v_to   RECORD;
  v_order RECORD;
  v_active int;
  v_paid int;
  v_total numeric;
  v_guests int;
  v_old_state jsonb;
BEGIN
  PERFORM public.validate_actor(p_performed_by);
  IF p_from_table = p_to_table THEN
    RETURN jsonb_build_object('success', false, 'error', 'G_TRANSFER_SAME_TABLE');
  END IF;

  SELECT * INTO v_from FROM public.table_floors WHERE table_number = p_from_table FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'TABLE_NOT_FOUND');
  END IF;
  SELECT * INTO v_to FROM public.table_floors WHERE table_number = p_to_table FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'TABLE_NOT_FOUND');
  END IF;

  IF v_from.location_id IS DISTINCT FROM v_to.location_id
     OR v_from.organization_id IS DISTINCT FROM v_to.organization_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'G_TRANSFER_LOCATION_MISMATCH');
  END IF;
  IF v_from.merged_into_table IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'G_TRANSFER_SOURCE_MERGED');
  END IF;
  IF v_from.reservation_id IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'G_TRANSFER_SOURCE_RESERVED');
  END IF;
  IF v_to.status NOT IN ('empty','dirty') OR v_to.current_order_id IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'G_TRANSFER_TARGET_OCCUPIED');
  END IF;
  IF v_to.reservation_id IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'G_TRANSFER_TARGET_RESERVED');
  END IF;

  SELECT count(*) INTO v_active FROM public.orders
   WHERE table_number = p_from_table
     AND status NOT IN ('paid','cancelled','closed','refunded','partially_refunded','voided');
  IF v_active = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'G_NO_ACTIVE_ORDER');
  END IF;
  IF v_active > 1 THEN
    RETURN jsonb_build_object('success', false, 'error', 'G_TRANSFER_MULTIPLE_ORDERS');
  END IF;

  SELECT * INTO v_order FROM public.orders
   WHERE table_number = p_from_table
     AND status NOT IN ('paid','cancelled','closed','refunded','partially_refunded','voided')
   ORDER BY created_at ASC LIMIT 1;

  SELECT count(*) INTO v_paid FROM public.payments
   WHERE order_id = v_order.id AND status IN ('captured','pending');
  IF v_paid > 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'G_TRANSFER_ORDER_PAID');
  END IF;

  SELECT COALESCE(sum(total_amount),0), COALESCE(sum(guest_count),0)
    INTO v_total, v_guests
   FROM public.orders
   WHERE table_number = p_from_table
     AND status NOT IN ('paid','cancelled','closed','refunded','partially_refunded','voided');

  v_old_state := jsonb_build_object('status', v_from.status, 'order_status', v_order.status,
    'guest_count', v_order.guest_count, 'total_amount', v_order.total_amount);

  -- order ownership moves first (orders.table_number is SSOT);
  -- clear_stale_table_order_pointer auto-clears the source pointer.
  UPDATE public.orders SET
    table_number = p_to_table,
    updated_at = now(),
    version = COALESCE(version, 0) + 1,
    updated_by_terminal_id = p_performed_by_terminal_id
  WHERE id = v_order.id;

  UPDATE public.table_floors SET
    status = 'occupied',
    current_order_id = v_order.id,
    guest_count = v_guests,
    total_amount = v_total,
    merged_into_table = NULL,
    reservation_id = NULL,
    reservation_name = NULL,
    reservation_phone = NULL,
    reservation_time = NULL,
    bill_requested = false,
    updated_at = now(),
    updated_by_terminal_id = p_performed_by_terminal_id
  WHERE table_number = p_to_table;

  UPDATE public.table_floors SET
    status = 'empty',
    current_order_id = NULL,
    guest_count = NULL,
    total_amount = 0,
    order_count = 0,
    has_pending = false,
    oldest_pending_at = NULL,
    bill_requested = false,
    merged_into_table = NULL,
    reservation_id = NULL,
    reservation_name = NULL,
    reservation_phone = NULL,
    reservation_time = NULL,
    updated_at = now(),
    updated_by_terminal_id = p_performed_by_terminal_id
  WHERE table_number = p_from_table;

  PERFORM public.sync_table_order_aggregates(p_to_table);
  PERFORM public.sync_table_order_aggregates(p_from_table);

  PERFORM public.g_table_audit(
    'transfer_table', 'table.order_transferred',
    p_from_table, v_from.id, v_order.id,
    v_old_state,
    jsonb_build_object('status','occupied','order_id',v_order.id,'guest_count',v_guests,'total_amount',v_total),
    p_performed_by, p_performed_by_terminal_id, 'contract-transfer',
    p_from_table, p_to_table, v_from.location_id, v_from.organization_id);

  RETURN jsonb_build_object('success', true, 'order_id', v_order.id, 'to_table', p_to_table);
END;
$function$;

-- ============================================================================
-- G2 — MERGE
-- ============================================================================
CREATE OR REPLACE FUNCTION public.merge_tables_atomic(
  p_parent_table_number integer,
  p_child_table_numbers integer[],
  p_performed_by uuid DEFAULT NULL::uuid,
  p_performed_by_terminal_id text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_parent  RECORD;
  v_child   RECORD;
  v_order   RECORD;
  v_children int[];
  v_active  int;
  v_paid    int;
  v_parent_order_id uuid;
  v_merged  int := 0;
  v_group   text;
  v_children_summary jsonb := '[]'::jsonb;
  v_old_state jsonb;
BEGIN
  PERFORM public.validate_actor(p_performed_by);

  IF p_parent_table_number = ANY(p_child_table_numbers) THEN
    RETURN jsonb_build_object('success', false, 'error', 'G_MERGE_PARENT_IN_CHILD');
  END IF;

  v_children := (SELECT array_agg(tn ORDER BY tn)
                 FROM (SELECT DISTINCT unnest(p_child_table_numbers) AS tn) x);
  IF v_children IS NULL OR array_length(v_children, 1) IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'G_MERGE_NO_CHILDREN');
  END IF;

  SELECT * INTO v_parent FROM public.table_floors
   WHERE table_number = p_parent_table_number FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'TABLE_NOT_FOUND');
  END IF;

  -- lock children deterministically after parent
  FOR v_child IN SELECT * FROM public.table_floors
                 WHERE table_number = ANY(v_children) ORDER BY table_number FOR UPDATE LOOP
    NULL;
  END LOOP;
  IF (SELECT count(*) FROM public.table_floors WHERE table_number = ANY(v_children)) <> array_length(v_children,1) THEN
    RETURN jsonb_build_object('success', false, 'error', 'G_MERGE_CHILD_NOT_FOUND');
  END IF;
  IF EXISTS (SELECT 1 FROM public.table_floors WHERE table_number = ANY(v_children)
             AND (location_id IS DISTINCT FROM v_parent.location_id
                  OR organization_id IS DISTINCT FROM v_parent.organization_id)) THEN
    RETURN jsonb_build_object('success', false, 'error', 'G_MERGE_LOCATION_MISMATCH');
  END IF;

  -- canonical parent: exactly one active, unmerged order
  SELECT count(*) INTO v_active FROM public.orders
   WHERE table_number = p_parent_table_number
     AND merged_into IS NULL
     AND status NOT IN ('paid','cancelled','closed','refunded','partially_refunded','voided');
  IF v_active = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'G_MERGE_PARENT_NO_ORDER');
  END IF;
  IF v_active > 1 THEN
    RETURN jsonb_build_object('success', false, 'error', 'G_MERGE_PARENT_MULTIPLE');
  END IF;
  SELECT * INTO v_order FROM public.orders
   WHERE table_number = p_parent_table_number
     AND merged_into IS NULL
     AND status NOT IN ('paid','cancelled','closed','refunded','partially_refunded','voided')
   ORDER BY created_at ASC LIMIT 1;
  v_parent_order_id := v_order.id;

  v_old_state := jsonb_build_object('parent_status', v_parent.status,
    'parent_order_id', v_parent_order_id, 'children', v_children);

  FOR v_child IN SELECT * FROM public.table_floors WHERE table_number = ANY(v_children) ORDER BY table_number LOOP
    SELECT count(*) INTO v_active FROM public.orders
     WHERE table_number = v_child.table_number
       AND merged_into IS NULL
       AND status NOT IN ('paid','cancelled','closed','refunded','partially_refunded','voided');
    IF v_active <> 1 THEN
      RETURN jsonb_build_object('success', false, 'error',
        'G_MERGE_CHILD_' || CASE WHEN v_active = 0 THEN 'NO_ORDER' ELSE 'MULTIPLE' END
        || ' (child=' || v_child.table_number || ')');
    END IF;
    IF v_child.reservation_id IS DISTINCT FROM v_parent.reservation_id THEN
      RETURN jsonb_build_object('success', false, 'error',
        'G_MERGE_RESERVATION_CONFLICT (child=' || v_child.table_number || ')');
    END IF;

    SELECT * INTO v_order FROM public.orders
     WHERE table_number = v_child.table_number
       AND merged_into IS NULL
       AND status NOT IN ('paid','cancelled','closed','refunded','partially_refunded','voided')
     ORDER BY created_at ASC LIMIT 1;

    SELECT count(*) INTO v_paid FROM public.payments
     WHERE order_id = v_order.id AND status IN ('captured','pending');
    IF v_paid > 0 THEN
      RETURN jsonb_build_object('success', false, 'error',
        'G_MERGE_ORDER_PAID (child=' || v_child.table_number || ')');
    END IF;

    -- item lineage is preserved on the child order row; it joins the parent
    -- physical table. total_amount stays on the child until aggregated.
    UPDATE public.orders SET
      merged_into = v_parent_order_id,
      merged_from_table = v_child.table_number,
      table_number = p_parent_table_number,
      updated_at = now(),
      version = COALESCE(version,0) + 1,
      updated_by_terminal_id = p_performed_by_terminal_id
    WHERE id = v_order.id;

    UPDATE public.table_floors SET
      status = 'empty',
      current_order_id = NULL,
      merged_into_table = p_parent_table_number,
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
      updated_at = now(),
      updated_by_terminal_id = p_performed_by_terminal_id
    WHERE table_number = v_child.table_number;

    UPDATE public.kitchen_schedule SET
      table_number = p_parent_table_number,
      updated_at = now()
    WHERE order_id = v_order.id;

    v_children_summary := v_children_summary ||
      jsonb_build_array(jsonb_build_object(
        'child_table', v_child.table_number,
        'order_id', v_order.id,
        'total_amount', v_order.total_amount,
        'guest_count', v_order.guest_count));
    v_merged := v_merged + 1;
  END LOOP;

  -- parent keeps own order as canonical pointer
  UPDATE public.table_floors SET
    status = 'occupied',
    current_order_id = v_parent_order_id,
    merged_into_table = NULL,
    updated_at = now(),
    updated_by_terminal_id = p_performed_by_terminal_id
  WHERE table_number = p_parent_table_number;

  PERFORM public.sync_table_order_aggregates(p_parent_table_number);
  FOR v_child IN SELECT * FROM public.table_floors WHERE table_number = ANY(v_children) ORDER BY table_number LOOP
    PERFORM public.sync_table_order_aggregates(v_child.table_number);
  END LOOP;

  v_group := 'group-' || p_parent_table_number;

  PERFORM public.g_table_audit(
    'merge_tables', 'table.merged',
    p_parent_table_number, v_parent.id, v_parent_order_id,
    v_old_state,
    jsonb_build_object('merged_group_id', v_group, 'children', v_children_summary),
    p_performed_by, p_performed_by_terminal_id, 'contract-merge',
    p_parent_table_number, NULL, v_parent.location_id, v_parent.organization_id);

  RETURN jsonb_build_object('success', true,
    'parent_order_id', v_parent_order_id, 'merged_group_id', v_group,
    'merged_children', v_merged, 'children', v_children_summary);
END;
$function$;

-- ============================================================================
-- G3 — UNMERGE (lineage from merged_into / merged_from_table)
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
  v_parent RECORD;
  v_child  RECORD;
  v_order  RECORD;
  v_parent_order_id uuid;
  v_parent_reservation_id uuid;
  v_children int[];
  v_unmerged int := 0;
  v_children_summary jsonb := '[]'::jsonb;
  v_found int;
BEGIN
  PERFORM public.validate_actor(p_performed_by);

  IF p_parent_table_number = ANY(p_child_table_numbers) THEN
    RETURN jsonb_build_object('success', false, 'error', 'G_UNMERGE_PARENT_IN_CHILD');
  END IF;
  v_children := (SELECT array_agg(tn ORDER BY tn)
                 FROM (SELECT DISTINCT unnest(p_child_table_numbers) AS tn) x);
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

  -- resolved parent order (canonical)
  SELECT id, reservation_id INTO v_parent_order_id, v_parent_reservation_id
   FROM public.orders
   WHERE table_number = p_parent_table_number
     AND merged_into IS NULL
     AND status NOT IN ('paid','cancelled','closed','refunded','partially_refunded','voided')
   ORDER BY created_at ASC LIMIT 1;

  FOR v_order IN
    SELECT * FROM public.orders
     WHERE table_number = p_parent_table_number
       AND status NOT IN ('paid','cancelled','closed','refunded','partially_refunded','voided')
       AND (merged_into = v_parent_order_id OR merged_from_table IS NOT NULL)
       AND (COALESCE(merged_from_table, 0) = ANY(v_children))
     ORDER BY created_at ASC
     FOR UPDATE
  LOOP
    IF v_order.kitchen_status IN ('sent','accepted','preparing','cooking','ready','partially_ready','served') THEN
      RETURN jsonb_build_object('success', false, 'error',
        'G_UNMERGE_KITCHEN_ACTIVE (order=' || v_order.id || ', kitchen=' || v_order.kitchen_status || ')');
    END IF;
    IF EXISTS (SELECT 1 FROM public.payments p
               WHERE p.order_id = v_order.id AND p.status IN ('captured','pending')) THEN
      RETURN jsonb_build_object('success', false, 'error',
        'G_UNMERGE_ORDER_PAID (order=' || v_order.id || ')');
    END IF;

    v_found := COALESCE(v_order.merged_from_table, p_parent_table_number);

    UPDATE public.orders SET
      table_number = v_found,
      merged_into = NULL,
      merged_from_table = NULL,
      updated_at = now(),
      version = COALESCE(version,0) + 1,
      updated_by_terminal_id = p_performed_by_terminal_id
    WHERE id = v_order.id;

    UPDATE public.table_floors SET
      status = 'occupied',
      current_order_id = v_order.id,
      merged_into_table = NULL,
      reservation_id = COALESCE(v_parent_reservation_id, reservation_id),
      updated_at = now(),
      updated_by_terminal_id = p_performed_by_terminal_id
    WHERE table_number = v_found;

    UPDATE public.kitchen_schedule SET
      table_number = v_found,
      updated_at = now()
    WHERE order_id = v_order.id;

    v_children_summary := v_children_summary ||
      jsonb_build_array(jsonb_build_object(
        'child_table', v_found, 'order_id', v_order.id));
    v_unmerged := v_unmerged + 1;
  END LOOP;

  IF v_unmerged = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'G_UNMERGE_NO_MERGED_CHILDREN');
  END IF;

  -- parent owns no moved children anymore; keep its own order canonical
  UPDATE public.table_floors SET
    merged_into_table = NULL,
    updated_at = now(),
    updated_by_terminal_id = p_performed_by_terminal_id
  WHERE table_number = p_parent_table_number;

  PERFORM public.sync_table_order_aggregates(p_parent_table_number);
  FOR v_child IN SELECT * FROM public.table_floors WHERE table_number = ANY(v_children) ORDER BY table_number LOOP
    PERFORM public.sync_table_order_aggregates(v_child.table_number);
  END LOOP;

  PERFORM public.g_table_audit(
    'unmerge_tables', 'table.unmerged',
    p_parent_table_number, v_parent.id, v_parent_order_id,
    jsonb_build_object('children', v_children, 'parent_order_id', v_parent_order_id),
    jsonb_build_object('unmerged', v_children_summary),
    p_performed_by, p_performed_by_terminal_id, 'contract-unmerge',
    p_parent_table_number, NULL, v_parent.location_id, v_parent.organization_id);

  RETURN jsonb_build_object('success', true, 'parent_order_id', v_parent_order_id,
    'unmerged', v_children_summary, 'count', v_unmerged);
END;
$function$;

-- ============================================================================
-- G4 — DISMISS
-- ============================================================================
CREATE OR REPLACE FUNCTION public.dismiss_table_atomic(
  p_table_number integer,
  p_reason text DEFAULT 'dismissed'::text,
  p_final_status text DEFAULT 'empty'::text,
  p_performed_by uuid DEFAULT NULL::uuid,
  p_terminal_id text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_table RECORD;
  v_order RECORD;
  v_active int;
  v_paid int;
  v_kitchen_active boolean;
  v_old_state jsonb;
BEGIN
  PERFORM public.validate_actor(p_performed_by);
  IF p_final_status NOT IN ('empty','cleaning') THEN
    RETURN jsonb_build_object('success', false, 'error', 'G_DISMISS_INVALID_FINAL');
  END IF;

  SELECT * INTO v_table FROM public.table_floors WHERE table_number = p_table_number FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'TABLE_NOT_FOUND');
  END IF;
  IF v_table.reservation_id IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'G_TABLE_RESERVED');
  END IF;
  IF v_table.merged_into_table IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'G_TABLE_MERGED');
  END IF;

  SELECT count(*) INTO v_active FROM public.orders
   WHERE table_number = p_table_number
     AND status NOT IN ('paid','cancelled','closed','refunded','partially_refunded','voided');
  IF v_active = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'G_NO_ACTIVE_ORDER');
  END IF;
  IF v_active > 1 THEN
    RETURN jsonb_build_object('success', false, 'error', 'G_TABLE_MULTIPLE_ORDERS');
  END IF;

  SELECT * INTO v_order FROM public.orders
   WHERE table_number = p_table_number
     AND status NOT IN ('paid','cancelled','closed','refunded','partially_refunded','voided')
   ORDER BY created_at ASC LIMIT 1;

  SELECT count(*) INTO v_paid FROM public.payments
   WHERE order_id = v_order.id AND status IN ('captured','pending');
  IF v_paid > 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'G_DISMISS_ORDER_PAID');
  END IF;

  -- kitchen may not have produced anything yet (pending/reserved may be removed)
  SELECT EXISTS (
    SELECT 1 FROM public.order_items
    WHERE order_id = v_order.id
      AND kitchen_status IN ('sent','accepted','preparing','cooking','ready','partially_ready','served','completed')
  ) INTO v_kitchen_active;
  IF v_kitchen_active THEN
    RETURN jsonb_build_object('success', false, 'error', 'G_DISMISS_KITCHEN_ACTIVE');
  END IF;

  v_old_state := jsonb_build_object('status', v_table.status,
    'order_id', v_order.id, 'order_status', v_order.status, 'total_amount', v_order.total_amount);

  -- registered edge (open/new/confirmed/... -> cancelled); triggers maintain timestamps
  UPDATE public.orders SET
    status = 'cancelled',
    cancelled_at = now(),
    cancelled_reason = p_reason,
    updated_at = now(),
    version = COALESCE(version,0) + 1,
    updated_by_terminal_id = p_terminal_id
  WHERE id = v_order.id;

  DELETE FROM public.order_items
   WHERE order_id = v_order.id AND kitchen_status IN ('pending','reserved','new');

  UPDATE public.table_floors SET
    status = p_final_status,
    guest_count = NULL,
    total_amount = 0,
    order_count = 0,
    current_order_id = NULL,
    merged_into_table = NULL,
    reservation_id = NULL,
    reservation_name = NULL,
    reservation_phone = NULL,
    reservation_time = NULL,
    has_pending = false,
    oldest_pending_at = NULL,
    bill_requested = false,
    updated_at = now(),
    updated_by_terminal_id = p_terminal_id
  WHERE table_number = p_table_number;

  PERFORM public.sync_table_order_aggregates(p_table_number);

  PERFORM public.g_table_audit(
    'dismiss_table', 'table.dismissed',
    p_table_number, v_table.id, v_order.id,
    v_old_state,
    jsonb_build_object('status', p_final_status, 'reason', p_reason, 'order_status', 'cancelled'),
    p_performed_by, p_terminal_id, p_reason,
    p_table_number, NULL, v_table.location_id, v_table.organization_id);

  RETURN jsonb_build_object('success', true, 'order_id', v_order.id, 'table_status', p_final_status);
END;
$function$;

-- ============================================================================
-- G5 — CLEAR
-- ============================================================================
CREATE OR REPLACE FUNCTION public.clear_table_atomic(
  p_table_number integer,
  p_performed_by uuid DEFAULT NULL::uuid,
  p_terminal_id text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_table RECORD;
  v_old_state jsonb;
BEGIN
  PERFORM public.validate_actor(p_performed_by);
  SELECT * INTO v_table FROM public.table_floors WHERE table_number = p_table_number FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'TABLE_NOT_FOUND');
  END IF;
  IF v_table.current_order_id IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'G_CLEAR_ORDER_POINTER');
  END IF;
  IF EXISTS (SELECT 1 FROM public.orders o
             WHERE o.table_number = p_table_number
               AND o.status NOT IN ('paid','cancelled','closed','refunded','partially_refunded','voided')) THEN
    RETURN jsonb_build_object('success', false, 'error', 'G_CLEAR_OPEN_ORDERS');
  END IF;
  IF v_table.reservation_id IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'G_CLEAR_RESERVED');
  END IF;

  v_old_state := jsonb_build_object('status', v_table.status, 'kitchen_status', v_table.kitchen_status);

  UPDATE public.table_floors SET
    status = 'empty',
    total_amount = 0,
    order_count = 0,
    guest_count = NULL,
    current_order_id = NULL,
    merged_into_table = NULL,
    reservation_id = NULL,
    reservation_name = NULL,
    reservation_phone = NULL,
    reservation_time = NULL,
    reservation_status_snapshot = NULL,
    reserved_at = NULL,
    reserved_until = NULL,
    has_pending = false,
    oldest_pending_at = NULL,
    bill_requested = false,
    order_ids = '{}'::text[],
    updated_at = now(),
    updated_by_terminal_id = p_terminal_id
  WHERE table_number = p_table_number;

  PERFORM public.g_table_audit(
    'clear_table', 'table.cleared',
    p_table_number, v_table.id, NULL,
    v_old_state,
    jsonb_build_object('status', 'empty', 'kitchen_status', NULL::text),
    p_performed_by, p_terminal_id, 'contract-clear',
    p_table_number, NULL, v_table.location_id, v_table.organization_id);

  RETURN jsonb_build_object('success', true, 'table_status', 'empty');
END;
$function$;

-- ============================================================================
-- G6 — SEAT GUESTS (per-table orders, guests distributed, capacity guard)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.seat_guests_atomic(
  p_reservation_id uuid,
  p_performed_by uuid DEFAULT NULL::uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_reservation RECORD;
  v_table RECORD;
  v_order_id uuid;
  v_order_ids uuid[] := '{}';
  v_item RECORD;
  v_now timestamptz := now();
  v_scheduled_for timestamptz;
  v_result jsonb;
  v_capacity int := 0;
  v_table_count int := 0;
  v_split int;
  v_k int := 0;
  v_old_state jsonb;
BEGIN
  PERFORM public.validate_actor(p_performed_by);

  SELECT * INTO v_reservation FROM public.reservations WHERE id = p_reservation_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Reservation not found');
  END IF;
  IF v_reservation.status NOT IN ('pending','confirmed','waiting') THEN
    RETURN jsonb_build_object('success', false, 'error', 'G_SEAT_RESERVATION_STATE');
  END IF;

  -- lock the reserved tables deterministically
  FOR v_table IN
    SELECT t.table_number, t.id AS table_id, t.capacity
    FROM public.reservation_tables rt
    JOIN public.table_floors t ON t.table_number = rt.table_number
    WHERE rt.reservation_id = p_reservation_id
      AND t.status = ANY (ARRAY['reserved','waiting'])
    ORDER BY t.table_number
    FOR UPDATE OF t
  LOOP
    NULL;
  END LOOP;

  v_scheduled_for := COALESCE(v_reservation.kitchen_scheduled_for,
    (v_reservation.date::timestamp + v_reservation.time::time)
      - interval '1 minute' * COALESCE(v_reservation.kitchen_prep_time_minutes, 20));

  -- capacity guard: sum of known capacities must cover guests (0/unknown skipped)
  SELECT COALESCE(sum(capacity), 0) INTO v_capacity
   FROM public.table_floors t
   JOIN public.reservation_tables rt ON rt.table_number = t.table_number
   WHERE rt.reservation_id = p_reservation_id
     AND t.status = ANY (ARRAY['reserved','waiting'])
     AND t.capacity > 0;
  IF v_capacity > 0 AND v_reservation.guests > v_capacity THEN
    RETURN jsonb_build_object('success', false, 'error',
      'G_SEAT_CAPACITY_EXCEEDED (guests=' || v_reservation.guests || ', capacity=' || v_capacity || ')');
  END IF;

  -- per-table seat minimum: every seated table gets >=1 guest (orders store
  -- guest_count > 0); the remainder lands on the primary table so the group
  -- total always matches the reservation's guest count.
  SELECT count(*) INTO v_table_count
   FROM public.reservation_tables rt
   JOIN public.table_floors t ON t.table_number = rt.table_number
   WHERE rt.reservation_id = p_reservation_id
     AND t.status = ANY (ARRAY['reserved','waiting']);

  -- deterministic per-table seat
  FOR v_table IN
    SELECT t.table_number, t.id AS table_id, t.capacity
    FROM public.reservation_tables rt
    JOIN public.table_floors t ON t.table_number = rt.table_number
    WHERE rt.reservation_id = p_reservation_id
      AND t.status = ANY (ARRAY['reserved','waiting'])
    ORDER BY t.table_number
  LOOP
    v_k := v_k + 1;
    IF v_k = 1 THEN
      v_split := COALESCE(v_reservation.guests, 1) - (v_table_count - 1);
      IF v_split < 1 THEN v_split := 1; END IF;
    ELSE
      v_split := 1; -- every seated table hosts at least one guest
    END IF;

    SELECT id INTO v_order_id FROM public.orders
     WHERE reservation_id = p_reservation_id
       AND table_number = v_table.table_number
       AND status NOT IN ('paid','cancelled','closed','refunded','partially_refunded','voided')
     ORDER BY created_at DESC LIMIT 1;

    IF v_order_id IS NULL THEN
      INSERT INTO public.orders (
        table_number, status, total_amount, guest_count,
        order_source, reservation_id, created_at, updated_at,
        created_by, is_draft, kitchen_status, kitchen_scheduled_for,
        location_id, organization_id
      ) VALUES (
        v_table.table_number, 'confirmed', 0, v_split,
        'dine_in', p_reservation_id, v_now, v_now,
        p_performed_by, false, 'pending', v_scheduled_for,
        v_reservation.location_id, v_reservation.organization_id
      ) RETURNING id INTO v_order_id;
    ELSE
      UPDATE public.orders SET
        status = 'confirmed',
        guest_count = v_split,
        kitchen_status = 'pending',
        kitchen_scheduled_for = v_scheduled_for,
        version = COALESCE(version,0) + 1,
        updated_at = v_now
      WHERE id = v_order_id;
    END IF;

    -- pre-order items land on the primary table's order only (reservation-level
    -- preorders have no per-table plan; single canonical carrier keeps totals exact)
    IF v_k = 1 THEN
      FOR v_item IN
        SELECT * FROM public.reservation_preorder_items WHERE reservation_id = p_reservation_id
      LOOP
        INSERT INTO public.order_items (
          order_id, product_id, combo_group_id, product_name, quantity,
          unit_price, total_price, modifiers, special_notes,
          course, kitchen_status, prepared_quantity, tax_rate, tax_amount, created_at
        ) VALUES (
          v_order_id, v_item.product_id, v_item.combo_id, v_item.product_name, v_item.quantity,
          v_item.unit_price, (v_item.quantity * v_item.unit_price), v_item.modifiers, v_item.special_notes,
          v_item.course, 'reserved', 0, 0, 0, v_now
        );
      END LOOP;
    END IF;

    UPDATE public.table_floors SET
      status = 'occupied',
      current_order_id = v_order_id,
      guest_count = v_split,
      last_activity_at = v_now,
      opened_at = COALESCE(opened_at, v_now),
      updated_at = v_now
    WHERE id = v_table.table_id;

    PERFORM public.sync_table_order_aggregates(v_table.table_number);

    v_old_state := jsonb_build_object('reservation_status', v_reservation.status,
      'guests', v_reservation.guests, 'table_number', v_table.table_number, 'capacity', v_table.capacity);

    PERFORM public.g_table_audit(
      'seat_guests', 'table.guests_seated',
      v_table.table_number, v_table.table_id, v_order_id,
      v_old_state,
      jsonb_build_object('status','occupied','order_id',v_order_id,'guests',v_split,
        'reservation_id', p_reservation_id, 'kitchen_scheduled_for', v_scheduled_for),
      p_performed_by, NULL, 'contract-seat',
      v_table.table_number, NULL, v_reservation.location_id, v_reservation.organization_id);

    v_order_ids := array_append(v_order_ids, v_order_id);
  END LOOP;

  IF array_length(v_order_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'G_SEAT_NO_TABLES');
  END IF;

  UPDATE public.reservations SET
    status = 'checked_in',
    checked_in_at = v_now,
    pre_order_items = '[]'::jsonb,
    pre_order_total = NULL,
    updated_at = v_now
  WHERE id = p_reservation_id;

  DELETE FROM public.reservation_preorder_items WHERE reservation_id = p_reservation_id;

  v_result := jsonb_build_object('success', true, 'order_ids', v_order_ids, 'seated_at', v_now, 'tables', v_k);
  RETURN v_result;
END;
$function$;

-- ============================================================================
-- G7 — WALK-IN: normal (open) / pre-order / scheduled (reservation-hold).
-- A NORMAL walk-in does NOT bind the table to a reservation (the reservation
-- row is created purely for POS traceability); only pre-order/scheduled
-- (hold) walk-ins bind the table, so seat_guests can activate it later.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.walkin_atomic(
  p_table_number integer,
  p_guests integer DEFAULT 1,
  p_name text DEFAULT NULL::text,
  p_phone text DEFAULT NULL::text,
  p_order_type text DEFAULT 'dine_in'::text,
  p_notes text DEFAULT NULL::text,
  p_user_id uuid DEFAULT NULL::uuid,
  p_pre_order boolean DEFAULT false,
  p_scheduled_date text DEFAULT NULL::text,
  p_scheduled_time text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_table RECORD;
  v_reservation_id uuid;
  v_order_id uuid;
  v_result jsonb;
  v_sched_date date;
  v_sched_time time;
  v_hold boolean;
BEGIN
  SELECT * INTO v_table FROM public.table_floors WHERE table_number = p_table_number FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'TABLE_NOT_FOUND');
  END IF;

  v_hold := COALESCE(p_pre_order, false)
         OR p_scheduled_date IS NOT NULL
         OR p_scheduled_time IS NOT NULL;

  IF v_table.status NOT IN ('empty','dirty') THEN
    RETURN jsonb_build_object('success', false, 'error', 'TABLE_NOT_EMPTY');
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.table_number = p_table_number
      AND o.status NOT IN ('paid','cancelled','closed','refunded','partially_refunded','voided')) THEN
    RETURN jsonb_build_object('success', false, 'error', 'TABLE_ALREADY_HAS_OPEN_ORDER');
  END IF;
  IF v_hold AND v_table.reservation_id IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'G_WALKIN_TABLE_RESERVED');
  END IF;
  IF NOT v_hold AND v_table.reservation_id IS NOT NULL AND v_table.status <> 'reserved' THEN
    RETURN jsonb_build_object('success', false, 'error', 'G_WALKIN_TABLE_RESERVED');
  END IF;

  v_sched_date := COALESCE(p_scheduled_date::date, CURRENT_DATE);
  v_sched_time := COALESCE(p_scheduled_time::time, CURRENT_TIME);

  IF v_hold THEN
    -- reservation-hold: no order yet, table sits reserved until seat_guests
    INSERT INTO public.reservations (name, phone, guests, date, time, status,
                                     table_ids, order_type, notes,
                                     kitchen_scheduled_for,
                                     location_id, organization_id, created_at, updated_at)
    VALUES (p_name, p_phone, p_guests, v_sched_date, v_sched_time, 'confirmed',
            ARRAY[p_table_number], p_order_type, p_notes,
            (v_sched_date + v_sched_time) - interval '20 minutes',
            v_table.location_id, v_table.organization_id, now(), now())
    RETURNING id INTO v_reservation_id;

    UPDATE public.table_floors SET
      status = 'reserved',
      reservation_id = v_reservation_id,
      reservation_name = p_name,
      reservation_phone = p_phone,
      guest_count = p_guests,
      current_order_id = NULL,
      updated_at = now()
    WHERE table_number = p_table_number;

    INSERT INTO public.reservation_tables (reservation_id, table_number, created_at)
    VALUES (v_reservation_id, p_table_number, now())
    ON CONFLICT (reservation_id, table_number) DO NOTHING;

    v_result := jsonb_build_object('success', true, 'reservation_id', v_reservation_id,
      'table_number', p_table_number, 'mode', 'reservation_hold');
    RETURN v_result;
  END IF;

  INSERT INTO public.reservations (name, phone, guests, date, time, status,
                                   table_ids, order_type, notes,
                                   location_id, organization_id, created_at, updated_at)
  VALUES (p_name, p_phone, p_guests, CURRENT_DATE, CURRENT_TIME, 'confirmed',
          ARRAY[p_table_number], p_order_type, p_notes,
          v_table.location_id, v_table.organization_id, NOW(), NOW())
  RETURNING id INTO v_reservation_id;

  INSERT INTO public.reservation_tables (reservation_id, table_number, created_at)
  VALUES (v_reservation_id, p_table_number, NOW())
  ON CONFLICT (reservation_id, table_number) DO NOTHING;

  INSERT INTO public.orders (table_number, status, guest_count, order_type,
                             location_id, organization_id, total_amount, returned_amount,
                             created_at, updated_at)
  VALUES (p_table_number, 'new', p_guests, p_order_type,
          v_table.location_id, v_table.organization_id, 0, 0, NOW(), NOW())
  RETURNING id INTO v_order_id;

  UPDATE public.table_floors SET
    status = 'occupied',
    guest_count = p_guests,
    current_order_id = v_order_id,
    updated_at = NOW()
  WHERE table_number = p_table_number;

  PERFORM public.log_reservation_operation(
    v_reservation_id,
    'walkin',
    jsonb_build_object('table_number', p_table_number, 'guests', p_guests),
    jsonb_build_object('table_number', p_table_number, 'guests', p_guests, 'order_id', v_order_id),
    p_user_id
  );

  INSERT INTO outbox_events (aggregate_type, aggregate_id, event_type, payload, status)
  VALUES ('table', v_table.id, 'table.order_opened',
    jsonb_build_object('table_number', p_table_number,
      'order_id', v_order_id,
      'reservation_id', v_reservation_id,
      'order_type', p_order_type,
      'location_id', v_table.location_id),
    'pending');

  v_result := jsonb_build_object(
    'success', true,
    'reservation_id', v_reservation_id,
    'order_id', v_order_id,
    'table_number', p_table_number
  );
  RETURN v_result;
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$function$;

-- ============================================================================
-- G9 — legacy canonicalization: any table that is occupied but holds no open
--      order, no pointer and no reservation is a stale occupied state.
--      Canonical fix = clear (release). Applies to prod table 14.
-- ============================================================================
DO $g9$
DECLARE
  v_r jsonb;
  v_done int := 0;
  v_tbl int;
BEGIN
  FOR v_tbl, v_r IN
    SELECT tf.table_number, clear_table_atomic(tf.table_number, NULL, '4G-REPAIR')
    FROM public.table_floors tf
    WHERE tf.status = 'occupied'
      AND tf.current_order_id IS NULL
      AND tf.reservation_id IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.orders o
        WHERE o.table_number = tf.table_number
          AND o.status NOT IN ('paid','cancelled','closed','refunded','partially_refunded','voided'))
  LOOP
    IF NOT (v_r->>'success')::boolean THEN
      RAISE EXCEPTION 'G9 repair failed on table %: %', v_tbl, v_r->>'error'
        USING ERRCODE = 'P0001';
    END IF;
    v_done := v_done + 1;
  END LOOP;
  IF v_done > 0 THEN
    RAISE NOTICE 'G9: canonicalized % stale occupied table(s)', v_done;
  END IF;
END;
$g9$;

-- ============================================================================
-- G8 — event contract installed via g_table_audit producers:
--      table.order_transferred | table.merged | table.unmerged
--      table.dismissed | table.cleared | table.guests_seated
--      (aggregate_type 'table', unique id, correlation_id metadata)
-- ============================================================================

COMMIT;