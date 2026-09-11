-- ============================================================================
-- 20260911000031 — O / G4: order creation/append — session active-location scope
--                  (closes the F-03 deferred boundary for orders)
--
-- USER-FROZEN CONTRACT (O gate G4, confirmed):
--   "Bütün order create/append yolları session active_location-a scope olunur.
--    Client location_id və ya table_number ilə başqa location-a yönləndirə
--    bilməz. table_number yalnız həmin active location daxilində resolve olunur."
--
-- EVIDENCE (real DB + source, 2026-09-11):
--   * LIVE create/append surface:
--       (a) /api/orders POST (dine-in create + append + addItems) — service-role
--           REST resolved table_floors?table_number=X with NO location filter
--           (fixed in route.ts in the same commit);
--       (b) walkin_atomic (reservations/walk-in route) — global table_number
--           FOR UPDATE lookup (fixed here);
--       (c) create_takeaway_order / create_delivery_order — ALREADY
--           resolveLocationContext (D-5 frozen) — unchanged.
--   * DEAD create fns (0 source callers, 0 DB callers, 0 trigger/view refs):
--       create_or_append_order, create_order_with_items — not location-scoped.
--       DROPPED so no unguarded create entry point remains (F-01 precedent:
--       "Old signatures are DROPPED so no unguarded overload remains").
--   * walkin_atomic keeps p_user_id (audit-only; identity stays caller-supplied
--     for reservation logging) and ADDS p_location_id uuid DEFAULT NULL —
--     the route passes the server-resolved active location (never client).
--
-- GOLDEN RULE 5: auto-commit.
-- ============================================================================

-- ---- 1. DROP dead, unscoped order-create entry points ----
DROP FUNCTION IF EXISTS public.create_or_append_order(integer, jsonb, text, integer, text, text, uuid);
DROP FUNCTION IF EXISTS public.create_order_with_items(integer, jsonb, numeric, text, integer, text, text);

-- ---- 2. walkin_atomic: + p_location_id (server-resolved) + location-scoped lookup ----
-- Drop the OLD 10-arg overload (p_scheduled_date was text). If both remained, a
-- route call that omits p_location_id would still match the unscoped 10-arg fn.
DROP FUNCTION IF EXISTS public.walkin_atomic(integer, integer, text, text, text, text, uuid, boolean, text, text);
DROP FUNCTION IF EXISTS public.walkin_atomic(integer, integer, text, text, text, text, uuid, boolean, date, text);
-- Also drop the 11-arg `date` variant left by an earlier partial apply run.
DROP FUNCTION IF EXISTS public.walkin_atomic(integer, integer, text, text, text, text, uuid, boolean, date, text, uuid);
CREATE OR REPLACE FUNCTION public.walkin_atomic(p_table_number integer, p_guests integer, p_name text, p_phone text, p_order_type text, p_notes text, p_user_id uuid, p_pre_order boolean, p_scheduled_date text, p_scheduled_time text, p_location_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_table RECORD;
  v_reservation_id uuid;
  v_order_id uuid;
  v_result jsonb;
  v_sched_date date;
  v_sched_time time;
  v_hold boolean;
BEGIN
  -- G4: table_number resolves WITHIN the caller's active location only
  -- (p_location_id is server-resolved from the session — never client).
  SELECT * INTO v_table FROM public.table_floors
    WHERE table_number = p_table_number
      AND (p_location_id IS NULL OR location_id = p_location_id)
    FOR UPDATE;
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
      AND o.location_id = v_table.location_id
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
$$;

-- walkin_atomic: service_role-only entry point (server canonical path)
REVOKE EXECUTE ON FUNCTION public.walkin_atomic(integer, integer, text, text, text, text, uuid, boolean, text, text, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.walkin_atomic(integer, integer, text, text, text, text, uuid, boolean, text, text, uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.walkin_atomic(integer, integer, text, text, text, text, uuid, boolean, text, text, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.walkin_atomic(integer, integer, text, text, text, text, uuid, boolean, text, text, uuid) TO service_role;

-- ---- fail-safe ----
DO $$
BEGIN
  IF (SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace
      AND proname IN ('create_or_append_order','create_order_with_items')) <> 0 THEN
    RAISE EXCEPTION 'G4 FAIL-SAFE: dead unscoped create functions still present';
  END IF;
  IF NOT has_function_privilege('service_role','public.walkin_atomic(integer, integer, text, text, text, text, uuid, boolean, text, text, uuid)','EXECUTE')
     OR has_function_privilege('anon','public.walkin_atomic(integer, integer, text, text, text, text, uuid, boolean, text, text, uuid)','EXECUTE')
  THEN
    RAISE EXCEPTION 'G4 FAIL-SAFE: walkin_atomic ACL not service-role-only';
  END IF;
END;
$$;
