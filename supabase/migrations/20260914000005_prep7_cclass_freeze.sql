-- ═══════════════════════════════════════════════════════════════════════════════
-- C-class FREEZE (Pre-P7 cleanup, ratified 2026-09-14): block all DML to the
-- 33 frozen empty tables (32 drop-pending + dining_groups) for the reflow window.
--
-- Method (ratified: freeze -> ref-scan -> reflow -> DROP -> post-drop verify):
--   * Set = 61 empty (0-row) objects, all scanned with a COMPREHENSIVE ref-scan
--     (.from(), .rpc(), REST /rest/v1/<table> URLs, raw SQL, fn bodies, triggers,
--     views, incoming/outgoing FKs, gates). 28 excluded from drop:
--       - 17 had live .from() refs (invoices, gift_cards, stock_counts, …)
--       - 10 had live REST-URL refs the first .from()-only scan missed
--         (couriers, daily_reports, app_settings, payroll_*, shift_swap_requests,
--          staff_announcements, tip_distributions, customer_addresses,
--          notification_read_state, loyalty_product_rules)
--       - 1 (dining_groups) is referenced by a LIVE FK from orders.group_id —
--         dropping it would require altering a P-frozen orders column (S-10
--         keeps 100%-null columns) -> frozen here, separate decision.
--   * DROP set after reflow = the 32 below EXCLUDING dining_groups.
--   * FREEZE = REVOKE INSERT/UPDATE/DELETE/TRUNCATE from anon + authenticated +
--     service_role (SELECT retained). If ANY route/gate/trigger attempts a write
--     to one of the 33 during the reflow, it fails loudly -> ref-scan was wrong.
--   * DROP happens in a SEPARATE migration ONLY after the full reflow is green.
--
-- Dependency order for the later drop (child first, all ON DELETE CASCADE C2C):
--   denomination_counts -> cash_reconciliations
--   job_permissions     -> jobs
--   review_scores       -> performance_reviews
--   onboarding_tasks    -> onboarding_workflows
-- (all other drop-set tables have no incoming FKs from within the set)
-- ═══════════════════════════════════════════════════════════════════════════════
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE break_adherence FROM anon, authenticated, service_role;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE break_compliance FROM anon, authenticated, service_role;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE campaign_products FROM anon, authenticated, service_role;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE cash_reconciliations FROM anon, authenticated, service_role;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE compliance_violations FROM anon, authenticated, service_role;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE denomination_counts FROM anon, authenticated, service_role;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE dining_groups FROM anon, authenticated, service_role;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE employee_compensation FROM anon, authenticated, service_role;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE gift_card_ledger FROM anon, authenticated, service_role;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE gift_card_transactions FROM anon, authenticated, service_role;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE item_corrections FROM anon, authenticated, service_role;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE job_permissions FROM anon, authenticated, service_role;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE jobs FROM anon, authenticated, service_role;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE kitchen_ticket_items FROM anon, authenticated, service_role;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE loyalty_order_points FROM anon, authenticated, service_role;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE loyalty_transactions FROM anon, authenticated, service_role;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE onboarding_tasks FROM anon, authenticated, service_role;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE onboarding_workflows FROM anon, authenticated, service_role;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE operation_tracking FROM anon, authenticated, service_role;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE order_changes FROM anon, authenticated, service_role;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE order_courses FROM anon, authenticated, service_role;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE payment_refunds FROM anon, authenticated, service_role;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE performance_reviews FROM anon, authenticated, service_role;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE print_jobs FROM anon, authenticated, service_role;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE review_scores FROM anon, authenticated, service_role;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE schedule_conflicts FROM anon, authenticated, service_role;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE schedule_templates FROM anon, authenticated, service_role;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE shift_handover_notes FROM anon, authenticated, service_role;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE staff_availability FROM anon, authenticated, service_role;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE staff_messages FROM anon, authenticated, service_role;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE tip_pool_contributions FROM anon, authenticated, service_role;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE tipout_configs FROM anon, authenticated, service_role;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE webhook_events FROM anon, authenticated, service_role;

-- dining_groups: frozen for the reflow window like the others, then its grants
-- were RESTORED (GRANT INSERT/UPDATE/DELETE/TRUNCATE back to anon/authenticated/
-- service_role) immediately after, because it is NOT part of the drop set (live
-- FK orders.group_id -> dining_groups; removing it means altering a P-frozen
-- orders column — S-10 keeps 100%-null columns) and it has no write path
-- (verified 0 .from()/REST/insert/update/delete references in src). Net state:
-- pre-C-class ACL, still a P-9 decision candidate (drop only with its FK).
GRANT INSERT, UPDATE, DELETE, TRUNCATE ON TABLE dining_groups TO anon, authenticated, service_role;
