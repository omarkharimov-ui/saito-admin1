-- P-9 M1 ROLLBACK — restores the exact pre-state captured in .p9-audit/p9_4_grants
-- (2026-09-17). Apply ONLY if M1 caused a reflow/gate regression.
BEGIN;
-- A-rollback: restore pre-state grants
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.cash_drawer_logs        TO anon, authenticated, test_rls_role;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.cash_registers          TO anon, authenticated, test_rls_role;
GRANT SELECT ON public.app_settings            TO anon, test_rls_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_settings            TO authenticated;
GRANT SELECT ON public.expenses                TO anon, test_rls_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expenses                TO authenticated;
GRANT SELECT ON public.kitchen_analytics       TO anon, test_rls_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kitchen_analytics       TO authenticated;
GRANT SELECT ON public.order_counters          TO anon, test_rls_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_counters          TO authenticated;
GRANT SELECT ON public.payment_attempts        TO anon, test_rls_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_attempts        TO authenticated;
GRANT SELECT ON public.payment_idempotency_keys TO anon, test_rls_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_idempotency_keys TO authenticated;
GRANT SELECT ON public.payroll_webhook_configs  TO anon, test_rls_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payroll_webhook_configs  TO authenticated;
GRANT SELECT ON public.staff_metrics           TO anon, test_rls_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_metrics           TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.loyalty_product_rules   TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE, REFERENCES, TRIGGER ON public.delivery_zones   TO authenticated, test_rls_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_methods         TO authenticated, test_rls_role;
GRANT SELECT, INSERT, UPDATE, DELETE, REFERENCES, TRIGGER ON public.gift_cards      TO authenticated;
-- B-rollback
ALTER TABLE public.reservation_preorder_items NO ROW LEVEL SECURITY;
-- C-rollback: restore PUBLIC-ALL policies
CREATE POLICY "Allow all for authenticated" ON public.overtime_records USING (true);
CREATE POLICY schedule_all ON public.schedule USING (true);
CREATE POLICY "Allow all for authenticated" ON public.shift_breaks USING (true);
CREATE POLICY shift_breaks_all ON public.shift_breaks USING (true);
CREATE POLICY "Allow all for authenticated" ON public.shift_swap_requests USING (true);
DROP POLICY IF EXISTS overtime_records_self ON public.overtime_records;
DROP POLICY IF EXISTS overtime_records_service_full ON public.overtime_records;
DROP POLICY IF EXISTS schedule_self ON public.schedule;
DROP POLICY IF EXISTS schedule_service_full ON public.schedule;
DROP POLICY IF EXISTS shift_breaks_self ON public.shift_breaks;
DROP POLICY IF EXISTS shift_breaks_service_full ON public.shift_breaks;
DROP POLICY IF EXISTS shift_swap_requests_self ON public.shift_swap_requests;
DROP POLICY IF EXISTS shift_swap_requests_service_full ON public.shift_swap_requests;
COMMIT;
