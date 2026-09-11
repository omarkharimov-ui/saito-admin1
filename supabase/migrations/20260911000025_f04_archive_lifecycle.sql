-- ============================================================================
-- 20260911000025 — F-04 (frozen): table archive lifecycle (ACTIVE → ARCHIVED)
--
-- USER-FROZEN: tables are NOT hard-deleted (they are referents of operational
-- history — the 68 orphan orders came from exactly this: the floor-plan editor
-- `pos/floors` POST did DELETE + re-INSERT). Archived table: cannot take new
-- order/reservation; history + references preserved; identity immutable (no
-- number reuse in the same location while the archived row exists — the
-- UNIQUE(location_id, table_number) enforces this); DELETE is DB-blocked.
--
-- Design (minimal, zero fn-body changes): 2 triggers + 1 archive RPC.
--   * BEFORE DELETE  on table_floors → block (TABLE_ARCHIVE_ONLY); a superadmin
--     force-delete GUC + floor.manage is the audited maintenance escape.
--   * BEFORE UPDATE  on table_floors → an ARCHIVED row is immutable w.r.t. its
--     USE fields (status / reservation_id / current_order_id / merged_into_table).
--     Every table op (reserve/activate/merge/transfer/clear/dismiss) updates one
--     of these → uniformly rejected with TABLE_ARCHIVED.
--   * BEFORE INSERT  on orders → cannot create an order for an archived table.
-- ============================================================================

-- 1) archive columns
ALTER TABLE public.table_floors ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false;
ALTER TABLE public.table_floors ADD COLUMN IF NOT EXISTS archived_at timestamptz;

-- 2) BEFORE DELETE: hard delete is NOT allowed (archive is the only path).
-- F-04 (frozen): tables are never hard-deleted (referents of operational
-- history). Any DELETE — app, raw SQL, or service-role REST — is blocked.
-- (No force-delete escape: the contract is "delete blocked in DB", unambiguous.)
CREATE OR REPLACE FUNCTION public.table_archive_guard() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_num int;
BEGIN
  v_num := OLD.table_number;
  RAISE EXCEPTION 'TABLE_ARCHIVE_ONLY: table % cannot be deleted; archive it instead (F-04)', v_num;
END;
$$;
DROP TRIGGER IF EXISTS trg_table_archive_guard ON public.table_floors;
CREATE TRIGGER trg_table_archive_guard
  BEFORE DELETE ON public.table_floors
  FOR EACH ROW EXECUTE FUNCTION public.table_archive_guard();

-- 3) BEFORE UPDATE: archived table = immutable w.r.t. use fields
CREATE OR REPLACE FUNCTION public.table_archived_immutable() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Block USE of an archived table (status/reservation/order-pointer/merge).
  -- The archive flag itself may flip (archive <-> unarchive, the floor editor's
  -- "re-add to plan" path); only using an archived table is forbidden.
  IF OLD.is_archived AND NOT (NEW.is_archived IS DISTINCT FROM OLD.is_archived) AND (
       NEW.status IS DISTINCT FROM OLD.status
    OR NEW.reservation_id IS DISTINCT FROM OLD.reservation_id
    OR NEW.current_order_id IS DISTINCT FROM OLD.current_order_id
    OR NEW.merged_into_table IS DISTINCT FROM OLD.merged_into_table
  ) THEN
    RAISE EXCEPTION 'TABLE_ARCHIVED: table % is archived and cannot be used (F-04)', OLD.table_number;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_table_archived_immutable ON public.table_floors;
CREATE TRIGGER trg_table_archived_immutable
  BEFORE UPDATE ON public.table_floors
  FOR EACH ROW EXECUTE FUNCTION public.table_archived_immutable();

-- 4) BEFORE INSERT on orders: no NEW orders on archived tables
CREATE OR REPLACE FUNCTION public.order_table_archive_guard() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_arch boolean;
BEGIN
  IF NEW.table_number IS NOT NULL THEN
    SELECT is_archived INTO v_arch FROM public.table_floors
     WHERE table_number = NEW.table_number AND location_id = NEW.location_id;
    IF v_arch THEN
      RAISE EXCEPTION 'TABLE_ARCHIVED: cannot create an order for archived table %', NEW.table_number;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_order_table_archive_guard ON public.orders;
CREATE TRIGGER trg_order_table_archive_guard
  BEFORE INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.order_table_archive_guard();

-- 5) canonical archive RPC (manager F-01, location-scoped F-02/F-03)
CREATE OR REPLACE FUNCTION public.archive_table_atomic(
  p_token text,
  p_table_number integer
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sess_loc uuid;
  v_table table_floors;
BEGIN
  PERFORM public.set_session_staff(p_token);
  IF current_staff_id() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'FORBIDDEN');
  END IF;
  IF NOT coalesce(has_permission(current_staff_id(), 'floor.manage'), false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'PERMISSION_DENIED');
  END IF;
  v_sess_loc := nullif(current_setting('app.current_location_id', true), '')::uuid;

  SELECT * INTO v_table FROM public.table_floors
   WHERE table_number = p_table_number
     AND (v_sess_loc IS NULL OR location_id = v_sess_loc) FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'TABLE_NOT_FOUND');
  END IF;
  IF NOT has_location_access(v_table.location_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'FORBIDDEN_LOCATION');
  END IF;
  IF v_table.status NOT IN ('empty','cleaning') OR v_table.current_order_id IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'TABLE_NOT_EMPTY');
  END IF;

  UPDATE public.table_floors
   SET is_archived = true, archived_at = now(), status = 'empty'
   WHERE id = v_table.id;

  PERFORM public.log_audit(
    'table_archived', 'table_floors', v_table.table_number::text, current_staff_id(), NULL,
    jsonb_build_object('table_number', v_table.table_number, 'location_id', v_table.location_id),
    NULL, NULL, NULL
  );

  RETURN jsonb_build_object('success', true, 'table_number', v_table.table_number, 'archived_at', now());
END;
$$;
GRANT EXECUTE ON FUNCTION public.archive_table_atomic(text, integer) TO service_role;
