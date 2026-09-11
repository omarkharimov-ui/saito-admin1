-- ============================================================================
-- 20260911000032 — K / G1: close anon exposure on order_items + drop kds_tickets
--
-- USER-FROZEN CONTRACT (K gate G1, confirmed): "Scoped security repair. O/F
-- reopen yoxdur." — closes EXPOSURE only, changes no O/F business behavior.
--
-- EVIDENCE (K-0, real DB jbxmlnsicbfkbsatnoej):
--   K-01: order_items policy `service_role_full_order_items` = polroles {0}
--         (= PUBLIC / ALL roles incl. anon) + USING true + WITH CHECK true.
--         RLS policies OR -> anon could SELECT 701 rows (SET ROLE anon proved),
--         PostgREST anon GET /order_items returned real rows (proved).
--   K-02: kds_tickets = definer VIEW, NO location/org filter, anon-readable
--         (368 rows proved). Caller sweep = 0 EVERYWHERE:
--           - 0 src references (rg), 0 harness refs, 0 DB fns read/write it,
--             0 triggers, 0 dependent views/matviews -> DROP is safe.
--   Server routes all read order_items via service_role (unaffected by this
--   change). The only browser-direct reader (app/admin/audit/page.tsx) is the
--   admin module (NOT K); it will see 0 rows after this fix — recorded in
--   K_FROZEN as an admin-scope follow-up (42501/empty != working pattern).
--
-- GOLDEN RULE 5: auto-commit.
-- ============================================================================

-- ---- K-01: order_items — drop the PUBLIC-scoped policy ----
-- order_items had SIX policies. The broken one is `service_role_full_order_items`
-- (polroles={0} = ALL roles incl. anon, USING/WITH CHECK true). Correctly-scoped
-- policies already cover service_role (`order_items_service_full` AND
-- `service_full_order_items`, both polroles=service_role) and authenticated
-- (`order_items_*_loc`, org+location EXISTS). Fix: DROP the PUBLIC {0} one (the
-- K-01 leak) and the one redundant service_role duplicate. service_role keeps
-- full access via `order_items_service_full`; authenticated keeps its loc-scoped
-- SELECT/INSERT/UPDATE. No business behavior change — exposure close only.
DROP POLICY IF EXISTS service_role_full_order_items ON public.order_items;
DROP POLICY IF EXISTS service_full_order_items ON public.order_items;

-- ---- K-02: kds_tickets — drop the anon-readable, unscoped, caller-free view ----
DROP VIEW IF EXISTS public.kds_tickets;

-- ---- fail-safe: no PUBLIC-scoped (polroles={0}) policy may remain on
--      order_items, and kds_tickets must be gone ----
DO $$
DECLARE
  v_pub integer;
  v_view boolean;
BEGIN
  -- polroles={0} == the PUBLIC pseudo-role; pg_policies shows it as roles=[public].
  SELECT count(*) INTO v_pub
  FROM pg_policy
  WHERE polrelid = 'public.order_items'::regclass
    AND (cardinality(polroles) = 0 OR 0 = ANY(polroles));
  IF v_pub <> 0 THEN
    RAISE EXCEPTION 'K-G1 FAIL-SAFE: % PUBLIC-scoped policy(ies) remain on order_items', v_pub;
  END IF;

  SELECT exists(
    SELECT 1 FROM pg_class WHERE relnamespace='public'::regnamespace AND relname='kds_tickets'
  ) INTO v_view;
  IF v_view THEN
    RAISE EXCEPTION 'K-G1 FAIL-SAFE: kds_tickets still present';
  END IF;
END;
$$;
