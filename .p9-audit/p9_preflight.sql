-- P-9 IMPLEMENTATION PREFLIGHT (READ-ONLY) — 2026-09-17
-- All statements are SELECT/EXPLAIN. Evidence for the P-9 implementation plan.

\echo '=== P1: pg_attribute OID of drop candidates ==='
SELECT 'orders.items' AS target, a.attoid FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid WHERE c.relname='orders' AND a.attname='items' AND a.attnum>0;
SELECT 'app_settings.'||a.attname AS target, a.attoid FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid WHERE c.relname='app_settings' AND a.attname IN ('receipt_staff_name','receipt_payment_method','cash_close_variance_threshold','cash_close_manager_required') AND a.attnum>0;

\echo '=== P2: who depends on those columns (pg_depend, exact) ==='
SELECT col.target,
       COALESCE(string_agg(DISTINCT obj.name, ', '), 'NO_DEPENDENTS') AS dependents
FROM (
  SELECT a.attoid AS oid, 'orders.items' AS target FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid WHERE c.relname='orders' AND a.attname='items' AND a.attnum>0
  UNION ALL
  SELECT a.attoid, 'app_settings.'||a.attname FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid WHERE c.relname='app_settings' AND a.attname IN ('receipt_staff_name','receipt_payment_method','cash_close_variance_threshold','cash_close_manager_required') AND a.attnum>0
) col
LEFT JOIN pg_depend d ON d.refobjid = col.oid AND d.classid='pg_attribute'::regclass AND d.refobjsubid=0
LEFT JOIN (
  SELECT oid, proname AS name FROM pg_proc
  UNION ALL SELECT oid, viewname FROM pg_views
  UNION ALL SELECT oid, relname FROM pg_class
  UNION ALL SELECT oid, tgname FROM pg_trigger
) obj ON obj.oid = d.objid
GROUP BY col.target;

\echo '=== P3: table-level deps for dead-table candidates ==='
SELECT t.relname AS target,
       COALESCE(string_agg(DISTINCT obj.name, ', '), 'NO_DEPENDENTS') AS dependents
FROM pg_class t
JOIN pg_namespace n ON n.oid=t.relnamespace AND n.nspname='public'
LEFT JOIN pg_depend d ON d.refobjid=t.oid AND d.classid='pg_class'::regclass AND d.refobjsubid=0 AND d.deptype IN ('n','a','i')
LEFT JOIN (
  SELECT oid, proname AS name FROM pg_proc
  UNION ALL SELECT oid, viewname FROM pg_views
  UNION ALL SELECT oid, relname FROM pg_class WHERE relkind IN ('r','m','v','f','p')
  UNION ALL SELECT oid, tgname FROM pg_trigger
  UNION ALL SELECT oid, conname FROM pg_constraint
) obj ON obj.oid=d.objid
WHERE t.relname IN ('waiter_assignments','dining_groups','audit_log','sync_operations','popular_queries','reservations_archive')
GROUP BY t.relname ORDER BY t.relname;

\echo '=== P4: FK-orphan counts for the 16 safe-FK candidates ==='
SELECT 'current_stock.ingredient_id' AS fk, count(*) AS orphans FROM current_stock cs WHERE cs.ingredient_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ingredients i WHERE i.id=cs.ingredient_id)
UNION ALL SELECT 'expenses.staff_id', count(*) FROM expenses e WHERE e.staff_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM staff s WHERE s.id=e.staff_id)
UNION ALL SELECT 'order_items.variant_id', count(*) FROM order_items oi WHERE oi.variant_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM product_variants v WHERE v.id=oi.variant_id)
UNION ALL SELECT 'reservations.floor_id', count(*) FROM reservations r WHERE r.floor_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM table_floors f WHERE f.id=r.floor_id)
UNION ALL SELECT 'table_floors.current_order_id', count(*) FROM table_floors f WHERE f.current_order_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.id=f.current_order_id)
UNION ALL SELECT 'payments.refund_of_payment_id', count(*) FROM payments p WHERE p.refund_of_payment_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM order_payments op WHERE op.id=p.refund_of_payment_id)
UNION ALL SELECT 'price_overrides.order_item_id', count(*) FROM price_overrides po WHERE po.order_item_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM order_items oi WHERE oi.id=po.order_item_id)
UNION ALL SELECT 'price_overrides.product_id', count(*) FROM price_overrides po WHERE po.product_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM products pr WHERE pr.id=po.product_id)
UNION ALL SELECT 'staff_metrics.staff_id', count(*) FROM staff_metrics sm WHERE sm.staff_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM staff s WHERE s.id=sm.staff_id)
UNION ALL SELECT 'staff_stats.staff_id', count(*) FROM staff_stats ss WHERE ss.staff_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM staff s WHERE s.id=ss.staff_id)
UNION ALL SELECT 'labor_summaries.staff_id', count(*) FROM labor_summaries ls WHERE ls.staff_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM staff s WHERE s.id=ls.staff_id)
UNION ALL SELECT 'login_attempts.staff_id', count(*) FROM login_attempts la WHERE la.staff_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM staff s WHERE s.id=la.staff_id)
UNION ALL SELECT 'notification_read_state.user_id', count(*) FROM notification_read_state nrs WHERE nrs.user_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM staff s WHERE s.id=nrs.user_id)
UNION ALL SELECT 'combos.category_id', count(*) FROM combos cb WHERE cb.category_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM categories ct WHERE ct.id=cb.category_id)
UNION ALL SELECT 'recipe_items.ingredient_id', count(*) FROM recipe_items ri WHERE ri.ingredient_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ingredients i WHERE i.id=ri.ingredient_id)
UNION ALL SELECT 'recipe_items.product_id', count(*) FROM recipe_items ri WHERE ri.product_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM products p WHERE p.id=ri.product_id)
UNION ALL SELECT 'cash_drawer_log.order_id', count(*) FROM cash_drawer_log l WHERE l.order_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.id=l.order_id)
UNION ALL SELECT 'order_payments.reference_order_id', count(*) FROM order_payments op WHERE op.reference_order_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.id=op.reference_order_id);

\echo '=== P5: staff fixture purge preflight (FK residue per child table) ==='
WITH fx AS (SELECT id FROM staff WHERE is_active=false AND (name ~ '^[A-Z0-9_]{1,4}_' OR name ~ '^G2mt' OR name LIKE 'P8\_S%'))
SELECT 'fixture staff count' AS metric, count(*)::text FROM fx
UNION ALL SELECT 'shifts residue', (SELECT count(*) FROM shifts s WHERE s.staff_id IN (SELECT id FROM fx))::text
UNION ALL SELECT 'time_clock_entries', (SELECT count(*) FROM time_clock_entries t WHERE t.staff_id IN (SELECT id FROM fx))::text
UNION ALL SELECT 'time_clock_audit', (SELECT count(*) FROM time_clock_audit t WHERE t.performed_by IN (SELECT id FROM fx))::text
UNION ALL SELECT 'sessions', (SELECT count(*) FROM sessions s WHERE s.user_id IN (SELECT id FROM fx))::text
UNION ALL SELECT 'staff_locations', (SELECT count(*) FROM staff_locations l WHERE l.staff_id IN (SELECT id FROM fx))::text
UNION ALL SELECT 'shift_breaks', (SELECT count(*) FROM shift_breaks b JOIN shifts s ON s.id=b.shift_id WHERE s.staff_id IN (SELECT id FROM fx))::text
UNION ALL SELECT 'cash_drawer_sessions opened_by', (SELECT count(*) FROM cash_drawer_sessions d WHERE d.opened_by IN (SELECT id FROM fx))::text
UNION ALL SELECT 'cash_drawer_log created_by', (SELECT count(*) FROM cash_drawer_log l WHERE l.created_by IN (SELECT id FROM fx))::text
UNION ALL SELECT 'security_events', (SELECT count(*) FROM security_events e WHERE e.staff_id IN (SELECT id FROM fx))::text
UNION ALL SELECT 'overtime_records', (SELECT count(*) FROM overtime_records o JOIN shifts s ON s.id=o.shift_id WHERE s.staff_id IN (SELECT id FROM fx))::text
UNION ALL SELECT 'orders created_by', (SELECT count(*) FROM orders o WHERE o.created_by IN (SELECT id FROM fx))::text
UNION ALL SELECT 'daily_reports', (SELECT count(*) FROM daily_reports r WHERE r.created_by IN (SELECT id FROM fx))::text;

\echo '=== P6: who writes/reads audit stores ==='
SELECT 'audit_logs_canonical sample actions' AS k, string_agg(DISTINCT action, ', ') FROM audit_logs_canonical LIMIT 1;
SELECT 'audit_logs (compat) sample actions' AS k, string_agg(DISTINCT action, ', ') FROM audit_logs LIMIT 1;
SELECT 'audit_log (dead) sample actions' AS k, string_agg(DISTINCT action, ', ') FROM audit_log LIMIT 1;

\echo '=== P7: popular_queries writer (function refs) ==='
SELECT COALESCE(string_agg(DISTINCT p.proname, ', '), 'NO_FUNCTION_REF') FROM pg_proc p WHERE p.prosrc LIKE '%popular_queries%' AND p.prokind='f';

\echo '=== P8: P-2 gate test_rls_role usage ==='
SELECT 'grep below (see shell output)' AS note;
