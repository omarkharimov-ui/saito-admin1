-- DEMO CUSTOMER CLEANUP (2026-09-19, v2)
-- Removes ALL demo customers created for the /admin/customers UI review —
--   batch 1: Aygün Mammadova (00055550101) + Tural Hüseynov (00055550202)
--   batch 2 (.demo-enrich.sql): Leyla Quliyeva … Elchin Rzayev (00055550303..00055551010)
-- and their paid demo orders (items, captured payments, all trigger chains).
-- Sweep key: every demo phone starts with 0005555 (11 digits, no real customer
-- uses this block — verify before running if in doubt).
-- Usage (one-shot, idempotent):
--   psql "$DB" -v ON_ERROR_STOP=1 -f .demo-cleanup.sql
-- Run AFTER the user finishes the UI review ("təmizlə" command).

DO $$
DECLARE ids uuid[];
BEGIN
  SELECT array_agg(o.id) INTO ids
  FROM orders o
  WHERE o.customer_id IN (SELECT id FROM customers WHERE phone LIKE '0005555%');
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

DELETE FROM customers WHERE phone LIKE '0005555%';

-- GC (Wave A #3, 2026-09-20): demo gift cards (GCDEMO-%) + their audit rows.
-- Ledger cascades (FK ON DELETE CASCADE).
DELETE FROM audit_logs_canonical
 WHERE entity_type = 'gift_card'
   AND entity_id IN (SELECT id::text FROM gift_cards WHERE code LIKE 'GCDEMO-%');
DELETE FROM gift_cards WHERE code LIKE 'GCDEMO-%';

SELECT 'residue='||(SELECT count(*) FROM customers WHERE phone LIKE '0005555%')
  ||'/'||(SELECT count(*) FROM orders WHERE customer_id IN (SELECT id FROM customers WHERE phone LIKE '0005555%'))
  ||'/'||(SELECT count(*) FROM gift_cards WHERE code LIKE 'GCDEMO-%') AS check;
