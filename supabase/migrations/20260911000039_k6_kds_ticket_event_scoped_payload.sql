-- ============================================================================
-- 20260911000039 — K / G6: kds_ticket outbox event contract — location/station
--                  scoped payload (single KDS event spine)
--
-- USER-FROZEN CONTRACT (K gate G6, confirmed): "KDS realtime canonical =
--   kds_ticket outbox spine. DB state = SSOT; delivery = mutation -> outbox/event
--   -> location/station-scoped KDS event -> client. Replace raw
--   postgres_changes(orders/order_items)+client-side-filter as the production
--   contract. Events must be location-scoped, station-scoped, duplicate-safe,
--   replay/resync-able, and recoverable from DB if an event is lost. Do NOT rely
--   on client-side filtering as a security boundary."
--
-- EVIDENCE (K-0 + G6 before-proof, real DB):
--   - The KDS outbox spine ALREADY EXISTS and is live: trigger `trg_kds_ticket_emit`
--     = AFTER INSERT OR UPDATE OF kitchen_status ON order_items ->
--     emit_kds_ticket_event() -> outbox_events(aggregate_type='kds_ticket',
--     event_type='kds.ticket.upsert'). (130 rows, actively populated.)
--   - BUT the event payload carried NO location_id / organization_id / station /
--     table_number / order_source -> a consumer could not scope the event to the
--     operator's location/station at the delivery layer. Scoping was left to
--     client-side filtering (the exact thing the contract forbids).
--   - The KDS UI's wake path is raw postgres_changes(orders/order_items) table
--     CDC (no location filter in the subscription); its state resync is already
--     location-scoped via /api/kitchen/orders (server-trusted active location).
--   - After G1, order_items/orders authenticated SELECT RLS is location-scoped
--     (has_location_access) and anon has NO policy -> the raw CDC push is
--     RLS-scoped for authenticated, NOT a cross-location leak. G6 does NOT change
--     that data/RLS contract; it establishes the canonical SCOPED EVENT + a
--     scoped/resyncable delivery endpoint (below), and keeps raw CDC only as a
--     secondary, non-security wake.
--
-- FIX (this migration — event CONTRACT only, no data/RLS/O-contract change):
--   (1) emit_kds_ticket_event() payload gains location_id, organization_id,
--       station, table_number, order_source, order_status (one join to orders).
--       Gating (INSERT or kitchen_status change) is preserved verbatim; the
--       trigger definition is unchanged (CREATE OR REPLACE keeps it).
--   (2) Partial index on outbox_events(created_at,id) WHERE aggregate_type=
--       'kds_ticket' to support the scoped cursor read (since by created_at+id).
--   (3) fail-safe: fn present, prosrc references location_id + station, trigger
--       still attached to order_items.
--
-- Delivery endpoint (/api/kitchen/realtime) + KDS client wiring are in the K
-- source tree (next step). DB remains SSOT; the outbox is the delivery spine.
--
-- GOLDEN RULE 5: auto-commit.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.emit_kds_ticket_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prev    TEXT;
  v_loc     uuid;
  v_org     uuid;
  v_tn      integer;
  v_src     text;
  v_ostatus text;
BEGIN
  v_prev := CASE WHEN TG_OP = 'UPDATE' THEN OLD.kitchen_status ELSE NULL END;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  -- kitchen-relevant transitions only (unchanged gating)
  IF NEW.kitchen_status IS DISTINCT FROM v_prev OR TG_OP = 'INSERT' THEN
    -- resolve the owning order's scope ONCE (location/station scoping at the
    -- event layer; a consumer must not be left to filter client-side)
    SELECT o.location_id, o.organization_id, o.table_number, o.order_source, o.status
      INTO v_loc, v_org, v_tn, v_src, v_ostatus
      FROM orders o
     WHERE o.id = NEW.order_id;

    INSERT INTO outbox_events (aggregate_type, aggregate_id, event_type, payload, status)
    VALUES ('kds_ticket', NEW.id, 'kds.ticket.upsert',
      jsonb_build_object('order_id', NEW.order_id, 'item_id', NEW.id,
        'product_id', NEW.product_id, 'product_name', NEW.product_name,
        'quantity', NEW.quantity, 'course', NEW.course, 'seat_number', NEW.seat_number,
        'station_id', NEW.station_id, 'station', NEW.station,
        'item_status', NEW.kitchen_status, 'previous_status', v_prev,
        'is_terminal', NEW.kitchen_status IN ('voided','cancelled','comped','wasted','recalled'),
        'location_id', v_loc, 'organization_id', v_org,
        'table_number', v_tn, 'order_source', v_src, 'order_status', v_ostatus,
        'updated_at', now()),
      'pending');
  END IF;
  RETURN NEW;
END;
$$;

-- ---- cursor index for the scoped kds_ticket read (delivery endpoint) ----
DROP INDEX IF EXISTS public.idx_outbox_kds_ticket_cursor;
CREATE INDEX idx_outbox_kds_ticket_cursor
  ON public.outbox_events (created_at, id)
  WHERE aggregate_type = 'kds_ticket';

-- ---- fail-safe ----
DO $$
BEGIN
  IF NOT (SELECT exists(
        SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname='public' AND p.proname='emit_kds_ticket_event'
          AND p.prosrc ILIKE '%location_id%' AND p.prosrc ILIKE '%station%')) THEN
    RAISE EXCEPTION 'K-G6 FAIL-SAFE: emit_kds_ticket_event not enriched with location_id/station';
  END IF;
  IF (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
      WHERE c.relname='order_items' AND t.tgname='trg_kds_ticket_emit'
        AND (SELECT p.proname FROM pg_proc p WHERE p.oid=t.tgfoid)='emit_kds_ticket_event') <> 1 THEN
    RAISE EXCEPTION 'K-G6 FAIL-SAFE: trg_kds_ticket_emit not attached to order_items -> emit_kds_ticket_event';
  END IF;
END;
$$;
