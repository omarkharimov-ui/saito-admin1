-- DEMO CUSTOMER CLEANUP (2026-09-19)
-- Removes the two demo customers created for the /admin/customers UI review:
--   Aygün Mammadova (00055550101) + Tural Hüseynov (00055550202)
-- and their 9 paid demo orders (items, captured payments, all trigger chains).
-- Usage (one-shot, idempotent):
--   psql "$DB" -v ON_ERROR_STOP=1 -f .demo-cleanup.sql
-- Run AFTER the user finishes the UI review ("təmizlə" command).

DO $$
DECLARE ids uuid[];
BEGIN
  SELECT array_agg(o.id) INTO ids
  FROM orders o
  WHERE o.customer_id IN (SELECT id FROM customers WHERE phone IN ('00055550101','00055550202'));
  IF ids IS NULL THEN RAISE NOTICE 'nothing to clean'; RETURN; END IF;

  PERFORM set_config('app.payment_ledger_reopen','on',false);
  DELETE FROM payment_idempotency_keys WHERE order_id = ANY(ids);
  DELETE FROM order_payments WHERE order_id = ANY(ids);
  DELETE FROM payments WHERE order_id = ANY(ids);
  DELETE FROM outbox_events WHERE aggregate_id = ANY(ids);
  DELETE FROM audit_logs WHERE record_id = ANY(ids::text[]);
  DELETE FROM audit_logs_canonical WHERE entity_id = ANY(ids::text[]);
  DELETE FROM operation_logs WHERE order_id = ANY(ids);
  DELETE FROM order_events WHERE order_id = ANY(ids);
  DELETE FROM cancelled_orders WHERE order_id = ANY(ids);
  DELETE FROM kitchen_schedule WHERE order_id = ANY(ids);
  DELETE FROM inventory_logs WHERE order_id = ANY(ids)
     OR order_item_id IN (SELECT id FROM order_items WHERE order_id = ANY(ids));
  DELETE FROM order_items WHERE order_id = ANY(ids);
  DELETE FROM orders WHERE id = ANY(ids);
  PERFORM set_config('app.payment_ledger_reopen','off',false);
END $$;

DELETE FROM customers WHERE phone IN ('00055550101','00055550202');

SELECT 'residue='||(SELECT count(*) FROM customers WHERE phone IN ('00055550101','00055550202'))
  ||'/'||(SELECT count(*) FROM orders WHERE customer_id IN (SELECT id FROM customers WHERE phone IN ('00055550101','00055550202'))) AS check;
