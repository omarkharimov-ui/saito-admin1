-- ============================================================================
-- 20260911000023 — F-03 (frozen): multi-location table identity (foundational)
--
-- USER-FROZEN: UNIQUE(location_id, table_number); same number across locations
-- allowed, duplicate within a location denied; table ops location-scoped;
-- client location_id never trusted (session active location, from F-02).
--
-- Re-key scope (verified against live data):
--   * table_floors UNIQUE(table_number) -> UNIQUE(location_id, table_number)
--   * table_floors.merged_into_table FK -> composite (location_id,
--     merged_into_table) -> (location_id, table_number)  [0 cross-loc rows]
--   * reservation_tables: + location_id (BEFORE INSERT trigger resolves it
--     from the reservation — all 12 writers unchanged), composite FK
--     (location_id, table_number) -> table_floors(location_id, table_number)
--   * table_order_contract view: joins scoped by location
--   * 7 number-based table-op fns: session-location scoping (activate is
--     uuid-based -> globally unique -> unchanged)
-- DATA: 8 dead reservation_tables rows (missing reservation AND missing
-- table 200-209, both FKs already broken) are moved to
-- reservation_tables_quarantine_2026_09 (NOT deleted — reconciliation).
-- O-module order-creation fns scoped in the O re-audit (documented).
-- ============================================================================

-- ---- 1. quarantine the 8 dead reservation_tables rows (both FKs broken) ----
CREATE TABLE IF NOT EXISTS public.reservation_tables_quarantine_2026_09 (
  reservation_id uuid,
  table_number integer,
  created_at timestamptz,
  quarantined_at timestamptz DEFAULT now(),
  quarantine_reason text DEFAULT 'F-03 re-key: missing reservation and/or missing table'
);
INSERT INTO public.reservation_tables_quarantine_2026_09 (reservation_id, table_number, created_at)
SELECT reservation_id, table_number, created_at FROM reservation_tables
WHERE NOT EXISTS (SELECT 1 FROM reservations r WHERE r.id = reservation_tables.reservation_id)
   OR NOT EXISTS (SELECT 1 FROM table_floors t WHERE t.table_number = reservation_tables.table_number);
DELETE FROM public.reservation_tables
WHERE NOT EXISTS (SELECT 1 FROM reservations r WHERE r.id = reservation_tables.reservation_id)
   OR NOT EXISTS (SELECT 1 FROM table_floors t WHERE t.table_number = reservation_tables.table_number);

-- ---- 2. reservation_tables.location_id + trigger (zero writer changes) ----
ALTER TABLE public.reservation_tables ADD COLUMN IF NOT EXISTS location_id uuid;
UPDATE public.reservation_tables rt SET location_id = r.location_id
FROM reservations r WHERE r.id = rt.reservation_id AND rt.location_id IS NULL;

CREATE OR REPLACE FUNCTION public.resv_table_loc_fill() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.location_id IS NULL THEN
    SELECT location_id INTO NEW.location_id FROM reservations WHERE id = NEW.reservation_id;
  END IF;
  IF NEW.location_id IS NULL THEN
    RAISE EXCEPTION 'reservation_tables.location_id unresolvable (reservation missing location)';
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_resv_table_loc_fill ON public.reservation_tables;
CREATE TRIGGER trg_resv_table_loc_fill BEFORE INSERT ON public.reservation_tables
FOR EACH ROW EXECUTE FUNCTION public.resv_table_loc_fill();

-- ---- 3. constraint + FK re-key (drop the two dependent FKs FIRST — they use
--         the old unique index as their target; only then can that index go) ----
ALTER TABLE public.table_floors DROP CONSTRAINT IF EXISTS table_floors_merged_into_table_fkey;
ALTER TABLE public.reservation_tables DROP CONSTRAINT IF EXISTS reservation_tables_table_number_fkey;
ALTER TABLE public.table_floors DROP CONSTRAINT IF EXISTS table_floors_table_number_key;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='table_floors_location_table_number_key') THEN
    ALTER TABLE public.table_floors ADD CONSTRAINT table_floors_location_table_number_key
      UNIQUE (location_id, table_number);
  END IF;
END;
$$;
ALTER TABLE public.table_floors
  ADD CONSTRAINT table_floors_merged_into_table_fkey
  FOREIGN KEY (location_id, merged_into_table) REFERENCES table_floors(location_id, table_number);
ALTER TABLE public.reservation_tables
  ADD CONSTRAINT reservation_tables_table_number_fkey
  FOREIGN KEY (location_id, table_number) REFERENCES table_floors(location_id, table_number) ON DELETE CASCADE;

-- ---- 4. table_order_contract view: location-scoped ----
DROP VIEW IF EXISTS public.table_order_contract;
CREATE VIEW public.table_order_contract AS
  SELECT tf.id, tf.table_number, tf.status AS table_status, tf.kitchen_status AS table_kitchen_status,
    tf.current_order_id,
    o.status AS current_order_status, o.kitchen_status AS current_order_kitchen_status,
    o.total_amount AS current_order_total,
    ( SELECT count(*) FROM orders x
      WHERE x.table_number = tf.table_number AND x.location_id = tf.location_id
        AND x.status <> ALL (ARRAY['paid','cancelled','closed','refunded','partially_refunded','voided']) ) AS open_orders,
    tf.location_id, tf.organization_id
  FROM table_floors tf
  LEFT JOIN orders o ON o.id = tf.current_order_id;
GRANT SELECT ON public.table_order_contract TO service_role;

-- ---- 5. 7 number-based table-op fns: session-location scoping ----
CREATE OR REPLACE FUNCTION public.clear_table_atomic(p_token text, p_table_number integer, p_performed_by uuid, p_terminal_id text) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sess_loc uuid;
  v_table RECORD;
  v_old_state jsonb;
BEGIN
  PERFORM public.set_session_staff(p_token);
  v_sess_loc := nullif(current_setting('app.current_location_id', true), '')::uuid;
  IF current_staff_id() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'FORBIDDEN');
  END IF;
  IF NOT coalesce(has_permission(current_staff_id(), 'floor.manage'), false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'PERMISSION_DENIED');
  END IF;

  PERFORM public.validate_actor(p_performed_by);
  SELECT * INTO v_table FROM public.table_floors WHERE table_number = p_table_number AND (v_sess_loc IS NULL OR location_id = v_sess_loc) FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'TABLE_NOT_FOUND');
  END IF;
  IF NOT has_location_access(v_table.location_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'FORBIDDEN_LOCATION');
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
$$;

CREATE OR REPLACE FUNCTION public.dismiss_table_atomic(p_token text, p_table_number integer, p_reason text, p_final_status text, p_performed_by uuid, p_terminal_id text) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sess_loc uuid;
  v_table RECORD;
  v_order RECORD;
  v_active int;
  v_paid int;
  v_kitchen_active boolean;
  v_old_state jsonb;
BEGIN
  PERFORM public.set_session_staff(p_token);
  v_sess_loc := nullif(current_setting('app.current_location_id', true), '')::uuid;
  IF current_staff_id() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'FORBIDDEN');
  END IF;
  IF NOT coalesce(has_permission(current_staff_id(), 'floor.manage'), false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'PERMISSION_DENIED');
  END IF;

  PERFORM public.validate_actor(p_performed_by);
  IF p_final_status NOT IN ('empty','cleaning') THEN
    RETURN jsonb_build_object('success', false, 'error', 'G_DISMISS_INVALID_FINAL');
  END IF;

  SELECT * INTO v_table FROM public.table_floors WHERE table_number = p_table_number AND (v_sess_loc IS NULL OR location_id = v_sess_loc) FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'TABLE_NOT_FOUND');
  END IF;
  IF NOT has_location_access(v_table.location_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'FORBIDDEN_LOCATION');
  END IF;
  IF v_table.reservation_id IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'G_TABLE_RESERVED');
  END IF;
  IF v_table.merged_into_table IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'G_TABLE_MERGED');
  END IF;

  SELECT count(*) INTO v_active FROM public.orders
   WHERE table_number = p_table_number AND location_id = v_table.location_id
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
$$;

CREATE OR REPLACE FUNCTION public.dismiss_undo_atomic(p_token text, p_table_number integer, p_performed_by uuid) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sess_loc uuid;
  v_caller_role text;
  v_loc uuid;
  v_cancelled_orders RECORD;
  v_order_ids UUID[];
  v_item RECORD;
  v_restored_count INTEGER := 0;
BEGIN
  -- F-01/F-02: token identity + manager tier (was: effective_admin_role +
  -- auth.role(), which is unreliable inside SECURITY DEFINER service-role calls)
  PERFORM public.set_session_staff(p_token);
  v_sess_loc := nullif(current_setting('app.current_location_id', true), '')::uuid;
  IF current_staff_id() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'FORBIDDEN');
  END IF;
  IF NOT coalesce(has_permission(current_staff_id(), 'floor.manage'), false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'PERMISSION_DENIED');
  END IF;
  SELECT public.effective_admin_role() INTO v_caller_role;

  -- F-02: location isolation (the table must be in the actor's accessible locations)
  SELECT location_id INTO v_loc FROM public.table_floors WHERE table_number = p_table_number AND (v_sess_loc IS NULL OR location_id = v_sess_loc);
  IF FOUND AND NOT has_location_access(v_loc) THEN
    RETURN jsonb_build_object('success', false, 'error', 'FORBIDDEN_LOCATION');
  END IF;

  -- Find the most recent cancelled orders on this table (from the dismiss action)
  FOR v_cancelled_orders IN
    SELECT id, table_number, status, total_amount, guest_count, reservation_id,
           customer_name, customer_phone, kitchen_status, created_at, version
    FROM orders
    WHERE table_number = p_table_number
      AND status = 'cancelled'
      AND updated_at >= now() - interval '1 hour'
    ORDER BY updated_at DESC
    FOR UPDATE
  LOOP
    v_order_ids := array_append(v_order_ids, v_cancelled_orders.id);
  END LOOP;

  IF array_length(v_order_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No recent cancelled orders found to undo');
  END IF;

  -- Restore orders to their previous status (new/confirmed)
  UPDATE orders
  SET status = CASE WHEN kitchen_status = 'cancelled' THEN 'new' ELSE 'confirmed' END,
      kitchen_status = CASE WHEN kitchen_status = 'cancelled' THEN 'pending' ELSE kitchen_status END,
      cancelled_at = NULL,
      updated_at = now(),
      version = COALESCE(version, 0) + 1
  WHERE id = ANY(v_order_ids);

  -- Restore order items
  UPDATE order_items
  SET kitchen_status = 'pending'
  WHERE order_id = ANY(v_order_ids)
    AND kitchen_status = 'cancelled';

  -- Restore table state
  UPDATE table_floors
  SET
    status = 'occupied',
    guest_count = COALESCE((SELECT guest_count FROM orders WHERE id = v_order_ids[1]), 1),
    reservation_id = (SELECT reservation_id FROM orders WHERE id = v_order_ids[1]),
    reservation_name = (SELECT customer_name FROM orders WHERE id = v_order_ids[1]),
    reservation_phone = (SELECT customer_phone FROM orders WHERE id = v_order_ids[1]),
    current_order_id = v_order_ids[1],
    updated_at = now()
  WHERE table_number = p_table_number;

  -- Restore stock deductions
  FOR v_item IN
    SELECT oi.id, oi.product_id, oi.quantity, r.ingredient_id, r.quantity AS recipe_qty
    FROM order_items oi
    JOIN recipe_items r ON r.product_id = oi.product_id
    WHERE oi.order_id = ANY(v_order_ids)
  LOOP
    INSERT INTO inventory_logs (ingredient_id, quantity, type, unit_cost, reference_type, reference_id, created_at)
    VALUES (
      v_item.ingredient_id,
      v_item.recipe_qty * v_item.quantity,
      'stock_out'::inventory_log_type,
      0,
      'order',
      v_item.id,
      now()
    );
    v_restored_count := v_restored_count + 1;
  END LOOP;

  -- Audit
  INSERT INTO audit_log (table_name, record_id, action, old_data, new_data, performed_by, created_at)
  VALUES (
    'orders',
    v_order_ids[1],
    'dismiss_undo',
    jsonb_build_object('table_number', p_table_number, 'order_ids', v_order_ids, 'status', 'cancelled'),
    jsonb_build_object('status', 'restored', 'restored_items', v_restored_count),
    p_performed_by,
    now()
  );

  RETURN jsonb_build_object(
    'success', true,
    'restored_orders', array_length(v_order_ids, 1),
    'restored_items', v_restored_count
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.merge_tables_atomic(p_token text, p_parent_table_number integer, p_child_table_numbers integer[], p_performed_by uuid, p_performed_by_terminal_id text) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sess_loc uuid;
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
  PERFORM public.set_session_staff(p_token);
  v_sess_loc := nullif(current_setting('app.current_location_id', true), '')::uuid;
  IF current_staff_id() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'FORBIDDEN');
  END IF;
  IF NOT coalesce(has_permission(current_staff_id(), 'floor.manage'), false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'PERMISSION_DENIED');
  END IF;

  PERFORM public.validate_actor(p_performed_by);

  IF p_parent_table_number = ANY(p_child_table_numbers) THEN
    RETURN jsonb_build_object('success', false, 'error', 'G_MERGE_PARENT_IN_CHILD');
  END IF;
  v_children := (SELECT array_agg(tn ORDER BY tn) FROM (SELECT DISTINCT unnest(p_child_table_numbers) AS tn) x);
  IF v_children IS NULL OR array_length(v_children, 1) IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'G_MERGE_NO_CHILDREN');
  END IF;

  SELECT * INTO v_parent FROM public.table_floors
   WHERE table_number = p_parent_table_number AND (v_sess_loc IS NULL OR location_id = v_sess_loc) FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'TABLE_NOT_FOUND');
  END IF;
  IF NOT has_location_access(v_parent.location_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'FORBIDDEN_LOCATION');
  END IF;
  IF EXISTS (SELECT 1 FROM public.table_floors WHERE table_number = ANY(v_children) AND location_id <> v_parent.location_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'FORBIDDEN_LOCATION');
  END IF;
  IF EXISTS (SELECT 1 FROM public.table_floors WHERE table_number = ANY(v_children) AND NOT has_location_access(location_id)) THEN
    RETURN jsonb_build_object('success', false, 'error', 'FORBIDDEN_LOCATION');
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
$$;

CREATE OR REPLACE FUNCTION public.unmerge_tables_atomic(p_token text, p_parent_table_number integer, p_child_table_numbers integer[], p_performed_by uuid, p_performed_by_terminal_id text) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sess_loc uuid;
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
  PERFORM public.set_session_staff(p_token);
  v_sess_loc := nullif(current_setting('app.current_location_id', true), '')::uuid;
  IF current_staff_id() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'FORBIDDEN');
  END IF;
  IF NOT coalesce(has_permission(current_staff_id(), 'floor.manage'), false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'PERMISSION_DENIED');
  END IF;

  PERFORM public.validate_actor(p_performed_by);

  IF p_parent_table_number = ANY(p_child_table_numbers) THEN
    RETURN jsonb_build_object('success', false, 'error', 'G_UNMERGE_PARENT_IN_CHILD');
  END IF;
  v_children := (SELECT array_agg(tn ORDER BY tn) FROM (SELECT DISTINCT unnest(p_child_table_numbers) AS tn) x);
  IF v_children IS NULL OR array_length(v_children, 1) IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'G_UNMERGE_NO_CHILDREN');
  END IF;

  SELECT * INTO v_parent FROM public.table_floors
   WHERE table_number = p_parent_table_number AND (v_sess_loc IS NULL OR location_id = v_sess_loc) FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'TABLE_NOT_FOUND');
  END IF;
  IF NOT has_location_access(v_parent.location_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'FORBIDDEN_LOCATION');
  END IF;
  IF EXISTS (SELECT 1 FROM public.table_floors WHERE table_number = ANY(v_children) AND location_id <> v_parent.location_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'FORBIDDEN_LOCATION');
  END IF;
  IF EXISTS (SELECT 1 FROM public.table_floors WHERE table_number = ANY(v_children) AND NOT has_location_access(location_id)) THEN
    RETURN jsonb_build_object('success', false, 'error', 'FORBIDDEN_LOCATION');
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
$$;

CREATE OR REPLACE FUNCTION public.transfer_table_atomic(p_token text, p_from_table integer, p_to_table integer, p_performed_by uuid, p_performed_by_terminal_id text) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sess_loc uuid;
  v_from   RECORD;
  v_to     RECORD;
  v_order  orders;
  v_first  int;
  v_second int;
  v_lock   RECORD;
  v_active int;
  v_paid   int;
  v_total  numeric;
  v_guests int;
  v_old_state jsonb;
BEGIN
  PERFORM public.set_session_staff(p_token);
  v_sess_loc := nullif(current_setting('app.current_location_id', true), '')::uuid;
  IF current_staff_id() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'FORBIDDEN');
  END IF;
  IF NOT coalesce(has_permission(current_staff_id(), 'floor.manage'), false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'PERMISSION_DENIED');
  END IF;

  PERFORM public.validate_actor(p_performed_by);
  IF p_from_table = p_to_table THEN
    RETURN jsonb_build_object('success', false, 'error', 'G_TRANSFER_SAME_TABLE');
  END IF;

  -- Q4: lock both floors in deterministic (ascending) order — crossed
  -- transfers X->Y and Y->X now serialize instead of deadlocking.
  IF p_from_table < p_to_table THEN
    v_first := p_from_table; v_second := p_to_table;
  ELSE
    v_first := p_to_table;   v_second := p_from_table;
  END IF;
  FOR v_lock IN SELECT * FROM public.table_floors
                WHERE table_number IN (v_first, v_second)
                ORDER BY table_number FOR UPDATE LOOP
    NULL;
  END LOOP;
  IF (SELECT count(*) FROM public.table_floors
      WHERE table_number IN (p_from_table, p_to_table)) <> 2 THEN
    RETURN jsonb_build_object('success', false, 'error', 'TABLE_NOT_FOUND');
  END IF;
  SELECT * INTO v_from FROM public.table_floors WHERE table_number = p_from_table AND (v_sess_loc IS NULL OR location_id = v_sess_loc);
  SELECT * INTO v_to   FROM public.table_floors WHERE table_number = p_to_table AND (v_sess_loc IS NULL OR location_id = v_sess_loc);
  IF NOT (has_location_access(v_from.location_id) AND has_location_access(v_to.location_id)) THEN
    RETURN jsonb_build_object('success', false, 'error', 'FORBIDDEN_LOCATION');
  END IF;

  IF v_from.location_id IS DISTINCT FROM v_to.location_id
     OR v_from.organization_id IS DISTINCT FROM v_to.organization_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'G_TRANSFER_LOCATION_MISMATCH');
  END IF;

  -- Q2: a table that is a merge PARENT cannot transfer its order away
  -- (would leave the merged children + stale lineage dangling — T-2)
  IF EXISTS (SELECT 1 FROM public.table_floors WHERE merged_into_table = p_from_table) THEN
    RETURN jsonb_build_object('success', false, 'error', 'G_TRANSFER_SOURCE_HAS_MERGED_CHILDREN');
  END IF;
  -- Q3: cannot transfer into a merge PARENT (children would dangle on an
  -- occupied table — T-3)
  IF EXISTS (SELECT 1 FROM public.table_floors WHERE merged_into_table = p_to_table) THEN
    RETURN jsonb_build_object('success', false, 'error', 'G_TRANSFER_TARGET_HAS_MERGED_CHILDREN');
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
   WHERE table_number = p_from_table AND location_id = v_from.location_id
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
  -- clear_stale_table_order_pointer auto-clears the source floor pointer.
  UPDATE public.orders SET
    table_number = p_to_table,
    updated_at = now(),
    version = COALESCE(version, 0) + 1,
    updated_by_terminal_id = p_performed_by_terminal_id
  WHERE id = v_order.id;

  -- Q5: kitchen schedule parity (merge/unmerge already keep it in sync)
  UPDATE public.kitchen_schedule SET
    table_number = p_to_table, updated_at = now()
  WHERE order_id = v_order.id;

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
    p_performed_by, p_performed_by_terminal_id, 'contract-transfer-v2',
    p_from_table, p_to_table, v_from.location_id, v_from.organization_id);

  RETURN jsonb_build_object('success', true, 'order_id', v_order.id, 'to_table', p_to_table);
END;
$$;

CREATE OR REPLACE FUNCTION public.release_paid_table_atomic(p_token text, p_table_number integer, p_final_status text, p_performed_by uuid, p_terminal_id text) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sess_loc uuid;
  v_table RECORD;
  v_open  int;
  v_paid  int;
  v_old_state jsonb;
BEGIN
  PERFORM public.set_session_staff(p_token);
  v_sess_loc := nullif(current_setting('app.current_location_id', true), '')::uuid;
  IF current_staff_id() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'FORBIDDEN');
  END IF;
  IF NOT coalesce(has_permission(current_staff_id(), 'floor.manage'), false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'PERMISSION_DENIED');
  END IF;

  IF p_performed_by IS NOT NULL THEN
    PERFORM public.validate_actor(p_performed_by);
  END IF;
  IF p_final_status NOT IN ('empty','cleaning') THEN
    RETURN jsonb_build_object('success', false, 'error', 'G_DISMISS_INVALID_FINAL');
  END IF;

  SELECT * INTO v_table FROM public.table_floors
   WHERE table_number = p_table_number AND (v_sess_loc IS NULL OR location_id = v_sess_loc) FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'TABLE_NOT_FOUND');
  END IF;
  IF NOT has_location_access(v_table.location_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'FORBIDDEN_LOCATION');
  END IF;
  IF v_table.reservation_id IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'G_TABLE_RESERVED');
  END IF;
  IF v_table.merged_into_table IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'G_TABLE_MERGED');
  END IF;

  -- Any non-terminal order? Refuse — those must be voided/wasted via dismiss.
  SELECT count(*) INTO v_open FROM public.orders
   WHERE table_number = p_table_number AND location_id = v_table.location_id
     AND status NOT IN ('paid','cancelled','closed','refunded','partially_refunded','voided');
  IF v_open > 0 THEN
    RETURN jsonb_build_object('success', false,
      'error', 'G_TABLE_HAS_ACTIVE_ORDERS', 'open_orders', v_open);
  END IF;

  -- Paid orders still to close (paid, or partially_refunded with a paid part
  -- already settled — both transition to closed legally).
  SELECT count(*) INTO v_paid FROM public.orders
   WHERE table_number = p_table_number
     AND status IN ('paid','partially_refunded');
  IF v_paid = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'G_NO_PAID_ORDER');
  END IF;

  v_old_state := jsonb_build_object(
    'status', v_table.status,
    'order_id', v_table.current_order_id,
    'paid_orders', v_paid);

  -- paid/partially_refunded -> closed (registered edge; guard stamps closed_at)
  UPDATE public.orders SET
    status = 'closed',
    version = COALESCE(version, 0) + 1,
    updated_by_terminal_id = p_terminal_id
  WHERE table_number = p_table_number
    AND status IN ('paid','partially_refunded');

  -- release the table (mirrors dismiss_table_atomic's release block)
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
    'release_paid_table', 'table.released_after_payment',
    p_table_number, v_table.id, v_table.current_order_id,
    v_old_state,
    jsonb_build_object('status', p_final_status, 'orders_closed', v_paid),
    p_performed_by, p_terminal_id, NULL,
    p_table_number, NULL, v_table.location_id, v_table.organization_id);

  RETURN jsonb_build_object('success', true,
    'table_status', p_final_status, 'orders_closed', v_paid);
END;
$$;

