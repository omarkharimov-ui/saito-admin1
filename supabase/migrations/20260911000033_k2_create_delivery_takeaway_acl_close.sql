-- ============================================================================
-- 20260911000033 — K / G2: close anon+authenticated EXECUTE on
--                  create_delivery_order / create_takeaway_order
--
-- USER-FROZEN CONTRACT (K gate G2, confirmed): scoped auth/location hardening,
-- NO formal O reopen. Order-creation contract belongs to O; this RPC is a
-- K-audit-discovered raw surface and must NOT be public.
--
-- EVIDENCE (K-0, real DB + empirical):
--   K-03: create_delivery_order = anon EXECUTE TRUE + authenticated TRUE;
--     no set_session_staff / authorize / has_location_access inside; INSERTs
--     into orders with caller-supplied p_location_id/p_organization_id.
--     Empirical (anon PostgREST, bogus location, no residue): returned
--     23503 orders_location_id_fkey = reached the INSERT. With a REAL
--     location/org an anonymous client could create a delivery order.
--   create_takeaway_order: same shape; currently only blocked because its
--     first helper generate_takeaway_order_number lacks anon EXECUTE (latent).
--
-- CALLER SWEEP (before change) — all safe:
--   - DB callers: NONE (0 functions reference either).
--   - src callers: ONLY via authenticated server routes
--     /api/rpc/create_delivery_order + /api/rpc/create_takeaway_order which use
--     requireAuth + resolveLocationContext (server-trusted D-5 location) +
--     createAuthClient() = SERVICE ROLE. A browser NEVER calls the PostgREST
--     RPC directly (usePos.tsx uses apiFetch to the route URLs).
--   - Therefore revoking anon + authenticated breaks NOTHING; service_role
--     keeps the working path. A real public delivery-customer flow must be a
--     SEPARATE public/customer-safe API contract (not this raw RPC) — deferred
--     (recorded in K_FROZEN).
--
-- A real public delivery-customer flow would need a separate public/customer-
-- safe API contract; the raw RPC must not be public.
--
-- GOLDEN RULE 5: auto-commit.
-- ============================================================================

-- delivery order creation
REVOKE EXECUTE ON FUNCTION public.create_delivery_order(text, text, text, text, text, text, text, text, text, text, text, numeric, timestamptz, jsonb, uuid, uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_delivery_order(text, text, text, text, text, text, text, text, text, text, text, numeric, timestamptz, jsonb, uuid, uuid, uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.create_delivery_order(text, text, text, text, text, text, text, text, text, text, text, numeric, timestamptz, jsonb, uuid, uuid, uuid) FROM anon;

-- takeaway order creation
REVOKE EXECUTE ON FUNCTION public.create_takeaway_order(text, text, text, timestamptz, jsonb, uuid, uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_takeaway_order(text, text, text, timestamptz, jsonb, uuid, uuid, uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.create_takeaway_order(text, text, text, timestamptz, jsonb, uuid, uuid, uuid) FROM anon;

-- keep the canonical server path (service role) intact
GRANT EXECUTE ON FUNCTION public.create_delivery_order(text, text, text, text, text, text, text, text, text, text, text, numeric, timestamptz, jsonb, uuid, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_takeaway_order(text, text, text, timestamptz, jsonb, uuid, uuid, uuid) TO service_role;

-- ---- fail-safe: service_role keeps EXECUTE, anon loses it ----
DO $$
BEGIN
  IF NOT has_function_privilege('service_role',
        'public.create_delivery_order(text, text, text, text, text, text, text, text, text, text, text, numeric, timestamptz, jsonb, uuid, uuid, uuid)', 'EXECUTE')
     OR has_function_privilege('anon',
        'public.create_delivery_order(text, text, text, text, text, text, text, text, text, text, text, numeric, timestamptz, jsonb, uuid, uuid, uuid)', 'EXECUTE')
     OR NOT has_function_privilege('service_role',
        'public.create_takeaway_order(text, text, text, timestamptz, jsonb, uuid, uuid, uuid)', 'EXECUTE')
     OR has_function_privilege('anon',
        'public.create_takeaway_order(text, text, text, timestamptz, jsonb, uuid, uuid, uuid)', 'EXECUTE')
  THEN
    RAISE EXCEPTION 'K-G2 FAIL-SAFE: create_delivery/takeaway_order ACL not service-role-only';
  END IF;
END;
$$;
