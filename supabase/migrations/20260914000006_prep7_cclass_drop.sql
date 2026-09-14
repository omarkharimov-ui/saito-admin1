-- ═══════════════════════════════════════════════════════════════════════════════
-- C-class DROP (Pre-P7 cleanup, ratified 2026-09-14): drop the 32 empty,
-- zero-reference tables that survived the freeze reflow GREEN.
--
-- Gate to this migration (all re-run after migration 20260914000005 froze DML):
--   A 39/39, P-1 29/29, P-2 13/13, P-3 25/25, P-4 19/19, P-5 10/10, P-6 15/15,
--   O 38/38, F 35/35, K-L3 8/8, K-L4 16/16. => no route/gate/trigger writes to
--   the frozen set; the ref-scan held under live traffic.
--
-- Dependency-ordered (C2C children first; the four child FKs are all ON DELETE
-- CASCADE, so CASCADE is belt-and-suspenders for their drop):
--   denomination_counts, job_permissions, review_scores, onboarding_tasks
--   -> then their parents cash_reconciliations, jobs, performance_reviews,
--      onboarding_workflows.
-- dining_groups is intentionally ABSENT: orders.group_id (LIVE, 100%-null,
-- S-10 keep) references it — dropping it would require altering a P-frozen
-- orders column. It stays frozen (20260914000005) for a separate decision.
-- ═══════════════════════════════════════════════════════════════════════════════
DROP TABLE IF EXISTS denomination_counts CASCADE;
DROP TABLE IF EXISTS job_permissions CASCADE;
DROP TABLE IF EXISTS review_scores CASCADE;
DROP TABLE IF EXISTS onboarding_tasks CASCADE;

DROP TABLE IF EXISTS break_adherence CASCADE;
DROP TABLE IF EXISTS break_compliance CASCADE;
DROP TABLE IF EXISTS campaign_products CASCADE;
DROP TABLE IF EXISTS cash_reconciliations CASCADE;
DROP TABLE IF EXISTS compliance_violations CASCADE;
DROP TABLE IF EXISTS employee_compensation CASCADE;
DROP TABLE IF EXISTS gift_card_ledger CASCADE;
DROP TABLE IF EXISTS gift_card_transactions CASCADE;
DROP TABLE IF EXISTS item_corrections CASCADE;
DROP TABLE IF EXISTS jobs CASCADE;
DROP TABLE IF EXISTS kitchen_ticket_items CASCADE;
DROP TABLE IF EXISTS loyalty_order_points CASCADE;
DROP TABLE IF EXISTS loyalty_transactions CASCADE;
DROP TABLE IF EXISTS onboarding_workflows CASCADE;
DROP TABLE IF EXISTS operation_tracking CASCADE;
DROP TABLE IF EXISTS order_changes CASCADE;
DROP TABLE IF EXISTS order_courses CASCADE;
DROP TABLE IF EXISTS payment_refunds CASCADE;
DROP TABLE IF EXISTS performance_reviews CASCADE;
DROP TABLE IF EXISTS print_jobs CASCADE;
DROP TABLE IF EXISTS schedule_conflicts CASCADE;
DROP TABLE IF EXISTS schedule_templates CASCADE;
DROP TABLE IF EXISTS shift_handover_notes CASCADE;
DROP TABLE IF EXISTS staff_availability CASCADE;
DROP TABLE IF EXISTS staff_messages CASCADE;
DROP TABLE IF EXISTS tip_pool_contributions CASCADE;
DROP TABLE IF EXISTS tipout_configs CASCADE;
DROP TABLE IF EXISTS webhook_events CASCADE;
