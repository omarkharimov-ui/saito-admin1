-- ============================================================================
-- 20260911000040 — K / G6: kds_ticket_poll — scoped, replayable, dup-safe KDS
--                  delivery read (outbox spine)
--
-- G6 decision (confirmed): the kds_ticket outbox event is the canonical
--   location/station-scoped, replayable KDS event; DB = SSOT; delivery =
--   mutation -> outbox -> location/station-scoped event -> KDS client; on
--   reconnect/gap the client RESYNCS from DB. Do NOT rely on client-side
--   filtering as a security boundary.
--
-- WHY an RPC (not REST jsonb filter): this PostgREST build treats
--   payload.location_id as an embedding (PGRST108) — jsonb key filters on the
--   outbox are not expressible via the REST layer. So the scoped read is a
--   SECURITY DEFINER function (service_role-only, same pattern as G5's
--   get_kitchen_queue) that the server route calls. Location/org/station scope
--   is applied SERVER-SIDE here — the client never filters location itself.
--
-- CURSOR SEMANTICS (composite created_at + id, strictly-after):
--   (created_at > since) OR (created_at = since AND id > since_id).
--   - since_created_at IS NULL -> first load: returns NOTHING (client does a
--     full DB resync first; then anchors the cursor to the server's returned
--     `anchor` = now()).
--   - `anchor` (now()) is returned so the first-load client can anchor.
--   - `oldest` is the oldest available location-scoped kds_ticket event; if the
--     cursor falls BEHIND oldest (oldest.created_at < since_created_at), the
--     server signals resync_required=true (gap -> full rebuild).
--
-- GOLDEN RULE 5: auto-commit.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.kds_ticket_poll(
  p_location_id uuid,
  p_organization_id uuid,
  p_station text,
  p_since_created_at timestamptz,
  p_since_id uuid,
  p_limit integer
)
RETURNS TABLE(
  id uuid,
  created_at timestamptz,
  payload jsonb,
  anchor timestamptz,
  oldest timestamptz,
  resync_required boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  anchor := now();

  SELECT min(o.created_at) INTO oldest
    FROM outbox_events o
   WHERE o.aggregate_type = 'kds_ticket'
     AND o.event_type = 'kds.ticket.upsert'
     AND o.payload->>'location_id' = p_location_id::text
     AND (p_organization_id IS NULL OR o.payload->>'organization_id' = p_organization_id::text)
     AND (p_station IS NULL OR o.payload->>'station' = p_station);

  -- first load (no cursor): return ONE DB-anchored row so the client anchors to
  -- the DATABASE clock (now() is guaranteed >= every event created before it,
  -- avoiding a Node/DB clock-skew gap). resync_required=true -> full DB rebuild.
  IF p_since_created_at IS NULL THEN
    RETURN QUERY
      SELECT o.id, o.created_at, o.payload, anchor, oldest, true
        FROM outbox_events o
       WHERE o.aggregate_type = 'kds_ticket'
         AND o.event_type = 'kds.ticket.upsert'
         AND o.payload->>'location_id' = p_location_id::text
         AND (p_organization_id IS NULL OR o.payload->>'organization_id' = p_organization_id::text)
         AND (p_station IS NULL OR o.payload->>'station' = p_station)
       ORDER BY o.created_at DESC, o.id DESC
       LIMIT 1;
    RETURN;
  END IF;

  -- gap = cursor is older than the oldest available event (events pruned)
  resync_required := COALESCE(oldest IS NOT NULL AND p_since_created_at < oldest, false);

  IF NOT resync_required THEN
    RETURN QUERY
      SELECT o.id, o.created_at, o.payload, anchor, oldest, false
        FROM outbox_events o
       WHERE o.aggregate_type = 'kds_ticket'
         AND o.event_type = 'kds.ticket.upsert'
         AND o.payload->>'location_id' = p_location_id::text
         AND (p_organization_id IS NULL OR o.payload->>'organization_id' = p_organization_id::text)
         AND (p_station IS NULL OR o.payload->>'station' = p_station)
         AND (o.created_at > p_since_created_at
              OR (o.created_at = p_since_created_at AND o.id > p_since_id))
       ORDER BY o.created_at ASC, o.id ASC
       LIMIT GREATEST(1, COALESCE(p_limit, 200));
  END IF;
END;
$$;

-- ---- ACL: service_role only (the server route is the sole caller) ----
REVOKE EXECUTE ON FUNCTION public.kds_ticket_poll(uuid,uuid,text,timestamptz,uuid,integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.kds_ticket_poll(uuid,uuid,text,timestamptz,uuid,integer) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.kds_ticket_poll(uuid,uuid,text,timestamptz,uuid,integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.kds_ticket_poll(uuid,uuid,text,timestamptz,uuid,integer) TO service_role;

-- ---- fail-safe ----
DO $$
BEGIN
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname='kds_ticket_poll') <> 1 THEN
    RAISE EXCEPTION 'K-G6 FAIL-SAFE: kds_ticket_poll must exist (exactly one)';
  END IF;
  IF NOT has_function_privilege('service_role','public.kds_ticket_poll(uuid,uuid,text,timestamptz,uuid,integer)','EXECUTE')
     OR has_function_privilege('anon','public.kds_ticket_poll(uuid,uuid,text,timestamptz,uuid,integer)','EXECUTE')
     OR has_function_privilege('authenticated','public.kds_ticket_poll(uuid,uuid,text,timestamptz,uuid,integer)','EXECUTE') THEN
    RAISE EXCEPTION 'K-G6 FAIL-SAFE: kds_ticket_poll ACL not service-role-only';
  END IF;
END;
$$;
