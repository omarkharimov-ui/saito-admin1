-- M0: P-9 implementation preflight re-run (READ-ONLY) — expected values from plan.
-- Any value differing from plan => HARD STOP.
\echo '--- E1: RLS-off table count (expect 15) ---'
SELECT 'E1 rls_off='||count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND c.relrowsecurity=false;
\echo '--- E2: drop candidates still NO_DEPENDENTS (expect 6 rows NO_DEPENDENTS) ---'
WITH cols AS (
  SELECT 'orders.items' AS target, c.oid AS trelid, a.attnum FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid WHERE c.relname='orders' AND a.attname='items' AND a.attnum>0
  UNION ALL
  SELECT 'app_settings.'||a.attname, c.oid, a.attnum FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid WHERE c.relname='app_settings' AND a.attname IN ('receipt_staff_name','receipt_payment_method','cash_close_variance_threshold','cash_close_manager_required') AND a.attnum>0
)
SELECT cols.target, COALESCE(string_agg(DISTINCT obj.name, ', '), 'NO_DEPENDENTS') AS dependents
FROM cols
LEFT JOIN pg_depend d ON d.refobjid=cols.trelid AND d.refobjsubid=cols.attnum AND d.classid='pg_class'::regclass
LEFT JOIN (
  SELECT p.oid, p.proname AS name FROM pg_proc p
  UNION ALL SELECT v.oid, v.relname FROM pg_class v WHERE v.relkind IN ('v','m')
  UNION ALL SELECT t.oid, t.tgname FROM pg_trigger t
  UNION ALL SELECT x.oid, x.conname FROM pg_constraint x
) obj ON obj.oid=d.objid
GROUP BY cols.target ORDER BY cols.target;
\echo '--- E3: dead-table deps (expect NO_DEPENDENTS for the 3 drop targets) ---'
SELECT t.relname, COALESCE(string_agg(DISTINCT obj.name, ', '), 'NO_DEPENDENTS') AS dependents
FROM pg_class t
JOIN pg_namespace n ON n.oid=t.relnamespace AND n.nspname='public'
LEFT JOIN pg_depend d ON d.refobjid=t.oid AND d.classid='pg_class'::regclass AND d.refobjsubid=0 AND d.deptype IN ('n','a','i')
LEFT JOIN (
  SELECT p.oid, p.proname AS name FROM pg_proc p
  UNION ALL SELECT v.oid, v.relname FROM pg_class v WHERE v.relkind IN ('v','m')
  UNION ALL SELECT tt.oid, tt.tgname FROM pg_trigger tt
  UNION ALL SELECT x.oid, x.conname FROM pg_constraint x
) obj ON obj.oid=d.objid
WHERE t.relname IN ('waiter_assignments','dining_groups','audit_log')
GROUP BY t.relname ORDER BY t.relname;
\echo '--- E4: 14 FK orphan counts (expect all 0; exceptions: recipe_items.product_id=5 SKIP, cash_drawer_log.order_id=154 EXCLUDED) ---'
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
UNION ALL SELECT 'recipe_items.product_id [SKIP]', count(*) FROM recipe_items ri WHERE ri.product_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM products p WHERE p.id=ri.product_id)
UNION ALL SELECT 'cash_drawer_log.order_id [EXCL]', count(*) FROM cash_drawer_log l WHERE l.order_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.id=l.order_id);
\echo '--- E5: staff fixture set + residue (expect 1025 / 39 / 39 / 257 / 67 / 1 / 88 / 1) ---'
WITH fx AS (SELECT id FROM staff WHERE is_active=false AND (name ~ '^[A-Z0-9_]{1,4}_' OR name ~ '^G2mt' OR name LIKE 'P8\_S%'))
SELECT 'E5 fixture='||count(*) FROM fx
UNION ALL SELECT 'shifts', (SELECT count(*) FROM shifts s WHERE s.staff_id IN (SELECT id FROM fx))
UNION ALL SELECT 'labor_summaries', (SELECT count(*) FROM labor_summaries l WHERE l.staff_id IN (SELECT id FROM fx))
UNION ALL SELECT 'security_events', (SELECT count(*) FROM security_events e WHERE e.staff_id IN (SELECT id FROM fx))
UNION ALL SELECT 'login_attempts', (SELECT count(*) FROM login_attempts la WHERE la.staff_id IN (SELECT id FROM fx))
UNION ALL SELECT 'sessions', (SELECT count(*) FROM sessions s WHERE s.user_id IN (SELECT id FROM fx))
UNION ALL SELECT 'staff_locations', (SELECT count(*) FROM staff_locations l WHERE l.staff_id IN (SELECT id FROM fx))
UNION ALL SELECT 'time_clock_audit', (SELECT count(*) FROM time_clock_audit t WHERE t.performed_by IN (SELECT id FROM fx));
\echo '--- E6: active staff (expect 39), preflight pool (expect 56) ---'
SELECT 'E6 active_staff='||count(*) FROM staff WHERE is_active=true AND status='ACTIVE';
SELECT 'pool='||count(*) FROM staff WHERE is_active=true AND status='ACTIVE' AND pin_hash IS NOT NULL AND pin_hash <> '' AND pin_hash LIKE 'pbkdf2_sha256%';
\echo '--- E7: M4 archive size — orders.items non-null (plan: archive whatever) ---'
SELECT 'E7 orders_items_nonnull='||count(*) FROM orders WHERE items IS NOT NULL;
\echo '--- E8: reservation_preorder_items policies still exist (expect 3) + RLS off ---'
SELECT 'E8 policies='||count(*) FROM pg_policy WHERE polrelid='reservation_preorder_items'::regclass;
SELECT 'rls_off='||relrowsecurity FROM pg_class WHERE relname='reservation_preorder_items' AND relnamespace='public'::regnamespace;
\echo '--- E9: P-8 canary (expect 0 open / 0 FK / t / t / 0) ---'
SELECT 'E9 open_sessions='||count(*) FROM cash_drawer_sessions WHERE status='open';
SELECT 'idem_fks='||count(*) FROM pg_constraint WHERE conrelid='payment_idempotency_keys'::regclass AND contype='f';
SELECT 'emit_coalesce='||(prosrc LIKE '%COALESCE(p_metadata%')::text FROM pg_proc WHERE proname='emit_outbox_event');
SELECT 'replay_first='||((position('gate T-4 fix' in prosrc) < position('Session already closed' in prosrc))::text FROM pg_proc WHERE proname='close_cash_register_v2' AND pg_get_function_arguments(oid) LIKE '%p_token%');
\echo '--- E10: row counts of drop targets (expect 18 / 0 / 67) ---'
SELECT 'waiter_assignments='||count(*) FROM waiter_assignments;
SELECT 'dining_groups='||count(*) FROM dining_groups;
SELECT 'audit_log='||count(*) FROM audit_log;
\echo 'M0 PREFLIGHT COMPLETE'
