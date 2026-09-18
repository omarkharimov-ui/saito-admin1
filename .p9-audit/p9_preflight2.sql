-- P-9 PREFLIGHT round 2 (fixed for this PG version; READ-ONLY)

\echo '=== P2b: column-level deps (pg_depend refobjid=table, refobjsubid=attnum) ==='
WITH cols AS (
  SELECT 'orders.items' AS target, c.oid AS trelid, a.attnum FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid WHERE c.relname='orders' AND a.attname='items' AND a.attnum>0
  UNION ALL
  SELECT 'app_settings.'||a.attname, c.oid, a.attnum FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid WHERE c.relname='app_settings' AND a.attname IN ('receipt_staff_name','receipt_payment_method','cash_close_variance_threshold','cash_close_manager_required') AND a.attnum>0
)
SELECT cols.target,
       COALESCE(string_agg(DISTINCT obj.name, ', '), 'NO_DEPENDENTS') AS dependents
FROM cols
LEFT JOIN pg_depend d ON d.refobjid=cols.trelid AND d.refobjsubid=cols.attnum AND d.classid='pg_class'::regclass
LEFT JOIN (
  SELECT p.oid, p.proname AS name FROM pg_proc p
  UNION ALL SELECT v.oid, v.relname FROM pg_class v WHERE v.relkind IN ('v','m')
  UNION ALL SELECT t.oid, t.tgname FROM pg_trigger t
  UNION ALL SELECT x.oid, x.conname FROM pg_constraint x
) obj ON obj.oid=d.objid
GROUP BY cols.target ORDER BY cols.target;

\echo '=== P3b: table-level deps (fixed) ==='
SELECT t.relname AS target,
       COALESCE(string_agg(DISTINCT obj.name, ', '), 'NO_DEPENDENTS') AS dependents
FROM pg_class t
JOIN pg_namespace n ON n.oid=t.relnamespace AND n.nspname='public'
LEFT JOIN pg_depend d ON d.refobjid=t.oid AND d.classid='pg_class'::regclass AND d.refobjsubid=0 AND d.deptype IN ('n','a','i')
LEFT JOIN (
  SELECT p.oid, p.proname AS name FROM pg_proc p
  UNION ALL SELECT v.oid, v.relname FROM pg_class v WHERE v.relkind IN ('v','m')
  UNION ALL SELECT tt.oid, tt.tgname FROM pg_trigger tt
  UNION ALL SELECT x.oid, x.conname FROM pg_constraint x
) obj ON obj.oid=d.objid
WHERE t.relname IN ('waiter_assignments','dining_groups','audit_log','sync_operations','popular_queries','reservations_archive','waiter_assignments')
GROUP BY t.relname ORDER BY t.relname;

\echo '=== P5b: staff fixture FK residue (fixed daily_reports col) ==='
WITH fx AS (SELECT id FROM staff WHERE is_active=false AND (name ~ '^[A-Z0-9_]{1,4}_' OR name ~ '^G2mt' OR name LIKE 'P8\_S%'))
SELECT 'fixture staff count' AS metric, count(*)::text FROM fx
UNION ALL SELECT 'shifts', (SELECT count(*) FROM shifts s WHERE s.staff_id IN (SELECT id FROM fx))::text
UNION ALL SELECT 'time_clock_entries', (SELECT count(*) FROM time_clock_entries t WHERE t.staff_id IN (SELECT id FROM fx))::text
UNION ALL SELECT 'time_clock_audit', (SELECT count(*) FROM time_clock_audit t WHERE t.performed_by IN (SELECT id FROM fx))::text
UNION ALL SELECT 'sessions', (SELECT count(*) FROM sessions s WHERE s.user_id IN (SELECT id FROM fx))::text
UNION ALL SELECT 'staff_locations', (SELECT count(*) FROM staff_locations l WHERE l.staff_id IN (SELECT id FROM fx))::text
UNION ALL SELECT 'shift_breaks', (SELECT count(*) FROM shift_breaks b JOIN shifts s ON s.id=b.shift_id WHERE s.staff_id IN (SELECT id FROM fx))::text
UNION ALL SELECT 'cash_drawer_sessions', (SELECT count(*) FROM cash_drawer_sessions d WHERE d.opened_by IN (SELECT id FROM fx))::text
UNION ALL SELECT 'cash_drawer_log', (SELECT count(*) FROM cash_drawer_log l WHERE l.created_by IN (SELECT id FROM fx))::text
UNION ALL SELECT 'security_events', (SELECT count(*) FROM security_events e WHERE e.staff_id IN (SELECT id FROM fx))::text
UNION ALL SELECT 'overtime_records', (SELECT count(*) FROM overtime_records o JOIN shifts s ON s.id=o.shift_id WHERE s.staff_id IN (SELECT id FROM fx))::text
UNION ALL SELECT 'orders.created_by', (SELECT count(*) FROM orders o WHERE o.created_by IN (SELECT id FROM fx))::text
UNION ALL SELECT 'labor_summaries', (SELECT count(*) FROM labor_summaries l WHERE l.staff_id IN (SELECT id FROM fx))::text
UNION ALL SELECT 'staff_metrics', (SELECT count(*) FROM staff_metrics sm WHERE sm.staff_id IN (SELECT id FROM fx))::text
UNION ALL SELECT 'shift_reviews', (SELECT count(*) FROM shift_reviews sr JOIN shifts s ON s.id=sr.shift_id WHERE s.staff_id IN (SELECT id FROM fx))::text
UNION ALL SELECT 'login_attempts', (SELECT count(*) FROM login_attempts la WHERE la.staff_id IN (SELECT id FROM fx))::text
UNION ALL SELECT 'payroll_entries', (SELECT count(*) FROM payroll_entries pe WHERE pe.staff_id IN (SELECT id FROM fx))::text;

\echo '=== P9: test_rls_role — policies + grants referencing it ==='
SELECT 'policies on role: '||count(*) FROM pg_policy WHERE polroles=(SELECT oid FROM pg_roles WHERE rolname='test_rls_role');
SELECT c.relname, string_agg(p.polname, ', ') FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid WHERE p.polroles=(SELECT oid FROM pg_roles WHERE rolname='test_rls_role') GROUP BY c.relname ORDER BY 1;
