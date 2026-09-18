-- =============================================================================
-- P-9 M1 — SECURITY / RLS / GRANT PASS (ratified D-1 + D-9-MODIFY, 2026-09-17)
-- Pre-state evidence: .p9-audit/p9_4_grants (captured 2026-09-17 before any change)
-- Rollback: supabase/migrations/20260918000001_p9_rls_grant_pass_rollback.sql
--
-- Scope (binding):
--  * NO table/column/row changes — REVOKE/CREATE POLICY/ENABLE RLS only.
--  * Public catalogs keep anon SELECT: delivery_zones, payment_methods, gift_cards.
--  * Everything else: service_role only (service_role BYPASSES RLS — app routes unaffected).
--  * test_rls_role (D-9 MODIFY): grants revoked on all 15 tables; ROLE KEPT
--    (P-5/P-6/P-8 migration files reference it; 0 policies use it — PROVEN).
--  * reservation_preorder_items: RLS ENABLED (3 existing policies become active;
--    effective access unchanged — anon SELECT by policy, service by bypass,
--    authenticated had no grant).
--  * 4 P-8-carried tables: PUBLIC-ALL policies replaced by self-scope SELECT
--    (staff sees own rows / superadmin sees all) + explicit service full.
-- =============================================================================

-- ── A. REVOKE non-service access on the 15 RLS-off tables ──────────────────
-- full revoke (anon + authenticated + test_rls_role)
REVOKE ALL ON public.cash_drawer_logs        FROM anon, authenticated, test_rls_role;
REVOKE ALL ON public.cash_registers          FROM anon, authenticated, test_rls_role;
REVOKE ALL ON public.app_settings            FROM anon, authenticated, test_rls_role;
REVOKE ALL ON public.expenses                FROM anon, authenticated, test_rls_role;
REVOKE ALL ON public.kitchen_analytics       FROM anon, authenticated, test_rls_role;
REVOKE ALL ON public.order_counters          FROM anon, authenticated, test_rls_role;
REVOKE ALL ON public.payment_attempts        FROM anon, authenticated, test_rls_role;
REVOKE ALL ON public.payment_idempotency_keys FROM anon, authenticated, test_rls_role;
REVOKE ALL ON public.payroll_webhook_configs FROM anon, authenticated, test_rls_role;
REVOKE ALL ON public.staff_metrics           FROM anon, authenticated, test_rls_role;
REVOKE ALL ON public.loyalty_product_rules   FROM anon, authenticated, test_rls_role;
-- public catalogs: keep anon SELECT, revoke authenticated + test role
REVOKE ALL ON public.delivery_zones          FROM authenticated, test_rls_role;
REVOKE ALL ON public.payment_methods         FROM authenticated, test_rls_role;
REVOKE ALL ON public.gift_cards              FROM authenticated, test_rls_role;
-- reservation_preorder_items: anon SELECT kept; no authenticated grant existed
REVOKE ALL ON public.reservation_preorder_items FROM test_rls_role;

-- ── B. reservation_preorder_items: activate the 3 dormant policies ─────────
ALTER TABLE public.reservation_preorder_items ENABLE ROW LEVEL SECURITY;

-- ── C. 4 P-8-carried tables: replace PUBLIC-ALL with self-scope + service ──
DROP POLICY IF EXISTS "Allow all for authenticated" ON public.overtime_records;
DROP POLICY IF EXISTS schedule_all                 ON public.schedule;
DROP POLICY IF EXISTS "Allow all for authenticated" ON public.shift_breaks;
DROP POLICY IF EXISTS shift_breaks_all             ON public.shift_breaks;
DROP POLICY IF EXISTS "Allow all for authenticated" ON public.shift_swap_requests;

CREATE POLICY overtime_records_self ON public.overtime_records
  FOR SELECT TO authenticated
  USING (staff_id = public.current_staff_id() OR public.is_superadmin());
CREATE POLICY overtime_records_service_full ON public.overtime_records
  TO service_role USING (true) WITH CHECK (true);

CREATE POLICY schedule_self ON public.schedule
  FOR SELECT TO authenticated
  USING (staff_id = public.current_staff_id() OR public.is_superadmin());
CREATE POLICY schedule_service_full ON public.schedule
  TO service_role USING (true) WITH CHECK (true);

CREATE POLICY shift_breaks_self ON public.shift_breaks
  FOR SELECT TO authenticated
  USING (staff_id = public.current_staff_id() OR public.is_superadmin());
CREATE POLICY shift_breaks_service_full ON public.shift_breaks
  TO service_role USING (true) WITH CHECK (true);

CREATE POLICY shift_swap_requests_self ON public.shift_swap_requests
  FOR SELECT TO authenticated
  USING (requested_by = public.current_staff_id()
         OR target_staff_id = public.current_staff_id()
         OR public.is_superadmin());
CREATE POLICY shift_swap_requests_service_full ON public.shift_swap_requests
  TO service_role USING (true) WITH CHECK (true);
