-- W-A1 preflight (READ-ONLY) — run before applying 20260919000001_w_a1_guest_channel.sql
SELECT 'dup phones: '||count(*) AS preflight FROM (SELECT phone FROM customers WHERE phone IS NOT NULL GROUP BY phone HAVING count(*) > 1) d;
SELECT 'null phones: '||(SELECT count(*) FROM customers WHERE phone IS NULL) AS preflight;
SELECT 'orphan orders.customer_id: '||(SELECT count(*) FROM orders o LEFT JOIN customers c ON c.id = o.customer_id WHERE o.customer_id IS NOT NULL AND c.id IS NULL) AS preflight;
SELECT 'tables 410-430 in use: '||(SELECT count(*) FROM table_floors WHERE table_number BETWEEN 410 AND 430) AS preflight;
SELECT 'customers_phone_uq exists: '||(SELECT count(*) FROM pg_indexes WHERE indexname = 'customers_phone_uq') AS preflight;
SELECT 'guest_link_customer exists: '||(SELECT count(*) FROM pg_proc WHERE proname = 'guest_link_customer') AS preflight;
SELECT 'loyalty_product_rules rows: '||(SELECT count(*) FROM loyalty_product_rules) AS preflight;
SELECT 'loyalty_accounts rows: '||(SELECT count(*) FROM loyalty_accounts) AS preflight;
SELECT 'settings.loyalty_enabled: '||(SELECT loyalty_enabled FROM settings WHERE id = '1') AS preflight;
SELECT 'any 0007777% customers: '||(SELECT count(*) FROM customers WHERE phone LIKE '0007777%') AS preflight;
SELECT 'any WAG_% staff: '||(SELECT count(*) FROM staff WHERE name LIKE 'WAG_%') AS preflight;
