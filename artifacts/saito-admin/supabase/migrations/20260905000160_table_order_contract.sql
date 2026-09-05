-- ============================================================
-- 0.4-F: Table ↔ Order Contract
--   F1  SSOT: orders.table_number is CANONICAL; table_floors.
--       current_order_id = derived primary-pointer, kept valid.
--   F2  Open Table: hardened walkin_atomic (NOT NULL fix +
--       duplicate-open prevention + canonical assignment + events).
--   F3  Release guard: empty/cleaning forbidden while open orders
--       or a live order-pointer exist.
--   F7  Reservation cohabitation preserved (status guards remain).
--   F9  Outbox producers: table.status_changed / table.order_changed
--       (+ table.order_opened from walkin). transfer/merge/dismiss
--       action-events land with 0.4-G flows.
--   F4/F5/F6 (transfer/merge/dismiss hardening) → 0.4-G.
--
--   PART A = REPAIR of live prod pointers (runs BEFORE guards).
--   PART B = guards + producers + hardened walkin.
-- ============================================================

BEGIN;

-- =============================================================
-- PART A — normalize existing table↔order pointers (idempotent)
-- =============================================================
-- A1: clear pointers whose order is missing or already final
UPDATE table_floors tf
SET current_order_id = NULL, updated_at = now()
WHERE tf.current_order_id IS NOT NULL
  AND ( NOT EXISTS (SELECT 1 FROM orders o WHERE o.id = tf.current_order_id)
        OR EXISTS (SELECT 1 FROM orders o
                   WHERE o.id = tf.current_order_id
                     AND o.status IN ('paid','cancelled','closed','refunded',
                                      'partially_refunded','voided')) );

-- A2: clear pointers whose order lives on a different table
--     (canonical side = orders.table_number)
UPDATE table_floors tf
SET current_order_id = NULL, updated_at = now()
WHERE tf.current_order_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM orders o
              WHERE o.id = tf.current_order_id
                AND o.table_number IS DISTINCT FROM tf.table_number);

-- A3: duplicate pointers resolved by A1/A2; fill missing pointer on
--     tables that have EXACTLY ONE open order (canonical primary)
UPDATE table_floors tf
SET current_order_id = sub.oid, updated_at = now()
FROM (
  SELECT table_number, (array_agg(id ORDER BY created_at, id))[1] AS oid, count(*) AS n
  FROM orders
  WHERE status NOT IN ('paid','cancelled','closed','refunded','partially_refunded','voided')
  GROUP BY table_number
  HAVING count(*) = 1
) sub
WHERE tf.table_number = sub.table_number
  AND tf.current_order_id IS NULL;

-- A4: release-state tables must not hold open orders → elevate to
--     occupied (contract: open order ⇒ table in use)
UPDATE table_floors tf
SET status = 'occupied', updated_at = now()
WHERE tf.status IN ('empty','cleaning')
  AND EXISTS (SELECT 1 FROM orders o
              WHERE o.table_number = tf.table_number
                AND o.status NOT IN ('paid','cancelled','closed','refunded',
                                     'partially_refunded','voided'));

-- =============================================================
-- PART B — F1 guards + F3 release guard + F9 producers
-- =============================================================
CREATE OR REPLACE FUNCTION public.validate_table_order_pointer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_status text;
  v_table_number int;
  v_location_id uuid;
BEGIN
  IF NEW.current_order_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT status, table_number, location_id
    INTO v_status, v_table_number, v_location_id
  FROM orders WHERE id = NEW.current_order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TABLE_ORDER_POINTER_INVALID: order % does not exist (table %)',
      NEW.current_order_id, NEW.table_number;
  END IF;
  IF v_status IN ('paid','cancelled','closed','refunded','partially_refunded','voided') THEN
    RAISE EXCEPTION 'TABLE_ORDER_POINTER_FINAL: order % is % (table %)',
      NEW.current_order_id, v_status, NEW.table_number;
  END IF;
  IF v_table_number IS DISTINCT FROM NEW.table_number THEN
    RAISE EXCEPTION 'TABLE_ORDER_POINTER_MISMATCH: order % lives at table %, not %',
      NEW.current_order_id, v_table_number, NEW.table_number;
  END IF;
  IF v_location_id IS DISTINCT FROM NEW.location_id THEN
    RAISE EXCEPTION 'TABLE_ORDER_POINTER_LOCATION_MISMATCH: order % is at location %, not %',
      NEW.current_order_id, v_location_id, NEW.location_id;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.clear_stale_table_order_pointer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- order moved tables (or unbound) → any pointer on ANOTHER table is stale
  IF OLD.id IS NOT NULL THEN
    UPDATE table_floors
    SET current_order_id = NULL
    WHERE current_order_id = OLD.id
      AND table_number IS DISTINCT FROM NEW.table_number;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.table_release_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status IN ('empty','cleaning') THEN
    IF NEW.current_order_id IS NOT NULL THEN
      RAISE EXCEPTION 'TABLE_ORDER_POINTER_ACTIVE: table % cannot be % while it still points order %',
        NEW.table_number, NEW.status, NEW.current_order_id;
    END IF;
    IF EXISTS (SELECT 1 FROM orders o
               WHERE o.table_number = NEW.table_number
                 AND o.status NOT IN ('paid','cancelled','closed','refunded',
                                      'partially_refunded','voided')) THEN
      RAISE EXCEPTION 'TABLE_OPEN_ORDERS: table % cannot be % while open orders exist; close/dismiss them first',
        NEW.table_number, NEW.status;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.emit_table_status_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO outbox_events (aggregate_type, aggregate_id, event_type, payload, status)
    VALUES ('table', NEW.id, 'table.status_changed',
      jsonb_build_object('table_number', NEW.table_number,
        'status', NEW.status,
        'previous_status', OLD.status,
        'location_id', NEW.location_id,
        'organization_id', NEW.organization_id),
      'pending');
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.emit_table_order_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.current_order_id IS DISTINCT FROM OLD.current_order_id THEN
    INSERT INTO outbox_events (aggregate_type, aggregate_id, event_type, payload, status)
    VALUES ('table', NEW.id, 'table.order_changed',
      jsonb_build_object('table_number', NEW.table_number,
        'order_id', NEW.current_order_id,
        'previous_order_id', OLD.current_order_id,
        'assigned', NEW.current_order_id IS NOT NULL,
        'location_id', NEW.location_id),
      'pending');
  END IF;
  RETURN NEW;
END;
$function$;

-- wire F1 / F3 / F9
DROP TRIGGER IF EXISTS trg_validate_table_order_pointer ON table_floors;
DROP TRIGGER IF EXISTS trg_table_release_guard ON table_floors;
DROP TRIGGER IF EXISTS trg_emit_table_status_event ON table_floors;
DROP TRIGGER IF EXISTS trg_emit_table_order_event ON table_floors;
DROP TRIGGER IF EXISTS trg_clear_stale_table_order_pointer ON orders;

CREATE TRIGGER trg_validate_table_order_pointer
  BEFORE UPDATE OF current_order_id ON table_floors
  FOR EACH ROW EXECUTE FUNCTION public.validate_table_order_pointer();

CREATE TRIGGER trg_table_release_guard
  BEFORE UPDATE OF status ON table_floors
  FOR EACH ROW EXECUTE FUNCTION public.table_release_guard();

CREATE TRIGGER trg_emit_table_status_event
  AFTER UPDATE OF status ON table_floors
  FOR EACH ROW EXECUTE FUNCTION public.emit_table_status_event();

CREATE TRIGGER trg_emit_table_order_event
  AFTER UPDATE OF current_order_id ON table_floors
  FOR EACH ROW EXECUTE FUNCTION public.emit_table_order_event();

CREATE TRIGGER trg_clear_stale_table_order_pointer
  AFTER UPDATE OF table_number ON orders
  FOR EACH ROW EXECUTE FUNCTION public.clear_stale_table_order_pointer();

-- =============================================================
-- F2 — hardened walkin_atomic (Open Table)
--   * derives location/organization from the table (NOT NULL fix)
--   * duplicate-open prevention (independent of status)
--   * canonical pointer assignment + status occupied
--   * emits table.order_opened via outbox
-- =============================================================
CREATE OR REPLACE FUNCTION public.walkin_atomic(
  p_table_number integer,
  p_guests integer DEFAULT 1,
  p_name text DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_order_type text DEFAULT 'dine_in',
  p_notes text DEFAULT NULL,
  p_user_id uuid DEFAULT NULL,
  p_pre_order boolean DEFAULT false,
  p_scheduled_date text DEFAULT NULL,
  p_scheduled_time text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_table RECORD;
  v_reservation_id UUID;
  v_order_id UUID;
  v_result jsonb;
BEGIN
  SELECT * INTO v_table FROM public.table_floors WHERE table_number = p_table_number FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'TABLE_NOT_FOUND');
  END IF;
  IF v_table.status NOT IN ('empty', 'dirty') THEN
    RETURN jsonb_build_object('success', false, 'error', 'TABLE_NOT_EMPTY');
  END IF;
  IF EXISTS (SELECT 1 FROM public.orders o
             WHERE o.table_number = p_table_number
               AND o.status NOT IN ('paid','cancelled','closed','refunded',
                                    'partially_refunded','voided')) THEN
    RETURN jsonb_build_object('success', false, 'error', 'TABLE_ALREADY_HAS_OPEN_ORDER');
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
    reservation_id = v_reservation_id,
    reservation_name = p_name,
    reservation_phone = p_phone,
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

-- =============================================================
-- F1 visibility view
-- =============================================================
DROP VIEW IF EXISTS public.table_order_contract;
CREATE VIEW public.table_order_contract AS
SELECT
  tf.table_number,
  tf.status                    AS table_status,
  tf.kitchen_status            AS table_kitchen_status,
  tf.current_order_id,
  o.status                     AS current_order_status,
  o.kitchen_status             AS current_order_kitchen_status,
  o.total_amount               AS current_order_total,
  (SELECT count(*)
     FROM orders x
    WHERE x.table_number = tf.table_number
      AND x.status NOT IN ('paid','cancelled','closed','refunded','partially_refunded','voided')) AS open_orders,
  tf.location_id,
  tf.organization_id
FROM table_floors tf
LEFT JOIN orders o ON o.id = tf.current_order_id;

-- =============================================================
-- F7 — hardened activate_table_atomic (location/org fix +
--      order_opened event) for the reserved -> occupied path
-- =============================================================
CREATE OR REPLACE FUNCTION public.activate_table_atomic(p_table_id uuid, p_guest_count integer DEFAULT NULL::integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_table RECORD;
  v_reservation RECORD;
  v_order_id UUID;
  v_total NUMERIC;
BEGIN
  SELECT * INTO v_table FROM public.table_floors WHERE id = p_table_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'TABLE_NOT_FOUND');
  END IF;

  IF v_table.status != 'reserved' THEN
    RETURN jsonb_build_object('success', false, 'error', 'TABLE_NOT_RESERVED');
  END IF;

  SELECT * INTO v_reservation FROM public.reservations
    WHERE id = v_table.reservation_id AND status = 'confirmed'
    FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'RESERVATION_NOT_FOUND');
  END IF;

  SELECT COALESCE(SUM(rpi.unit_price * rpi.quantity), 0) INTO v_total
  FROM public.reservation_preorder_items rpi
  WHERE rpi.reservation_id = v_reservation.id;

  INSERT INTO public.orders (
    table_number, status, guest_count, reservation_id, customer_id, customer_name,
    customer_phone, kitchen_status, is_draft, total_amount, location_id, organization_id,
    created_at, updated_at, version
  ) VALUES (
    v_table.table_number, 'confirmed', COALESCE(p_guest_count, v_reservation.guests),
    v_reservation.id, v_reservation.customer_id, v_reservation.name, v_reservation.phone,
    'pending', false, v_total, v_table.location_id, v_table.organization_id,
    NOW(), NOW(), 1
  ) RETURNING id INTO v_order_id;

  INSERT INTO public.order_items (
    order_id, product_id, product_name, quantity, unit_price, total_price,
    kitchen_status, price_snapshot, created_at
  )
  SELECT
    v_order_id, rpi.product_id, rpi.product_name, rpi.quantity, rpi.unit_price,
    rpi.unit_price * rpi.quantity, 'pending',
    jsonb_build_object(
      'unit_price', rpi.unit_price, 'quantity', rpi.quantity,
      'total_price', rpi.unit_price * rpi.quantity, 'snapshot_at', NOW()
    ), NOW()
  FROM public.reservation_preorder_items rpi
  WHERE rpi.reservation_id = v_reservation.id;

  UPDATE public.table_floors SET
    status = 'occupied',
    current_order_id = v_order_id,
    reservation_id = NULL,
    reservation_name = NULL,
    reservation_phone = NULL,
    reservation_time = NULL,
    updated_at = NOW()
  WHERE id = p_table_id;

  INSERT INTO public.operation_logs (
    operation, order_id, source_table_number, old_state, new_state, performed_by
  ) VALUES (
    'activate_table', v_order_id, v_table.table_number,
    jsonb_build_object('status', v_table.status, 'reservation_id', v_table.reservation_id),
    jsonb_build_object('status', 'occupied', 'order_id', v_order_id),
    NULL
  );

  INSERT INTO outbox_events (aggregate_type, aggregate_id, event_type, payload, status)
  VALUES ('table', v_table.id, 'table.order_opened',
    jsonb_build_object('table_number', v_table.table_number,
      'order_id', v_order_id,
      'reservation_id', v_reservation.id,
      'location_id', v_table.location_id),
    'pending');

  RETURN jsonb_build_object('success', true, 'order_id', v_order_id, 'table_number', v_table.table_number);
END;
$function$;

COMMIT;