-- =============================================================================
-- P-9 M7 PREFLIGHT — READ-ONLY, single txn. Run IMMEDIATELY before applying
-- 20260918000007_p9_staff_fixture_purge.sql. Every value below MUST equal the
-- constant hardcoded in the migration (any mismatch = ABORT, do not apply).
-- Expected constants (live-verified 2026-09-17):
--   fixture=1055 real=53 staff_total=1108 pool=39 neutralize=1025
--   shift_breaks=2 cash_drawer_sessions=2 cash_drawer_log=4 sessions=6
--   login_attempts=82 approval_requests=25 staff_locations=111
--   security_events=288 schedule=2 shifts=43
--   time_clock_audit=7 overtime_records=1 time_clock_entries=6
-- =============================================================================
BEGIN READ ONLY;

WITH fx AS (SELECT id, is_active FROM staff WHERE (name ~ '^[A-Z0-9_]{1,4}_' OR name ~ '^G2mt' OR name LIKE 'P8\_S%')),
rl AS (SELECT id, is_active FROM staff WHERE NOT (name ~ '^[A-Z0-9_]{1,4}_' OR name ~ '^G2mt' OR name LIKE 'P8\_S%'))
SELECT 'fixture_total' AS check, count(*) AS val, 1055 AS expected FROM fx
UNION ALL SELECT 'real_total', count(*), 53 FROM rl
UNION ALL SELECT 'staff_total', count(*), 1108 FROM staff
UNION ALL SELECT 'real_active', count(*), 9 FROM rl WHERE is_active
UNION ALL SELECT 'pool', count(*), 39 FROM staff WHERE is_active AND status='ACTIVE' AND pin_hash IS NOT NULL AND pin_hash<>''
UNION ALL SELECT 'neutralize_target', count(*), 1025 FROM fx WHERE is_active=false
UNION ALL SELECT 'shift_breaks', count(*), 2 FROM shift_breaks t WHERE t.staff_id IN (SELECT id FROM fx)
UNION ALL SELECT 'cash_drawer_sessions', count(*), 2 FROM cash_drawer_sessions t WHERE t.opened_by IN (SELECT id FROM fx) OR t.closed_by IN (SELECT id FROM fx)
UNION ALL SELECT 'cash_drawer_log', count(*), 4 FROM cash_drawer_log t WHERE t.created_by IN (SELECT id FROM fx)
UNION ALL SELECT 'sessions', count(*), 6 FROM sessions t WHERE t.user_id IN (SELECT id FROM fx)
UNION ALL SELECT 'login_attempts', count(*), 82 FROM login_attempts t WHERE t.staff_id IN (SELECT id FROM fx)
UNION ALL SELECT 'approval_requests', count(*), 25 FROM approval_requests t WHERE t.staff_id IN (SELECT id FROM fx) OR t.reviewed_by IN (SELECT id FROM fx)
UNION ALL SELECT 'staff_locations', count(*), 111 FROM staff_locations t WHERE t.staff_id IN (SELECT id FROM fx)
UNION ALL SELECT 'security_events', count(*), 288 FROM security_events t WHERE t.staff_id IN (SELECT id FROM fx)
UNION ALL SELECT 'schedule', count(*), 2 FROM schedule t WHERE t.staff_id IN (SELECT id FROM fx)
UNION ALL SELECT 'shifts', count(*), 43 FROM shifts t WHERE t.staff_id IN (SELECT id FROM fx)
UNION ALL SELECT 'time_clock_audit', count(*), 7 FROM time_clock_audit t WHERE t.performed_by IN (SELECT id FROM fx)
UNION ALL SELECT 'overtime_records', count(*), 1 FROM overtime_records t WHERE t.staff_id IN (SELECT id FROM fx) OR t.approved_by IN (SELECT id FROM fx)
UNION ALL SELECT 'time_clock_entries', count(*), 6 FROM time_clock_entries t WHERE t.staff_id IN (SELECT id FROM fx) OR t.approved_by IN (SELECT id FROM fx);

-- fixture-shift reference closure (must stay 0 / as-expected for delete order)
WITH fx AS (SELECT id FROM staff WHERE (name ~ '^[A-Z0-9_]{1,4}_' OR name ~ '^G2mt' OR name LIKE 'P8\_S%')),
fsh AS (SELECT s.id FROM shifts s WHERE s.staff_id IN (SELECT id FROM fx))
SELECT 'cash_drawer_sessions.ref_fshift' AS check, count(*) AS val, 2 AS expected FROM cash_drawer_sessions t WHERE t.shift_id IN (SELECT id FROM fsh)
UNION ALL SELECT 'cash_drawer_log.ref_fshift', count(*), 0 FROM cash_drawer_log t WHERE t.shift_id IN (SELECT id FROM fsh)
UNION ALL SELECT 'overtime_records.ref_fshift', count(*), 1 FROM overtime_records t WHERE t.shift_id IN (SELECT id FROM fsh)
UNION ALL SELECT 'tip_shortfalls.ref_fshift', count(*), 0 FROM tip_shortfalls t WHERE t.shift_id IN (SELECT id FROM fsh)
UNION ALL SELECT 'shift_reviews.ref_fshift', count(*), 0 FROM shift_reviews t WHERE t.shift_id IN (SELECT id FROM fsh);

-- denylist integrity: the 53 real staff IDs must be stable (names shown for audit)
SELECT 'denylist_names' AS check, string_agg(name, ',' ORDER BY name) AS val, 'see report' AS expected
FROM staff WHERE NOT (name ~ '^[A-Z0-9_]{1,4}_' OR name ~ '^G2mt' OR name LIKE 'P8\_S%');

ROLLBACK;
