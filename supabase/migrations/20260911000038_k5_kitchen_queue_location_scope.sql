-- ============================================================================
-- 20260911000038 — K / G5: get_kitchen_queue + get_kitchen_stats location/org
--                  scope + REVOKE authenticated/anon (service_role only)
--
-- USER-FROZEN CONTRACT (K gate G5, confirmed): "REVOKE + scope. dead olsa belə
--   authenticated raw EXECUTE ❌, cross-location query ❌, location/org scope ✅.
--   caller sweep sonrası 0-dırsa drop candidate qeydi."
--
-- EVIDENCE (K-0, real DB):
--   K-06: get_kitchen_queue(p_station) SELECTs order_items⋈orders WHERE
--     status NOT IN(paid/closed/cancelled) AND kitchen_status NOT IN
--     (completed/cancelled/served) [AND station] — NO location_id/org filter.
--     get_kitchen_stats(p_hours) same (station-grouped aggregates, no loc).
--     Both are SECURITY DEFINER (run as owner, BYPASS caller RLS) and
--     authenticated-executable -> any staff could read EVERY location's live
--     KDS queue. Caller sweep: 0 src + 0 DB callers (dead, but exposed).
--
-- FIX:
--   (1) Add p_location_id uuid (+ p_organization_id uuid) params; filter the
--       query to that location/org (server passes the session's active location;
--       the frozen get_kitchen_queue/stats stay read-models, behavior for a
--       correctly-scoped caller is unchanged).
--   (2) REVOKE authenticated + anon EXECUTE; GRANT service_role only. A live
--       caller must go through a service-role route that resolves the session's
--       location (never client-supplied). (No live src caller exists today; if
--       one is added it MUST pass a server-resolved location.)
--   (3) Keep the old signatures? No — they are the unscoped, exposed surface.
--       Re-create with the scoped signature and DROP the old overload so no
--       unscoped variant remains.
--
-- DROP-CANDIDATE: 0 live callers (src + DB). If a future kitchen queue route is
--   added it will call the scoped variant via service role. Retained (not dropped)
--   because the KDS read-model is likely to be re-used; recorded as drop-candidate.
--
-- GOLDEN RULE 5: auto-commit.
-- ============================================================================

-- ---- get_kitchen_queue: scoped re-create ----
DROP FUNCTION IF EXISTS public.get_kitchen_queue(text);
CREATE OR REPLACE FUNCTION public.get_kitchen_queue(p_station text, p_location_id uuid, p_organization_id uuid)
RETURNS TABLE(
  order_id uuid, order_number text, table_number integer, order_source text,
  customer_name text, guest_count integer, is_rush boolean,
  created_at timestamptz, order_age_seconds integer,
  item_id uuid, product_name text, quantity integer, modifiers jsonb,
  special_notes text, kitchen_status text, station text, is_hold boolean,
  course text, sent_to_kitchen_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    o.id, o.order_number, o.table_number, o.order_source, o.customer_name,
    o.guest_count, o.is_rush, o.created_at,
    EXTRACT(EPOCH FROM (now() - o.created_at))::INTEGER,
    oi.id, oi.product_name, oi.quantity, oi.modifiers, oi.special_notes,
    oi.kitchen_status::TEXT, COALESCE(oi.station,'all'), COALESCE(oi.is_hold,false),
    oi.course, oi.created_at
  FROM order_items oi
  JOIN orders o ON oi.order_id = o.id
  WHERE o.status NOT IN ('paid','closed','cancelled')
    AND oi.kitchen_status NOT IN ('completed','cancelled','served')
    AND o.location_id = p_location_id
    AND o.organization_id = p_organization_id
    AND (p_station IS NULL OR oi.station = p_station)
  ORDER BY o.is_rush DESC, o.created_at ASC, oi.created_at ASC;
END;
$$;

-- ---- get_kitchen_stats: scoped re-create ----
DROP FUNCTION IF EXISTS public.get_kitchen_stats(integer);
CREATE OR REPLACE FUNCTION public.get_kitchen_stats(p_hours integer, p_location_id uuid, p_organization_id uuid)
RETURNS TABLE(
  station text, total_items bigint, avg_prep_time_seconds numeric,
  items_ready bigint, items_delayed bigint, rush_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(oi.station,'all'),
    COUNT(*),
    ROUND(AVG(EXTRACT(EPOCH FROM (oi.served_at - oi.created_at))),0),
    COUNT(*) FILTER (WHERE oi.kitchen_status = 'ready'),
    COUNT(*) FILTER (WHERE oi.served_at IS NOT NULL AND EXTRACT(EPOCH FROM (oi.served_at - oi.created_at)) > 1200),
    COUNT(*) FILTER (WHERE o.is_rush = true)
  FROM order_items oi
  JOIN orders o ON oi.order_id = o.id
  WHERE oi.created_at >= now() - (p_hours || ' hours')::INTERVAL
    AND oi.kitchen_status NOT IN ('cancelled')
    AND o.location_id = p_location_id
    AND o.organization_id = p_organization_id
  GROUP BY COALESCE(oi.station,'all')
  ORDER BY total_items DESC;
END;
$$;

-- ---- ACL: service_role only ----
REVOKE EXECUTE ON FUNCTION public.get_kitchen_queue(text, uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_kitchen_queue(text, uuid, uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_kitchen_queue(text, uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_kitchen_queue(text, uuid, uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.get_kitchen_stats(integer, uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_kitchen_stats(integer, uuid, uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_kitchen_stats(integer, uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_kitchen_stats(integer, uuid, uuid) TO service_role;

-- ---- fail-safe: scoped fns exist + service_role-only + old unscoped overloads gone ----
DO $$
BEGIN
  IF (SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace
      AND proname='get_kitchen_queue' AND pg_get_function_identity_arguments(oid)='p_station text') <> 0
     OR (SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace
      AND proname='get_kitchen_stats' AND pg_get_function_identity_arguments(oid)='p_hours integer') <> 0 THEN
    RAISE EXCEPTION 'K-G5 FAIL-SAFE: old unscoped get_kitchen_queue/stats overload still present';
  END IF;
  IF NOT has_function_privilege('service_role','public.get_kitchen_queue(text, uuid, uuid)','EXECUTE')
     OR has_function_privilege('anon','public.get_kitchen_queue(text, uuid, uuid)','EXECUTE')
     OR has_function_privilege('authenticated','public.get_kitchen_queue(text, uuid, uuid)','EXECUTE')
     OR NOT has_function_privilege('service_role','public.get_kitchen_stats(integer, uuid, uuid)','EXECUTE')
     OR has_function_privilege('anon','public.get_kitchen_stats(integer, uuid, uuid)','EXECUTE')
  THEN
    RAISE EXCEPTION 'K-G5 FAIL-SAFE: get_kitchen_queue/stats ACL not service-role-only';
  END IF;
END;
$$;
