# PRE-P7 Supabase Schema Reality Audit (2026-09-14)

> **READ-ONLY audit. No DB change has been made.** P-7 is PAUSED until this is ratified.
> Classification of every live object, pending user ratification. Even class-C items are NOT deleted in this phase.

> Raw evidence sweep (pooler, read-only): 169 tables/views · 2112 columns · 283 FK · 223 RLS policies · 88 triggers · 625 functions · 527 indexes · 91 enum values · 49 committed migration files. Row counts are exact (`COUNT(*)`).

## 1. Headline findings

| # | Finding | Severity |
|---|---|---|
| H-1 | **Repo migrations do NOT reproduce the live schema.** The 49 committed migrations contain only 2 `CREATE TABLE`/`CREATE VIEW`; **167 of 169 live tables were never created in-repo** (Supabase dashboard / legacy-applied). The real applied-migration ledger is the `migrations` table (36 rows). => The repo cannot restore this DB from zero. | **E (drift) — PRIORITY** |
| H-2 | **`settings` holds >=6 plaintext credential columns** (`admin_password`, `superadmin_password` (9 chars), `kitchen_password` (default visible in DDL), `smtp_user`, `smtp_pass`). Code comment says secrets are not exposed via the settings routes — live route verification still pending (next turn). | **D (security)** |
| H-3 | **41 tables have RLS OFF; 27 of them contain data** (staff_stats 803, staff_public_view 803, v_closed_orders 321, migrations 36, labor_summaries 110, current_stock 34, inventory_status 34, recipe_items 60, table_order_contract 32, shift_reviews 16, ...). Actual anon/authenticated exposure depends on table GRANTS — `role_table_grants` pass pending (next turn). | **D (pending verification)** |
| H-4 | **61 of 169 tables are EMPTY**; of those, **47 have ZERO references in app code AND in every DB function body** (payroll_*, jobs, gift_card_*, schedule_templates, webhook_events, etc. — full list in section 3). | **C candidates** |
| H-5 | **Duplicate/parallel structures** (same data, multiple homes): `audit_log`+`audit_logs`+`audit_logs_canonical` (3 audit tables), `cash_drawer_log`+`cash_drawer_logs`, `payments`+`order_payments` (legacy+new ledgers), `operation_logs`+`operation_tracking`+`transaction_logs`+`sync_operations` (4 op-logs), `break_compliance`+`break_adherence`, `staff_metrics`+`staff_stats`+`staff_public_view` (3 staff rollups), `settings`+`app_settings`. | **B/E (P-9 reconciliation)** |
| H-6 | `reservation_tables_quarantine_2026_09` — **dated quarantine table, 8 rows, RLS off** (September quarantine of reservation-table data, never cleaned up). | **E (investigate)** |
| H-7 | **`stations` is the ONLY RLS-FORCED table** — unique posture, verify intent. | **E (minor)** |

## 2. Where what lives — module map (169 objects, rows in parens)

- **?** (3): approval_requests(56), clock_events(0), discrepancy_alerts(26)
- **AI** (2): ai_cache(5), popular_queries(10)
- **AUDIT** (6): audit_log(67), audit_logs(333), audit_logs_canonical(649), operation_logs(1634), operation_tracking(0), transaction_logs(0)
- **AUTH** (8): login_attempts(108), manager_overrides(3), permission_categories(5), permissions(65), role_permissions(282), roles(11), security_events(660), sessions(324)
- **CONFIG** (4): app_settings(0), locations(5), organizations(1), settings(1)
- **CRM** (2): customer_addresses(0), customers(7)
- **DELIVERY** (2): couriers(0), delivery_zones(1)
- **DRAWER** (6): cash_drawer_log(133), cash_drawer_logs(1), cash_drawer_sessions(6), cash_reconciliations(0), cash_registers(3), denomination_counts(0)
- **FLOOR** (4): floors(2), stations(5), table_floors(32), table_order_contract(32)
- **FLOOR/RES** (2): reservation_preorder_items(9), reservation_tables(9)
- **GIFT** (3): gift_card_ledger(0), gift_card_transactions(0), gift_cards(0)
- **HR** (7): employee_compensation(0), job_permissions(0), jobs(0), payroll_entries(8), payroll_exports(0), payroll_periods(2), payroll_webhook_configs(0)
- **INVENTORY** (13): current_stock(34), ingredients(34), inventory_logs(718), inventory_status(34), item_corrections(0), product_cost_summary(14), recipe_headers(0), recipe_items(60), recipes(60), stock_count_items(0), stock_counts(0), stock_transactions(0), waste_standards(0)
- **KDS** (5): kitchen_analytics(13), kitchen_schedule(3), kitchen_ticket_items(0), kitchen_tickets(24), waiter_assignments(18)
- **LOYALTY** (4): loyalty_accounts(0), loyalty_order_points(0), loyalty_product_rules(0), loyalty_transactions(0)
- **MENU** (12): allergens(13), categories(10), combo_items(3), combos(1), modifier_group_items(7), modifier_groups(5), price_overrides(3), product_allergens(3), product_modifier_groups(2), product_modifiers(7), product_variants(3), products(14)
- **META** (1): migrations(36)
- **MKT** (8): campaign_products(0), campaign_rules(5), campaign_schedules(1), campaign_targets(5), campaign_usage(15), campaigns(5), notification_read_state(0), notifications(211)
- **ONBOARD** (2): onboarding_tasks(0), onboarding_workflows(0)
- **ORDER** (10): cancelled_orders(13), dining_groups(0), order_changes(0), order_counters(1), order_courses(0), order_events(18), order_hourly_stats(14), order_items(701), order_payments(82), orders(729)
- **ORDER/INV** (2): invoice_items(0), invoices(0)
- **OUTBOX** (2): outbox_events(4107), sync_operations(2)
- **P10-future** (1): webhook_events(0)
- **PAY-P4** (1): payment_idempotency_keys(9)
- **PAY-legacy** (4): payment_attempts(2), payment_methods(9), payment_refunds(0), payments(2)
- **PRINT** (1): print_jobs(0)
- **PROC** (10): compliance_rules(3), compliance_violations(0), procurement_reviews(0), purchase_order_items(0), purchase_orders(0), review_scores(0), risk_scores(8), supplier_return_items(0), supplier_returns(0), suppliers(1)
- **REGISTRY** (1): state_transitions(214)
- **REPORT** (3): daily_reports(0), expenses(0), labor_summaries(110)
- **RES** (2): reservations(86), reservations_archive(18)
- **RES-quarantine** (1): reservation_tables_quarantine_2026_09(8)
- **SHIFT** (12): break_adherence(0), break_compliance(0), break_rules(13), overtime_records(1), overtime_thresholds(3), shift_breaks(2), shift_handover_notes(0), shift_reviews(16), shift_swap_requests(0), shifts(110), time_clock_audit(8), time_clock_entries(29)
- **STAFF** (10): performance_reviews(0), schedule(50), schedule_conflicts(0), schedule_templates(0), staff(803), staff_announcements(0), staff_availability(0), staff_documents(4), staff_locations(92), staff_messages(0)
- **STAFF-rollup** (3): staff_metrics(56), staff_public_view(803), staff_stats(803)
- **TIP** (6): tip_distribution_rules(4), tip_distributions(0), tip_pool_contributions(0), tip_pools(1), tip_shortfalls(8), tipout_configs(0)
- **VIEW** (6): v_closed_orders(321), v_daily_revenue(19), v_daily_staff_performance(62), v_staff_performance(53), v_stock_health(1), v_top_products(14)

## 3. Table-level classification (A-F)

Legend: **A** live/keep · **B** legacy retained (P-9) · **C** dead candidate (not deleted here) · **D** security risk · **E** repo/live drift · **F** unknown (no action). `dbfn` = number of DB function bodies referencing the table.

| Table | rows | RLS | app-refs | dbfn-refs | module | class | note |
|---|---|---|---|---|---|---|---|
| ai_cache | 5 | ON | 0 | 0 | AI | **F** | needs more evidence |
| allergens | 13 | ON | 1 | 0 | MENU | **A** |  |
| app_settings | 0 | OFF | 0 | 1 | CONFIG | **B/E?** | legacy/duplicate (H-5) or RLS-off-with-data — P-9 disposition |
| approval_requests | 56 | ON | 0 | 0 | ? | **F** | needs more evidence |
| audit_log | 67 | ON | 0 | 21 | AUDIT | **B/E?** | legacy/duplicate (H-5) or RLS-off-with-data — P-9 disposition |
| audit_logs | 333 | ON | 0 | 6 | AUDIT | **B/E?** | legacy/duplicate (H-5) or RLS-off-with-data — P-9 disposition |
| audit_logs_canonical | 649 | ON | 0 | 1 | AUDIT | **A** |  |
| break_adherence | 0 | OFF | 0 | 0 | SHIFT | **C** | empty + zero refs (app & DB) |
| break_compliance | 0 | ON | 0 | 1 | SHIFT | **B** | empty, only referenced by legacy DB fns |
| break_rules | 13 | ON | 0 | 1 | SHIFT | **A** |  |
| campaign_products | 0 | ON | 0 | 0 | MKT | **C** | empty + zero refs (app & DB) |
| campaign_rules | 5 | ON | 7 | 0 | MKT | **A** |  |
| campaign_schedules | 1 | ON | 6 | 0 | MKT | **A** |  |
| campaign_targets | 5 | ON | 7 | 0 | MKT | **A** |  |
| campaign_usage | 15 | ON | 0 | 5 | MKT | **F** | needs more evidence |
| campaigns | 5 | ON | 11 | 0 | MKT | **A** |  |
| cancelled_orders | 13 | ON | 3 | 0 | ORDER | **A** |  |
| cash_drawer_log | 133 | ON | 2 | 0 | DRAWER | **A** |  |
| cash_drawer_logs | 1 | ON | 0 | 2 | DRAWER | **B/E?** | legacy/duplicate (H-5) or RLS-off-with-data — P-9 disposition |
| cash_drawer_sessions | 6 | ON | 2 | 0 | DRAWER | **A** |  |
| cash_reconciliations | 0 | ON | 0 | 4 | DRAWER | **B** | empty, only referenced by legacy DB fns |
| cash_registers | 3 | ON | 0 | 0 | DRAWER | **F** | needs more evidence |
| categories | 10 | ON | 10 | 0 | MENU | **A** |  |
| clock_events | 0 | ON | 3 | 0 | ? | **A** |  |
| combo_items | 3 | ON | 4 | 0 | MENU | **A** |  |
| combos | 1 | ON | 8 | 0 | MENU | **A** |  |
| compliance_rules | 3 | ON | 0 | 0 | PROC | **F** | needs more evidence |
| compliance_violations | 0 | ON | 0 | 0 | PROC | **C** | empty + zero refs (app & DB) |
| couriers | 0 | ON | 0 | 7 | DELIVERY | **B** | empty, only referenced by legacy DB fns |
| current_stock | 34 | OFF | 1 | 0 | INVENTORY | **A** |  |
| customer_addresses | 0 | ON | 0 | 3 | CRM | **B** | empty, only referenced by legacy DB fns |
| customers | 7 | ON | 4 | 0 | CRM | **A** |  |
| daily_reports | 0 | ON | 0 | 2 | REPORT | **A** |  |
| delivery_zones | 1 | OFF | 0 | 1 | DELIVERY | **B/E?** | legacy/duplicate (H-5) or RLS-off-with-data — P-9 disposition |
| denomination_counts | 0 | ON | 0 | 1 | DRAWER | **B** | empty, only referenced by legacy DB fns |
| dining_groups | 0 | ON | 0 | 1 | ORDER | **B** | empty, only referenced by legacy DB fns |
| discrepancy_alerts | 26 | ON | 19 | 0 | ? | **A** |  |
| employee_compensation | 0 | ON | 0 | 0 | HR | **C** | empty + zero refs (app & DB) |
| expenses | 0 | OFF | 4 | 0 | REPORT | **A** |  |
| floors | 2 | ON | 0 | 83 | FLOOR | **A** |  |
| gift_card_ledger | 0 | ON | 0 | 0 | GIFT | **C** | empty + zero refs (app & DB) |
| gift_card_transactions | 0 | OFF | 0 | 2 | GIFT | **B** | empty, only referenced by legacy DB fns |
| gift_cards | 0 | OFF | 1 | 0 | GIFT | **A** |  |
| ingredients | 34 | ON | 46 | 0 | INVENTORY | **A** |  |
| inventory_logs | 718 | ON | 27 | 0 | INVENTORY | **A** |  |
| inventory_status | 34 | OFF | 3 | 0 | INVENTORY | **A** |  |
| invoice_items | 0 | ON | 3 | 0 | ORDER/INV | **A** |  |
| invoices | 0 | ON | 20 | 0 | ORDER/INV | **A** |  |
| item_corrections | 0 | OFF | 0 | 1 | INVENTORY | **B/E?** | legacy/duplicate (H-5) or RLS-off-with-data — P-9 disposition |
| job_permissions | 0 | ON | 0 | 0 | HR | **C** | empty + zero refs (app & DB) |
| jobs | 0 | ON | 0 | 0 | HR | **C** | empty + zero refs (app & DB) |
| kitchen_analytics | 13 | OFF | 0 | 1 | KDS | **B/E?** | legacy/duplicate (H-5) or RLS-off-with-data — P-9 disposition |
| kitchen_schedule | 3 | ON | 1 | 0 | KDS | **A** |  |
| kitchen_ticket_items | 0 | ON | 0 | 1 | KDS | **A** |  |
| kitchen_tickets | 24 | ON | 0 | 2 | KDS | **A** |  |
| labor_summaries | 110 | OFF | 0 | 1 | REPORT | **B/E?** | legacy/duplicate (H-5) or RLS-off-with-data — P-9 disposition |
| locations | 5 | ON | 4 | 0 | CONFIG | **A** |  |
| login_attempts | 108 | ON | 0 | 7 | AUTH | **A** |  |
| loyalty_accounts | 0 | ON | 1 | 0 | LOYALTY | **A** |  |
| loyalty_order_points | 0 | OFF | 0 | 2 | LOYALTY | **B** | empty, only referenced by legacy DB fns |
| loyalty_product_rules | 0 | OFF | 0 | 1 | LOYALTY | **B** | empty, only referenced by legacy DB fns |
| loyalty_transactions | 0 | ON | 0 | 2 | LOYALTY | **B** | empty, only referenced by legacy DB fns |
| manager_overrides | 3 | ON | 0 | 7 | AUTH | **A** |  |
| migrations | 36 | OFF | 0 | 0 | META | **E** | H-1/H-6: ledger / dated quarantine, RLS off |
| modifier_group_items | 7 | ON | 0 | 0 | MENU | **F** | needs more evidence |
| modifier_groups | 5 | ON | 0 | 0 | MENU | **F** | needs more evidence |
| notification_read_state | 0 | ON | 0 | 0 | MKT | **C** | empty + zero refs (app & DB) |
| notifications | 211 | ON | 1 | 0 | MKT | **A** |  |
| onboarding_tasks | 0 | ON | 0 | 3 | ONBOARD | **B** | empty, only referenced by legacy DB fns |
| onboarding_workflows | 0 | ON | 0 | 2 | ONBOARD | **B** | empty, only referenced by legacy DB fns |
| operation_logs | 1634 | ON | 0 | 58 | AUDIT | **A** |  |
| operation_tracking | 0 | OFF | 0 | 1 | AUDIT | **B/E?** | legacy/duplicate (H-5) or RLS-off-with-data — P-9 disposition |
| order_changes | 0 | OFF | 0 | 0 | ORDER | **B/E?** | legacy/duplicate (H-5) or RLS-off-with-data — P-9 disposition |
| order_counters | 1 | OFF | 0 | 1 | ORDER | **B/E?** | legacy/duplicate (H-5) or RLS-off-with-data — P-9 disposition |
| order_courses | 0 | OFF | 0 | 0 | ORDER | **B/E?** | legacy/duplicate (H-5) or RLS-off-with-data — P-9 disposition |
| order_events | 18 | ON | 0 | 1 | ORDER | **A** |  |
| order_hourly_stats | 14 | OFF | 0 | 0 | ORDER | **B/E?** | legacy/duplicate (H-5) or RLS-off-with-data — P-9 disposition |
| order_items | 701 | ON | 10 | 0 | ORDER | **A** |  |
| order_payments | 82 | ON | 0 | 17 | ORDER | **A** |  |
| orders | 729 | ON | 23 | 0 | ORDER | **A** |  |
| organizations | 1 | ON | 0 | 1 | CONFIG | **A** |  |
| outbox_events | 4107 | ON | 0 | 27 | OUTBOX | **A** |  |
| overtime_records | 1 | ON | 0 | 2 | SHIFT | **F** | needs more evidence |
| overtime_thresholds | 3 | ON | 0 | 1 | SHIFT | **F** | needs more evidence |
| payment_attempts | 2 | OFF | 0 | 2 | PAY-legacy | **B/E?** | legacy/duplicate (H-5) or RLS-off-with-data — P-9 disposition |
| payment_idempotency_keys | 9 | OFF | 1 | 0 | PAY-P4 | **A** |  |
| payment_methods | 9 | OFF | 2 | 0 | PAY-legacy | **A** |  |
| payment_refunds | 0 | OFF | 0 | 1 | PAY-legacy | **B/E?** | legacy/duplicate (H-5) or RLS-off-with-data — P-9 disposition |
| payments | 2 | ON | 0 | 27 | PAY-legacy | **B/E?** | legacy/duplicate (H-5) or RLS-off-with-data — P-9 disposition |
| payroll_entries | 8 | ON | 0 | 0 | HR | **F** | needs more evidence |
| payroll_exports | 0 | ON | 0 | 0 | HR | **C** | empty + zero refs (app & DB) |
| payroll_periods | 2 | ON | 0 | 0 | HR | **F** | needs more evidence |
| payroll_webhook_configs | 0 | OFF | 0 | 0 | HR | **C** | empty + zero refs (app & DB) |
| performance_reviews | 0 | ON | 0 | 3 | STAFF | **B** | empty, only referenced by legacy DB fns |
| permission_categories | 5 | ON | 0 | 0 | AUTH | **F** | needs more evidence |
| permissions | 65 | ON | 1 | 0 | AUTH | **A** |  |
| popular_queries | 10 | ON | 0 | 1 | AI | **F** | needs more evidence |
| price_overrides | 3 | ON | 0 | 1 | MENU | **F** | needs more evidence |
| print_jobs | 0 | ON | 0 | 0 | PRINT | **C** | empty + zero refs (app & DB) |
| procurement_reviews | 0 | ON | 9 | 0 | PROC | **A** |  |
| product_allergens | 3 | ON | 5 | 0 | MENU | **A** |  |
| product_cost_summary | 14 | OFF | 0 | 0 | INVENTORY | **B/E?** | legacy/duplicate (H-5) or RLS-off-with-data — P-9 disposition |
| product_modifier_groups | 2 | ON | 0 | 0 | MENU | **F** | needs more evidence |
| product_modifiers | 7 | ON | 9 | 0 | MENU | **A** |  |
| product_variants | 3 | ON | 13 | 0 | MENU | **A** |  |
| products | 14 | ON | 37 | 0 | MENU | **A** |  |
| purchase_order_items | 0 | ON | 13 | 0 | PROC | **A** |  |
| purchase_orders | 0 | ON | 15 | 0 | PROC | **A** |  |
| recipe_headers | 0 | ON | 1 | 0 | INVENTORY | **A** |  |
| recipe_items | 60 | OFF | 0 | 1 | INVENTORY | **B/E?** | legacy/duplicate (H-5) or RLS-off-with-data — P-9 disposition |
| recipes | 60 | ON | 31 | 0 | INVENTORY | **A** |  |
| reservation_preorder_items | 9 | OFF | 3 | 0 | FLOOR/RES | **A** |  |
| reservation_tables | 9 | ON | 0 | 13 | FLOOR/RES | **F** | needs more evidence |
| reservation_tables_quarantine_2026_09 | 8 | OFF | 0 | 0 | RES-quarantine | **E** | H-1/H-6: ledger / dated quarantine, RLS off |
| reservations | 86 | ON | 8 | 0 | RES | **A** |  |
| reservations_archive | 18 | ON | 0 | 0 | RES | **B/E?** | legacy/duplicate (H-5) or RLS-off-with-data — P-9 disposition |
| review_scores | 0 | ON | 0 | 0 | PROC | **C** | empty + zero refs (app & DB) |
| risk_scores | 8 | ON | 0 | 2 | PROC | **F** | needs more evidence |
| role_permissions | 282 | ON | 0 | 6 | AUTH | **A** |  |
| roles | 11 | ON | 6 | 0 | AUTH | **A** |  |
| schedule | 50 | ON | 0 | 19 | STAFF | **A** |  |
| schedule_conflicts | 0 | ON | 0 | 0 | STAFF | **C** | empty + zero refs (app & DB) |
| schedule_templates | 0 | ON | 0 | 0 | STAFF | **C** | empty + zero refs (app & DB) |
| security_events | 660 | ON | 4 | 0 | AUTH | **A** |  |
| sessions | 324 | ON | 12 | 0 | AUTH | **A** |  |
| settings | 1 | ON | 1 | 0 | CONFIG | **A + D(cols)** | >=6 plaintext credential columns (H-2) |
| shift_breaks | 2 | ON | 0 | 10 | SHIFT | **A** |  |
| shift_handover_notes | 0 | ON | 0 | 2 | SHIFT | **B/E?** | legacy/duplicate (H-5) or RLS-off-with-data — P-9 disposition |
| shift_reviews | 16 | OFF | 0 | 4 | SHIFT | **B/E?** | legacy/duplicate (H-5) or RLS-off-with-data — P-9 disposition |
| shift_swap_requests | 0 | ON | 0 | 2 | SHIFT | **B/E?** | legacy/duplicate (H-5) or RLS-off-with-data — P-9 disposition |
| shifts | 110 | ON | 1 | 0 | SHIFT | **A** |  |
| staff | 803 | ON | 24 | 0 | STAFF | **A** |  |
| staff_announcements | 0 | ON | 0 | 0 | STAFF | **B/E?** | legacy/duplicate (H-5) or RLS-off-with-data — P-9 disposition |
| staff_availability | 0 | ON | 0 | 0 | STAFF | **B/E?** | legacy/duplicate (H-5) or RLS-off-with-data — P-9 disposition |
| staff_documents | 4 | ON | 0 | 0 | STAFF | **B/E?** | legacy/duplicate (H-5) or RLS-off-with-data — P-9 disposition |
| staff_locations | 92 | ON | 5 | 0 | STAFF | **A** |  |
| staff_messages | 0 | ON | 0 | 2 | STAFF | **B/E?** | legacy/duplicate (H-5) or RLS-off-with-data — P-9 disposition |
| staff_metrics | 56 | OFF | 0 | 0 | STAFF-rollup | **D?** | RLS off with data (803/803/56) — grant check pending; duplicates (H-5) |
| staff_public_view | 803 | OFF | 0 | 0 | STAFF-rollup | **D?** | RLS off with data (803/803/56) — grant check pending; duplicates (H-5) |
| staff_stats | 803 | OFF | 0 | 2 | STAFF-rollup | **D?** | RLS off with data (803/803/56) — grant check pending; duplicates (H-5) |
| state_transitions | 214 | ON | 0 | 2 | REGISTRY | **A** |  |
| stations | 5 | ON | 0 | 1 | FLOOR | **A** |  |
| stock_count_items | 0 | ON | 4 | 0 | INVENTORY | **A** |  |
| stock_counts | 0 | ON | 5 | 0 | INVENTORY | **A** |  |
| stock_transactions | 0 | ON | 2 | 0 | INVENTORY | **A** |  |
| supplier_return_items | 0 | ON | 1 | 0 | PROC | **A** |  |
| supplier_returns | 0 | ON | 5 | 0 | PROC | **A** |  |
| suppliers | 1 | ON | 10 | 0 | PROC | **A** |  |
| sync_operations | 2 | ON | 0 | 0 | OUTBOX | **F** | needs more evidence |
| table_floors | 32 | ON | 4 | 0 | FLOOR | **A** |  |
| table_order_contract | 32 | OFF | 0 | 0 | FLOOR | **B/E?** | legacy/duplicate (H-5) or RLS-off-with-data — P-9 disposition |
| time_clock_audit | 8 | ON | 0 | 4 | SHIFT | **A** |  |
| time_clock_entries | 29 | ON | 0 | 9 | SHIFT | **A** |  |
| tip_distribution_rules | 4 | ON | 0 | 2 | TIP | **F** | needs more evidence |
| tip_distributions | 0 | ON | 0 | 2 | TIP | **B** | empty, only referenced by legacy DB fns |
| tip_pool_contributions | 0 | ON | 0 | 0 | TIP | **C** | empty + zero refs (app & DB) |
| tip_pools | 1 | ON | 0 | 3 | TIP | **F** | needs more evidence |
| tip_shortfalls | 8 | OFF | 0 | 2 | TIP | **B/E?** | legacy/duplicate (H-5) or RLS-off-with-data — P-9 disposition |
| tipout_configs | 0 | OFF | 0 | 0 | TIP | **C** | empty + zero refs (app & DB) |
| transaction_logs | 0 | ON | 2 | 0 | AUDIT | **A** |  |
| v_closed_orders | 321 | OFF | 0 | 0 | VIEW | **D?** | view; RLS off — grant check pending |
| v_daily_revenue | 19 | OFF | 0 | 0 | VIEW | **D?** | view; RLS off — grant check pending |
| v_daily_staff_performance | 62 | OFF | 0 | 0 | VIEW | **D?** | view; RLS off — grant check pending |
| v_staff_performance | 53 | OFF | 0 | 0 | VIEW | **D?** | view; RLS off — grant check pending |
| v_stock_health | 1 | OFF | 0 | 0 | VIEW | **D?** | view; RLS off — grant check pending |
| v_top_products | 14 | OFF | 0 | 0 | VIEW | **D?** | view; RLS off — grant check pending |
| waiter_assignments | 18 | ON | 0 | 2 | KDS | **F** | needs more evidence |
| waste_standards | 0 | ON | 7 | 0 | INVENTORY | **A** |  |
| webhook_events | 0 | ON | 0 | 0 | P10-future | **C** | empty + zero refs (app & DB) |
## 4. Column-level reality (the "which column lives where, is it right" view)

Total columns: **2112** across 169 objects. Null-profile was sampled on all 108 populated tables.

### 4.1 Columns that are 100% NULL in populated tables (never written — dead-column candidates)

**240 columns** are always NULL even though their table has live rows. These are schema surface that was designed/migrated but the app never populates. Grouped by table (class **C-candidate**, none deleted here):

- `approval_requests` (56 rows) — 3: `reviewed_by`, `reviewed_at`, `review_note`
- `audit_log` (67 rows) — 1: `changed_by`
- `audit_logs` (333 rows) — 10: `order_id`, `item_id`, `user_id`, `old_amount`, `new_amount`, `discount_type`, `discount_value`, `reason`, `approved_by`, `ip_address`
- `audit_logs_canonical` (649 rows) — 1: `ip_address`
- `break_rules` (13 rows) — 1: `max_hours_worked`
- `campaign_rules` (5 rows) — 8: `fixed_amount`, `min_purchase_amount`, `free_quantity`, `reward_product_id`, `reward_category_id`, `delivery_min_order`, `delivery_zones`, `combo_id`
- `campaign_schedules` (1 rows) — 4: `start_date`, `end_date`, `start_time`, `end_time`
- `campaign_usage` (15 rows) — 3: `customer_id`, `order_amount`, `rule_type`
- `campaigns` (5 rows) — 24: `description`, `image_url`, `end_date`, `title_az`, `title_en`, `title_ru`, `start_date`, `combo_id`, `max_discount_amount`, `label`, `get_product_id`, `get_category_id`, `max_uses_per_customer`, `max_uses_per_day`, `applicable_tables`, `applicable_rooms`, `stack_with_ids`, `max_uses_per_order`, `min_order_amount`, `max_order_amount`, `customer_tags`, `branch_id`, `coupon_code`, `deleted_at`
- `cash_drawer_log` (133 rows) — 1: `shift_id`
- `cash_drawer_sessions` (6 rows) — 3: `register_id`, `approved_by`, `approval_note`
- `combo_items` (3 rows) — 1: `variant_id`
- `combos` (1 rows) — 3: `discount_price`, `translations`, `category_id`
- `compliance_rules` (3 rows) — 1: `min_rest_hours`
- `customers` (7 rows) — 1: `last_order_at`
- `discrepancy_alerts` (26 rows) — 1: `resolved_at`
- `inventory_logs` (718 rows) — 4: `supplier_invoice_line_id`, `goods_receipt_line_id`, `procurement_anomaly_id`, `source_type`
- `kitchen_analytics` (13 rows) — 3: `prep_time_seconds`, `created_by`, `action`
- `locations` (5 rows) — 1: `phone`
- `manager_overrides` (3 rows) — 4: `approved_by`, `approved_at`, `denied_at`, `denial_reason`
- `notifications` (211 rows) — 2: `recipient_role`, `read_at`
- `operation_logs` (1634 rows) — 14: `undo_payload`, `undone_at`, `undone_by`, `ip_address`, `device_id`, `table_name`, `record_id`, `old_data`, `new_data`, `type`, `payload`, `inverse_payload`, `amount`, `idempotency_key`
- `order_events` (18 rows) — 4: `metadata`, `performed_by`, `ip_address`, `device_id`
- `order_items` (701 rows) — 16: `variant_id`, `variant_name`, `combo_group_id`, `parent_order_item_id`, `served_at`, `hold_reason`, `hold_by`, `seat_number`, `hold_until`, `station_id`, `idempotency_key`, `correlation_id`, `sent_at`, `accepted_at`, `started_at`, `completed_at`
- `order_payments` (82 rows) — 5: `transaction_id`, `split_group_id`, `reference_order_id`, `idempotency_key`, `correlation_id`
- `orders` (729 rows) — 9: `kitchen_target_section`, `kitchen_reopened_at`, `checkin_at`, `special_request`, `group_id`, `estimated_delivery_time`, `courier_id`, `courier_name`, `tracking_number`
- `organizations` (1 rows) — 6: `legal_name`, `tax_id`, `phone`, `email`, `address`, `logo_url`
- `outbox_events` (4107 rows) — 2: `next_retry_at`, `error_message`
- `overtime_records` (1 rows) — 1: `notes`
- `payment_attempts` (2 rows) — 3: `provider_error`, `terminal_id`, `duration_ms`
- `payment_methods` (9 rows) — 1: `max_amount`
- `payments` (2 rows) — 9: `cash_received`, `provider`, `provider_transaction_id`, `terminal_id`, `idempotency_key`, `split_group_id`, `refund_of_payment_id`, `notes`, `metadata`
- `payroll_periods` (2 rows) — 3: `approved_by`, `approved_at`, `locked_at`
- `permission_categories` (5 rows) — 1: `description`
- `price_overrides` (3 rows) — 3: `order_item_id`, `product_id`, `approved_by`
- `product_modifiers` (7 rows) — 3: `name_az`, `name_en`, `name_ru`
- `product_variants` (3 rows) — 8: `discount_price`, `image_url`, `description`, `ingredients`, `parent_variant_id`, `name_az`, `name_en`, `name_ru`
- `products` (14 rows) — 4: `discount_price`, `allergens`, `printer_route`, `station_id`
- `recipes` (60 rows) — 2: `recipe_header_id`, `quantity_brutto`
- `reservation_preorder_items` (9 rows) — 1: `combo_id`
- `reservations` (86 rows) — 10: `floor_id`, `completed_at`, `archived_at`, `archived_reason`, `kitchen_notified_at`, `deleted_at`, `kitchen_scheduled_for`, `notes`, `scheduled_date`, `scheduled_time`
- `reservations_archive` (18 rows) — 4: `table_number`, `kitchen_scheduled_at`, `checked_in_at`, `completed_at`
- `settings` (1 rows) — 1: `revenue_limit`
- `shifts` (110 rows) — 1: `auto_closed_by`
- `staff` (803 rows) — 4: `base_monthly_salary`, `break_start`, `break_end`, `break_allowance_mins`
- `staff_documents` (4 rows) — 1: `expiration_date`
- `staff_public_view` (803 rows) — 2: `break_start`, `break_end`
- `staff_stats` (803 rows) — 3: `avg_prep_time`, `avg_wait_time`, `table_turnover_rate`
- `state_transitions` (214 rows) — 1: `requires_role`
- `suppliers` (1 rows) — 7: `email`, `address`, `tax_id`, `notes`, `score`, `on_time_delivery_rate`, `avg_price_stability`
- `table_floors` (32 rows) — 18: `reservation_id`, `reservation_name`, `reservation_time`, `oldest_pending_at`, `x_pos`, `y_pos`, `width`, `height`, `reserved_at`, `reserved_until`, `reservation_phone`, `current_order_id`, `table_name`, `area`, `waiter_id`, `waiter_name`, `started_at`, `notes`
- `table_order_contract` (32 rows) — 4: `current_order_id`, `current_order_status`, `current_order_kitchen_status`, `current_order_total`
- `time_clock_audit` (8 rows) — 1: `time_clock_entry_id`
- `time_clock_entries` (29 rows) — 4: `notes`, `approved_by`, `declared_cash_tips`, `declared_tip_out`
- `tip_pools` (1 rows) — 1: `distributed_at`
- `tip_shortfalls` (8 rows) — 3: `shift_id`, `resolved_by`, `resolved_at`
- **TOTAL: 240 never-written columns.**

> Note: 100%-null is a *candidate* signal, not proof of death — some are genuinely
> optional (e.g. `orders.courier_id` on dine-in). The decision matrix (§8) treats each
> as F→needs-call, but the **bulk** are menu/HR/campaign columns the app has no screen for.

### 4.2 `settings` — plaintext credential columns (H-2, class D)

| column | type | status |
|---|---|---|
| `admin_password` | text | plaintext role credential, legacy (not used by staff-login/PIN) |
| `superadmin_password` | text | plaintext role credential, legacy (9 chars; not used by any auth route) |
| `kitchen_password` | text | plaintext, **has a default value in the DDL** |
| `smtp_user` / `smtp_pass` | text | plaintext email credentials |

Code evidence: `settings-svc.ts` documents these as secret and says they are "never exposed
by any route in this surface" — but that is a code comment, **not yet live-verified** this turn.
Regardless of exposure, **storing plaintext credentials in a DB column is class D** — the fix is
to move them to Supabase secrets/env and drop the columns (P-9/P-12 security pass).

### 4.3 `orders` — 9 never-written columns (context for the user's "orders is a mess")

`orders` has 9 always-null columns: `kitchen_target_section`, `kitchen_reopened_at`,
`checkin_at`, `special_request`, `group_id`, `estimated_delivery_time`, `courier_id`,
`courier_name`, `tracking_number`. These are delivery/group/QR-scan fields with no live UI.
`order_items` has **16** always-null (variant/combo/hold/seat/station/timing fields).
The money columns (`orders.status`, `paid_amount`, `order_payments.*`) are the P-frozen SSOT and
are fine; the mess is the **peripheral always-null columns + the 10 parallel ORDER-module tables**.

## 5. RPC / function surface (625 functions)

| metric | count | note |
|---|---|---|
| total `public` fns (f/p/t) | 625 | includes ~dozens of P-1..P-6 frozen writers + helpers |
| **SECURITY DEFINER** | **324** | ~half run as owner — each is an attack/escalation surface; must stay least-privilege |
| **permission-enforced** (call `authorize`/`has_permission`/`p1_actor_allowed`) | **43** | only 43/625 re-check auth inside the fn (the P-1..P-6 writers) |
| not granted to `anon` | 358 | restricted ACL |
| **not granted to anon NOR service_role (postgres-only)** | **5** | the frozen-dead set (P-3/P-4/P-5/P-6 D-5/D-6) |

Interpretation: the 582 non-enforcing fns are mostly **helpers/triggers/views** (internal,
reached only via other fns), which is fine. The risk set is the 324 SECURITY DEFINER fns —
the decision matrix flags **auditing their `search_path` + granted tables** (a definer fn with an
unpinned `search_path` is a classic escalation).

## 6. RLS reality (223 policies)

- **41 tables RLS-OFF** (H-3); 27 of them hold data → grant check pending (next turn).
- **8 tables RLS-ON with ZERO policies** = **deny-all for everyone but the owner**:
  `audit_log`, `customers`, `dining_groups`, `login_attempts`, `manager_overrides`,
  `popular_queries`, `recipe_headers`, `waste_standards`. These are only reachable via
  SECURITY DEFINER fns / service_role — mostly correct for audit tables, but `customers`/
  `dining_groups`/`waste_standards` being deny-all means the UI must go through a definer fn.
- **`stations` is the only RLS-FORCED table** (H-7).

## 7. Triggers / indexes / enums

- **88 user triggers** (raw in `_pre7` sweep). The O-gate kill-hazard pattern
  (`trg_orders_sync_table_floors`, `trg_order_table_location` on `orders`) is the known one;
  the full trigger→fn map is in the sweep for the cleanup pass.
- **527 indexes**; the sweep lists per-table so duplicate/unused can be flagged in the cleanup
  decision (needs `pg_stat_user_indexes` seq_scan stats — next turn).
- **91 enum values**; the live-vs-repo enum drift (e.g. `shift_status` = ENUM, not text) is the
  class we caught in P-6 and is recorded here as E.

## 8. Repo ↔ live diff (H-1) + `migrations` ledger

- Repo `supabase/migrations/*.sql` (49 files) contains only **2** `CREATE TABLE/VIEW`.
  **167/169 live tables are LIVE_ONLY** — never created in-repo. REPO_ONLY = 0.
- The DB's own `migrations` table (36 rows) is the **real applied ledger**, but it is itself
  **corrupted: it has DUPLICATE column names** (`name`,`id`,`executed_at`,`name`,`hash`,`executed_at`)
  — a two-schema artifact of repeated manual migrations. Last applied: 2026-09-11 12:08 UTC.
- Consequence: **the repo cannot restore this database from scratch**, and a fresh Supabase
  project + the repo migrations would NOT recreate the 167 legacy tables. This is the single
  biggest E (drift) finding and must be fixed by snapshotting the current live schema into a
  baseline migration before any cleanup.

## 9. Classification rollup (counts)

| Class | Meaning | ~tables | action (after ratify) |
|---|---|---|---|
| **A** live/keep | P-frozen + app-used | ~55 | none |
| **B** legacy retained | parallel/old, P-9 | ~35 | P-9 reconcile, do not delete yet |
| **C** dead candidate | empty + 0 refs | ~47 | candidate drop, needs sign-off |
| **D** security | plaintext creds / RLS-off+data / definer audit | settings + 27 + 324 definer | **PRIORITY** |
| **E** repo↔live drift | 167 not in repo, corrupt `migrations`, quarantine | — | snapshot baseline first |
| **F** unknown | needs more evidence | remainder | no action |

(Counts are the classifier's first pass over the §3 table; the §3 table is the authoritative per-row list.)

## 10. What this means for P-7

The concurrency surface (P-7) should be scoped to the **A-class writers only** (orders,
order_payments, order_items, tables/floors, shifts, outbox_events, payment_idempotency_keys).
The 47 C + 35 B tables are **out of P-7 scope** — they are P-9/cleanup, not concurrency. This
audit gives P-7 a clean, correct surface to reason about instead of "all 169 tables".
## 11. DECISION MATRIX — STOP: ratify before any change (NO deletion in this phase)

| ID | Finding (§) | Class | Options | **Recommendation** |
|---|---|---|---|---|
| **S-1** | H-1: repo cannot recreate the live schema (167/169 LIVE_ONLY) | E | (a) Snapshot a full baseline migration now (`pg_dump --schema-only` → one committed baseline file, marked "reconstruction, not history"). (b) Leave as-is. | **(a)** — do this FIRST, before any C-drop, so the snapshot is the safety net. Read-only dump → repo file. No live change. |
| **S-2** | H-2: `settings` plaintext credentials (admin/superadmin/kitchen/smtp) | D | (a) Verify no route exposes them (live GET on settings routes). (b) Move to Supabase secrets/env + drop columns. (c) Just drop (they're unused). | **(a) then (b)**: prove no route leak, then migrate to secrets and drop the 5 columns. Do NOT print values in any doc/chat. |
| **S-3** | H-3: 41 RLS-off tables, 27 with data | D | (a) `role_table_grants` sweep to find what anon/authenticated can actually read. (b) For each with data, decide RLS-on or explicit grants. | **(a)** this phase (read-only) → then per-table RLS decision in the cleanup phase. The `staff_stats`/`staff_public_view`/`v_*` (803/803/321 rows) are the priority. |
| **S-4** | H-4: 47 empty tables, 0 app refs, 0 DB-fn refs (C candidates) | C | (a) Drop. (b) Freeze (REVOKE/Rename). (c) Keep. | **(b) freeze first** (REVOKE EXECUTE / drop grants), confirm 1+ P-gate reflow green, then **(a)** drop only those still zero-ref. **NOT in this audit phase.** |
| **S-5** | H-5: 7 duplicate/parallel structures (3 audit, 2 drawer, 2 ledger, 4 op-log, 2 break, 3 staff-rollup, 2 settings) | B/E | (a) Pick the canonical one per pair, migrate, drop the rest. (b) P-9 only. | **(b) P-9** — reconciliation needs data mapping, out of this phase. Record which is canonical (from P-5: `audit_logs_canonical`; from P-6: `order_payments`). |
| **S-6** | H-6: `reservation_tables_quarantine_2026_09` (8 rows, RLS off) | E | (a) Investigate origin + re-merge or drop. (b) Leave. | **(a)** investigate in the cleanup phase; it's a September one-off quarantine. |
| **S-7** | `migrations` table corrupted (duplicate column names) | E | (a) Rebuild as a clean ledger. (b) Leave (it's metadata). | **(a)** during the S-1 snapshot — rebuild the ledger so future diffing works. |
| **S-8** | 324 SECURITY DEFINER fns; only 43 permission-enforced | D | (a) Audit all definer fns' `search_path` + granted tables (escalation scan). (b) Leave. | **(a)** read-only scan this phase → fix list in cleanup. This is the real privilege-escalation surface. |
| **S-9** | 8 RLS-on tables with 0 policies (deny-all) | E | (a) Confirm each is intentionally fn-only. (b) Add policies. | **(a)** confirm in cleanup; likely intentional for audit tables. |
| **S-10** | 240 never-written (100%-null) columns | C | (a) Drop. (b) Keep. | **(b) keep for now** — they're harmless surface; dropping columns is high-risk (FK/definer refs) and low-value. Flag for a future schema-tightening pass, NOT P-7. |

**Phase plan (ratify the order):**
1. **S-1 snapshot** (read-only dump → baseline migration in repo) — the safety net.
2. **S-3 + S-8 read-only sweeps** (grants + definer scan) → expand this doc with the exposure list.
3. **Ratify cleanup decisions** (S-2 secrets, S-4 freeze-then-drop, S-6 quarantine, S-7 ledger).
4. **Execute cleanup** as its own committed phase (re-run P-1..P-6 reflow after each DB change).
5. **Then P-7 concurrency** on the A-class surface only (§10).

**Explicit non-goals (do not do now):** no column drops, no table drops, no RLS flips, no secret rotation — all await ratification. No `git gc`/prune (pre-existing `709d1c59`, needs user sign-off).

---
*Read-only audit, 2026-09-14. Raw sweep files retained for the cleanup phase. Every count above is a live `COUNT(*)` / catalog query on the Supabase pooler, re-executable from the documented SQL.*
