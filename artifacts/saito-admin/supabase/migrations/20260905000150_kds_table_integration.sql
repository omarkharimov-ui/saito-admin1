-- ============================================================
-- 0.4-E: KDS / Table Kitchen Integration
--   SSOT chain: ITEM STATE → ORDER KITCHEN AGGREGATION →
--               TABLE KITCHEN AGGREGATION → KDS / POS UI
--   E2: order aggregation maps legacy routing states
--       (cooking/hot/bar/sushi → production) + excludes voided.
--   E3: table aggregation derives from ORDER-level kitchen_status
--       (NOT raw items — no second system), wired on orders
--       INSERT/UPDATE/DELETE; broken item-trigger path dropped.
--   E6: kds_tickets VIEW (ticket identity / station / course /
--       modifiers / void & correction linkage / re-fire boundary).
--   E7: additive OUTBOX producers: kds.ticket.upsert +
--       table.kitchen_changed (consumers dedupe by outbox id).
--   E4: correction → compensation already emitted by
--       correct_item_atomic (order_item.kitchen_compensation +
--       voided/added events); kds_tickets exposes correction linkage.
--   E5: reopen rollback is inherent — aggregation recomputes from
--       item states; no stale 'completed' persists.
-- ============================================================

BEGIN;

-- =============================================================
-- E2 — ITEM → ORDER aggregation (canonical + legacy state map)
-- =============================================================
CREATE OR REPLACE FUNCTION public.sync_order_kitchen_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_order_id UUID;
  v_new_status TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT order_id INTO v_order_id FROM order_items WHERE id = OLD.id;
  ELSE
    v_order_id := NEW.order_id;
  END IF;
  IF v_order_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  WITH agg AS (
    SELECT
      count(*) FILTER (WHERE kitchen_status NOT IN ('cancelled','comped','wasted','recalled','voided')) AS active,
      count(*) FILTER (WHERE kitchen_status = 'served') AS served,
      count(*) FILTER (WHERE kitchen_status IN ('preparing','cooking','hot','bar','sushi')) AS production,
      count(*) FILTER (WHERE kitchen_status = 'ready')  AS ready,
      count(*) FILTER (WHERE kitchen_status IN ('pending','sent','reserved','accepted')) AS pre_cook,
      count(*) FILTER (WHERE kitchen_status = 'accepted') AS accepted,
      count(*) FILTER (WHERE kitchen_status = 'sent')     AS sent,
      count(*) FILTER (WHERE kitchen_status = 'pending')  AS pending,
      count(*) FILTER (WHERE kitchen_status = 'reserved') AS reserved,
      count(*) FILTER (WHERE kitchen_status = 'completed') AS completed
    FROM order_items
    WHERE order_id = v_order_id
  )
  SELECT CASE
    WHEN active = 0 THEN 'cancelled'
    WHEN served > 0 THEN 'served'
    WHEN ready > 0 AND (production > 0 OR pre_cook > 0) THEN 'partially_ready'
    WHEN production > 0 THEN 'preparing'
    WHEN ready > 0 THEN 'ready'
    WHEN accepted > 0 THEN 'accepted'
    WHEN sent > 0 THEN 'sent'
    WHEN pending > 0 THEN 'pending'
    WHEN reserved > 0 THEN 'reserved'
    WHEN completed = active THEN 'completed'
    ELSE 'cancelled'
  END
  INTO v_new_status
  FROM agg;

  UPDATE orders
  SET kitchen_status = v_new_status
  WHERE id = v_order_id
    AND status NOT IN ('paid', 'cancelled', 'closed');

  RETURN COALESCE(NEW, OLD);
END;
$function$;

-- =============================================================
-- E3 — ORDER → TABLE propagation (SSOT: from order-level status)
-- =============================================================
CREATE OR REPLACE FUNCTION public.sync_table_kitchen_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_order_id UUID;
  v_table_number INT;
  v_new_status TEXT;
  v_old_status TEXT;
  v_updated boolean;
BEGIN
  -- fire points: orders INSERT/UPDATE/DELETE (after cancel of broken item trigger)
  IF TG_TABLE_NAME = 'orders' THEN
    IF TG_OP = 'DELETE' THEN
      v_order_id := OLD.id;
      v_table_number := OLD.table_number;  -- row is gone; read directly from OLD
    ELSE
      v_order_id := NEW.id;
      v_table_number := NEW.table_number;
    END IF;
  ELSE
    v_order_id := COALESCE(NEW.order_id, OLD.order_id);
    IF v_order_id IS NULL THEN
      RETURN COALESCE(NEW, OLD);
    END IF;
    SELECT table_number INTO v_table_number FROM orders WHERE id = v_order_id;
  END IF;
  IF v_table_number IS NULL OR v_table_number <= 0 THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT kitchen_status INTO v_old_status
  FROM table_floors WHERE table_number = v_table_number;

  WITH oagg AS (
    SELECT
      count(*) AS active_order,
      count(*) FILTER (WHERE kitchen_status = 'served')        AS served,
      count(*) FILTER (WHERE kitchen_status = 'partially_ready') AS partially,
      count(*) FILTER (WHERE kitchen_status IN ('preparing','cooking')) AS prod,
      count(*) FILTER (WHERE kitchen_status = 'ready')         AS ready,
      count(*) FILTER (WHERE kitchen_status = 'accepted')      AS accepted,
      count(*) FILTER (WHERE kitchen_status = 'sent')          AS sent,
      count(*) FILTER (WHERE kitchen_status = 'pending')       AS pending,
      count(*) FILTER (WHERE kitchen_status = 'reserved')      AS reserved,
      count(*) FILTER (WHERE kitchen_status = 'completed')     AS completed
    FROM orders
    WHERE table_number = v_table_number
      AND status NOT IN ('paid','cancelled','closed','refunded','partially_refunded','voided')
  )
  SELECT CASE
    WHEN active_order = 0 THEN 'completed'
    WHEN served > 0 THEN 'served'
    WHEN partially > 0 THEN 'partially_ready'
    WHEN ready > 0 AND (prod > 0 OR accepted+sent+pending > 0) THEN 'partially_ready'
    WHEN prod > 0 THEN 'preparing'
    WHEN ready > 0 THEN 'ready'
    WHEN accepted > 0 THEN 'accepted'
    WHEN sent > 0 THEN 'sent'
    WHEN pending > 0 THEN 'pending'
    WHEN reserved > 0 THEN 'reserved'
    WHEN completed = active_order THEN 'completed'
    ELSE 'pending'
  END
  INTO v_new_status
  FROM oagg;

  v_updated := false;
  IF NEW IS NOT NULL AND TG_TABLE_NAME = 'orders' THEN
    IF TG_OP = 'INSERT' THEN
      v_updated := true;
    ELSE
      SELECT EXISTS (SELECT 1 FROM orders o WHERE o.id = v_order_id)
        AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.id = v_order_id AND o.kitchen_status = NEW.kitchen_status)
        INTO v_updated;
      -- orders UPDATE: refresh whenever any column the aggregation consumes changed
      IF NOT v_updated THEN
        v_updated := true; -- orders row updated → recompute table (cheap, idempotent)
      END IF;
    END IF;
  END IF;

  UPDATE table_floors
  SET kitchen_status = v_new_status,
      last_activity_at = now(),
      updated_at = now()
  WHERE table_number = v_table_number;

  -- E7: addproducer — table level event (consumers dedupe by outbox id)
  IF v_new_status IS DISTINCT FROM v_old_status THEN
    INSERT INTO outbox_events (aggregate_type, aggregate_id, event_type, payload, status)
    VALUES ('table', gen_random_uuid(), 'table.kitchen_changed',
      jsonb_build_object('table_number', v_table_number,
        'kitchen_status', v_new_status,
        'previous_status', v_old_status,
        'location_id', (SELECT location_id FROM orders WHERE id = v_order_id),
        'order_ids', (SELECT COALESCE(jsonb_agg(id), '[]'::jsonb) FROM orders
                      WHERE table_number = v_table_number
                        AND status NOT IN ('paid','cancelled','closed','refunded','partially_refunded','voided'))),
      'pending');
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$function$;

-- Wire table aggregation onto orders only (item path was broken + redundant)
DROP TRIGGER IF EXISTS trg_sync_table_kitchen_status ON orders;
DROP TRIGGER IF EXISTS trg_sync_table_kitchen_status_items ON order_items;
DROP TRIGGER IF EXISTS trg_kds_ticket_emit ON order_items;

CREATE TRIGGER trg_sync_table_kitchen_status
  AFTER INSERT OR UPDATE OR DELETE ON orders
  FOR EACH ROW EXECUTE FUNCTION public.sync_table_kitchen_status();

-- =============================================================
-- E7 — KDS producer: additive outbox emitter on item events
--      (kitchen-changing states; consumers dedupe by outbox id)
-- =============================================================
CREATE OR REPLACE FUNCTION public.emit_kds_ticket_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_prev TEXT;
BEGIN
  v_prev := CASE WHEN TG_OP = 'UPDATE' THEN OLD.kitchen_status ELSE NULL END;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  -- kitchen-relevant transitions only
  IF NEW.kitchen_status IS DISTINCT FROM v_prev OR TG_OP = 'INSERT' THEN
    INSERT INTO outbox_events (aggregate_type, aggregate_id, event_type, payload, status)
    VALUES ('kds_ticket', NEW.id, 'kds.ticket.upsert',
      jsonb_build_object('order_id', NEW.order_id, 'item_id', NEW.id,
        'product_id', NEW.product_id, 'product_name', NEW.product_name,
        'quantity', NEW.quantity, 'course', NEW.course, 'seat_number', NEW.seat_number,
        'station_id', NEW.station_id, 'item_status', NEW.kitchen_status,
        'previous_status', v_prev, 'updated_at', now(),
        'is_terminal', NEW.kitchen_status IN ('voided','cancelled','comped','wasted','recalled')),
      'pending');
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_kds_ticket_emit
  AFTER INSERT OR UPDATE OF kitchen_status ON order_items
  FOR EACH ROW EXECUTE FUNCTION public.emit_kds_ticket_event();

-- =============================================================
-- E6 — KDS Ticket VIEW (read model for KDS/POS UI)
--      ORDER → ITEM → TABLE chain, correction lineage visible
-- =============================================================
DROP VIEW IF EXISTS public.kds_tickets;
CREATE VIEW public.kds_tickets AS
SELECT
  o.id            AS order_id,
  o.order_number,
  o.table_number,
  t.table_name,
  o.status        AS order_status,
  o.kitchen_status AS order_kitchen_status,
  t.kitchen_status AS table_kitchen_status,
  t.status        AS table_status,
  oi.id           AS item_id,
  oi.product_id,
  oi.product_name,
  oi.quantity,
  oi.unit_price,
  oi.total_price,
  oi.modifiers,
  oi.course,
  oi.seat_number,
  oi.special_notes,
  oi.kitchen_status AS item_status,
  oi.station_id,
  s.name          AS station_name,
  oi.created_at,
  oi.updated_at,
  oi.correlation_id AS correction_link,
  EXISTS (SELECT 1 FROM item_corrections ic WHERE ic.original_item_id = oi.id) AS is_replaced,
  EXISTS (SELECT 1 FROM item_corrections ic WHERE ic.replacement_item_id = oi.id) AS is_replacement
FROM order_items oi
JOIN orders o ON o.id = oi.order_id
LEFT JOIN table_floors t ON t.table_number = o.table_number
LEFT JOIN stations s ON s.id = oi.station_id
WHERE o.status NOT IN ('draft','new','cancelled','closed','refunded')
  AND oi.kitchen_status NOT IN ('voided','cancelled','comped','wasted','recalled');

COMMENT ON VIEW public.kds_tickets IS
  '0.4-E read model: live KDS ticket stream (item↔order↔table). Replaces hand-computed UI aggregation.';

COMMIT;