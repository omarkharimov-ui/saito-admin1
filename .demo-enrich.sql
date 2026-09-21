-- DEMO ENRICH (2026-09-19) — Concept B /admin/customers UI review
-- Adds 8 demo customers (phones 0005555xxxx, fixed uuids d0000003..d0000010)
-- with 31 paid orders spread over the last 28 days (2 "Bu gün", 2 "Dünən").
-- Mirrors the original demo structure EXACTLY:
--   orders (status=paid, kitchen_status=completed)
--   + order_items (kitchen_status=completed)
--   + order_payments (status=captured)
-- No payments/outbox/audit rows (verified against d0000001 chain: all zero).
-- Idempotent: ON CONFLICT (id) DO NOTHING on customers; existing ids skipped.
-- Cleanup: .demo-cleanup.sql (phone LIKE '0005555%') covers everything.

DO $outer$
DECLARE
  v_org uuid := '00000000-0000-0000-0000-000000000001';
  v_loc uuid := 'f1f830b3-cf15-47e3-a538-01abd8222c6d';
BEGIN
  -- ── helper: create one paid demo order ─────────────────────────────────
  CREATE OR REPLACE FUNCTION _demo_mk_order(
    p_customer uuid, p_name text, p_phone text,
    p_days int, p_hours int, p_mins int,
    p_table int, p_guests int, p_method text, p_items jsonb
  ) RETURNS void LANGUAGE plpgsql AS $fn$
  DECLARE
    v_ts timestamptz := now() - make_interval(days => p_days, hours => p_hours, mins => p_mins);
    v_total numeric := 0;
    v_oid uuid;
  BEGIN
    INSERT INTO orders (
      organization_id, location_id, customer_id, customer_name, customer_phone,
      table_number, order_type, order_source, status, kitchen_status,
      total_amount, paid_amount, guest_count, created_at, updated_at,
      version, is_draft, split_count, is_late, is_rush, is_split, is_served,
      priority, apply_vat, discount, discount_amount, discount_value, tax_amount, tax_pct,
      tip_amount, refund_amount, returned_amount, service_charge_amount, service_charge_pct,
      cogs, profit, subtotal, total_price, change_amount, card_amount, cash_amount,
      kitchen_notified, printer_status
    ) VALUES (
      '00000000-0000-0000-0000-000000000001', 'f1f830b3-cf15-47e3-a538-01abd8222c6d',
      p_customer, p_name, p_phone,
      p_table, 'dine_in', 'dine_in', 'paid', 'completed',
      0, 0, p_guests, v_ts, v_ts,
      1, false, 1, false, false, false, false,
      0, false, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0,
      false, 'online'
    ) RETURNING id INTO v_oid;

    INSERT INTO order_items (
      order_id, product_id, product_name, quantity, unit_price, total_price,
      course, station, kitchen_status, tax_rate, tax_amount,
      is_hold, is_combo_parent, allergens, modifiers, special_notes,
      created_at, updated_at
    )
    SELECT v_oid, (it->>'id')::uuid, it->>'name', (it->>'qty')::int,
           (it->>'price')::numeric, (it->>'qty')::int * (it->>'price')::numeric,
           'main', 'all', 'completed', 0, 0, false, false, '[]'::jsonb, '[]'::jsonb, '',
           v_ts, v_ts
    FROM jsonb_array_elements(p_items) AS it;

    SELECT coalesce(sum(total_price), 0) INTO v_total FROM order_items WHERE order_id = v_oid;
    UPDATE orders SET total_amount = v_total, paid_amount = v_total WHERE id = v_oid;

    INSERT INTO order_payments (order_id, amount, method, payment_method, status, is_refund, is_partial, created_at)
    VALUES (v_oid, v_total, p_method, p_method, 'captured', false, false, v_ts + interval '5 minutes');
  END $fn$;

  -- ── customers (id d0000003..d0000010, phone 0005555xxxx) ───────────────
  INSERT INTO customers (id, name, phone, created_at) VALUES
    ('d0000003-aaaa-bbbb-cccc-000000000003', 'Leyla Quliyeva',    '00055550303', '2026-08-20 10:00:00+04'),
    ('d0000004-aaaa-bbbb-cccc-000000000004', 'Kənan Əliyev',      '00055550404', '2026-08-25 10:00:00+04'),
    ('d0000005-aaaa-bbbb-cccc-000000000005', 'Nigar Həsənova',    '00055550505', '2026-08-22 10:00:00+04'),
    ('d0000006-aaaa-bbbb-cccc-000000000006', 'Eldar Məmmədov',    '00055550606', '2026-08-28 10:00:00+04'),
    ('d0000007-aaaa-bbbb-cccc-000000000007', 'Sevinc İsmayılova', '00055550707', '2026-08-18 10:00:00+04'),
    ('d0000008-aaaa-bbbb-cccc-000000000008', 'Rəşad Əzizov',      '00055550808', '2026-08-27 10:00:00+04'),
    ('d0000009-aaaa-bbbb-cccc-000000000009', 'Günay Səfərli',     '00055550909', '2026-08-24 10:00:00+04'),
    ('d0000010-aaaa-bbbb-cccc-000000000010', 'Elchin Rzayev',     '00055551010', '2026-08-21 10:00:00+04')
  ON CONFLICT (id) DO NOTHING;

  -- ── Leyla Quliyeva — 5 visits, ₼190, last = Bu gün ─────────────────────
  PERFORM _demo_mk_order('d0000003-aaaa-bbbb-cccc-000000000003','Leyla Quliyeva','00055550303',26,6,0,4,2,'card',
    '[{"id":"79c749f4-da59-44ef-bfd0-d5177922c499","name":"Filadelfiya Classic","qty":1,"price":14},
      {"id":"82116fbf-3762-4170-98a5-daa6927ec5fa","name":"Tom Yam","qty":1,"price":13},
      {"id":"c4458f48-8ad9-4904-ba61-be813f3f60cf","name":"Coca-Cola 330ml","qty":2,"price":3}]');
  PERFORM _demo_mk_order('d0000003-aaaa-bbbb-cccc-000000000003','Leyla Quliyeva','00055550303',19,5,0,7,2,'card',
    '[{"id":"79c749f4-da59-44ef-bfd0-d5177922c499","name":"Filadelfiya Classic","qty":2,"price":14},
      {"id":"f3d6eae3-0272-4481-98d0-be9c54e6d2f1","name":"Green Tea Japanese Style","qty":1,"price":4}]');
  PERFORM _demo_mk_order('d0000003-aaaa-bbbb-cccc-000000000003','Leyla Quliyeva','00055550303',12,4,30,4,3,'cash',
    '[{"id":"79c749f4-da59-44ef-bfd0-d5177922c499","name":"Filadelfiya Classic","qty":2,"price":14},
      {"id":"82116fbf-3762-4170-98a5-daa6927ec5fa","name":"Tom Yam","qty":1,"price":13},
      {"id":"55d4b557-882f-4a58-9179-c90db8be146b","name":"Sake Nigiri","qty":1,"price":4},
      {"id":"c4458f48-8ad9-4904-ba61-be813f3f60cf","name":"Coca-Cola 330ml","qty":2,"price":3}]');
  PERFORM _demo_mk_order('d0000003-aaaa-bbbb-cccc-000000000003','Leyla Quliyeva','00055550303',5,3,0,9,2,'card',
    '[{"id":"79c749f4-da59-44ef-bfd0-d5177922c499","name":"Filadelfiya Classic","qty":1,"price":14},
      {"id":"82116fbf-3762-4170-98a5-daa6927ec5fa","name":"Tom Yam","qty":1,"price":13},
      {"id":"b9ea21b5-3e46-4a6a-9073-3d1d06d40ac0","name":"Kaliforniya Gold","qty":1,"price":12},
      {"id":"c4458f48-8ad9-4904-ba61-be813f3f60cf","name":"Coca-Cola 330ml","qty":1,"price":3}]');
  PERFORM _demo_mk_order('d0000003-aaaa-bbbb-cccc-000000000003','Leyla Quliyeva','00055550303',0,2,15,4,2,'card',
    '[{"id":"79c749f4-da59-44ef-bfd0-d5177922c499","name":"Filadelfiya Classic","qty":2,"price":14},
      {"id":"55d4b557-882f-4a58-9179-c90db8be146b","name":"Sake Nigiri","qty":1,"price":4}]');

  -- ── Kənan Əliyev — 3 visits, ₼131, last = Dünən ────────────────────────
  PERFORM _demo_mk_order('d0000004-aaaa-bbbb-cccc-000000000004','Kənan Əliyev','00055550404',22,7,0,2,4,'cash',
    '[{"id":"82116fbf-3762-4170-98a5-daa6927ec5fa","name":"Tom Yam","qty":3,"price":13},
      {"id":"c4458f48-8ad9-4904-ba61-be813f3f60cf","name":"Coca-Cola 330ml","qty":4,"price":3}]');
  PERFORM _demo_mk_order('d0000004-aaaa-bbbb-cccc-000000000004','Kənan Əliyev','00055550404',14,6,0,5,2,'card',
    '[{"id":"82116fbf-3762-4170-98a5-daa6927ec5fa","name":"Tom Yam","qty":2,"price":13},
      {"id":"55d4b557-882f-4a58-9179-c90db8be146b","name":"Sake Nigiri","qty":2,"price":4}]');
  PERFORM _demo_mk_order('d0000004-aaaa-bbbb-cccc-000000000004','Kənan Əliyev','00055550404',1,4,0,2,3,'card',
    '[{"id":"82116fbf-3762-4170-98a5-daa6927ec5fa","name":"Tom Yam","qty":2,"price":13},
      {"id":"79c749f4-da59-44ef-bfd0-d5177922c499","name":"Filadelfiya Classic","qty":1,"price":14},
      {"id":"c4458f48-8ad9-4904-ba61-be813f3f60cf","name":"Coca-Cola 330ml","qty":2,"price":3}]');

  -- ── Nigar Həsənova — 4 visits, ₼159, last = 2 days ago ─────────────────
  PERFORM _demo_mk_order('d0000005-aaaa-bbbb-cccc-000000000005','Nigar Həsənova','00055550505',25,5,0,8,2,'card',
    '[{"id":"b9ea21b5-3e46-4a6a-9073-3d1d06d40ac0","name":"Kaliforniya Gold","qty":2,"price":12},
      {"id":"f3d6eae3-0272-4481-98d0-be9c54e6d2f1","name":"Green Tea Japanese Style","qty":1,"price":4}]');
  PERFORM _demo_mk_order('d0000005-aaaa-bbbb-cccc-000000000005','Nigar Həsənova','00055550505',16,4,0,3,2,'cash',
    '[{"id":"b9ea21b5-3e46-4a6a-9073-3d1d06d40ac0","name":"Kaliforniya Gold","qty":2,"price":12},
      {"id":"82116fbf-3762-4170-98a5-daa6927ec5fa","name":"Tom Yam","qty":1,"price":13},
      {"id":"c4458f48-8ad9-4904-ba61-be813f3f60cf","name":"Coca-Cola 330ml","qty":2,"price":3}]');
  PERFORM _demo_mk_order('d0000005-aaaa-bbbb-cccc-000000000005','Nigar Həsənova','00055550505',8,3,30,8,4,'card',
    '[{"id":"b9ea21b5-3e46-4a6a-9073-3d1d06d40ac0","name":"Kaliforniya Gold","qty":3,"price":12},
      {"id":"55d4b557-882f-4a58-9179-c90db8be146b","name":"Sake Nigiri","qty":2,"price":4},
      {"id":"c4458f48-8ad9-4904-ba61-be813f3f60cf","name":"Coca-Cola 330ml","qty":2,"price":3}]');
  PERFORM _demo_mk_order('d0000005-aaaa-bbbb-cccc-000000000005','Nigar Həsənova','00055550505',2,5,0,6,2,'card',
    '[{"id":"b9ea21b5-3e46-4a6a-9073-3d1d06d40ac0","name":"Kaliforniya Gold","qty":2,"price":12},
      {"id":"79c749f4-da59-44ef-bfd0-d5177922c499","name":"Filadelfiya Classic","qty":1,"price":14}]');

  -- ── Eldar Məmmədov — 2 visits, ₼49 ─────────────────────────────────────
  PERFORM _demo_mk_order('d0000006-aaaa-bbbb-cccc-000000000006','Eldar Məmmədov','00055550606',18,6,0,10,2,'cash',
    '[{"id":"55d4b557-882f-4a58-9179-c90db8be146b","name":"Sake Nigiri","qty":4,"price":4},
      {"id":"f3d6eae3-0272-4481-98d0-be9c54e6d2f1","name":"Green Tea Japanese Style","qty":1,"price":4}]');
  PERFORM _demo_mk_order('d0000006-aaaa-bbbb-cccc-000000000006','Eldar Məmmədov','00055550606',6,4,0,10,2,'card',
    '[{"id":"55d4b557-882f-4a58-9179-c90db8be146b","name":"Sake Nigiri","qty":4,"price":4},
      {"id":"82116fbf-3762-4170-98a5-daa6927ec5fa","name":"Tom Yam","qty":1,"price":13}]');

  -- ── Sevinc İsmayılova — 6 visits, ₼222, last = Bu gün (regular) ────────
  PERFORM _demo_mk_order('d0000007-aaaa-bbbb-cccc-000000000007','Sevinc İsmayılova','00055550707',27,5,0,1,2,'card',
    '[{"id":"79c749f4-da59-44ef-bfd0-d5177922c499","name":"Filadelfiya Classic","qty":1,"price":14},
      {"id":"c4458f48-8ad9-4904-ba61-be813f3f60cf","name":"Coca-Cola 330ml","qty":2,"price":3}]');
  PERFORM _demo_mk_order('d0000007-aaaa-bbbb-cccc-000000000007','Sevinc İsmayılova','00055550707',21,4,0,1,3,'cash',
    '[{"id":"79c749f4-da59-44ef-bfd0-d5177922c499","name":"Filadelfiya Classic","qty":2,"price":14},
      {"id":"82116fbf-3762-4170-98a5-daa6927ec5fa","name":"Tom Yam","qty":1,"price":13},
      {"id":"f3d6eae3-0272-4481-98d0-be9c54e6d2f1","name":"Green Tea Japanese Style","qty":1,"price":4}]');
  PERFORM _demo_mk_order('d0000007-aaaa-bbbb-cccc-000000000007','Sevinc İsmayılova','00055550707',15,6,0,6,2,'card',
    '[{"id":"82116fbf-3762-4170-98a5-daa6927ec5fa","name":"Tom Yam","qty":2,"price":13},
      {"id":"55d4b557-882f-4a58-9179-c90db8be146b","name":"Sake Nigiri","qty":1,"price":4},
      {"id":"c4458f48-8ad9-4904-ba61-be813f3f60cf","name":"Coca-Cola 330ml","qty":2,"price":3}]');
  PERFORM _demo_mk_order('d0000007-aaaa-bbbb-cccc-000000000007','Sevinc İsmayılova','00055550707',10,3,0,1,4,'card',
    '[{"id":"79c749f4-da59-44ef-bfd0-d5177922c499","name":"Filadelfiya Classic","qty":2,"price":14},
      {"id":"82116fbf-3762-4170-98a5-daa6927ec5fa","name":"Tom Yam","qty":2,"price":13},
      {"id":"b9ea21b5-3e46-4a6a-9073-3d1d06d40ac0","name":"Kaliforniya Gold","qty":1,"price":12}]');
  PERFORM _demo_mk_order('d0000007-aaaa-bbbb-cccc-000000000007','Sevinc İsmayılova','00055550707',3,4,30,9,2,'cash',
    '[{"id":"79c749f4-da59-44ef-bfd0-d5177922c499","name":"Filadelfiya Classic","qty":1,"price":14},
      {"id":"82116fbf-3762-4170-98a5-daa6927ec5fa","name":"Tom Yam","qty":1,"price":13},
      {"id":"55d4b557-882f-4a58-9179-c90db8be146b","name":"Sake Nigiri","qty":2,"price":4}]');
  PERFORM _demo_mk_order('d0000007-aaaa-bbbb-cccc-000000000007','Sevinc İsmayılova','00055550707',0,1,30,1,2,'card',
    '[{"id":"79c749f4-da59-44ef-bfd0-d5177922c499","name":"Filadelfiya Classic","qty":2,"price":14},
      {"id":"82116fbf-3762-4170-98a5-daa6927ec5fa","name":"Tom Yam","qty":1,"price":13},
      {"id":"c4458f48-8ad9-4904-ba61-be813f3f60cf","name":"Coca-Cola 330ml","qty":1,"price":3}]');

  -- ── Rəşad Əzizov — 2 visits, ₼35 ───────────────────────────────────────
  PERFORM _demo_mk_order('d0000008-aaaa-bbbb-cccc-000000000008','Rəşad Əzizov','00055550808',20,5,0,7,2,'cash',
    '[{"id":"f3d6eae3-0272-4481-98d0-be9c54e6d2f1","name":"Green Tea Japanese Style","qty":2,"price":4},
      {"id":"c4458f48-8ad9-4904-ba61-be813f3f60cf","name":"Coca-Cola 330ml","qty":2,"price":3}]');
  PERFORM _demo_mk_order('d0000008-aaaa-bbbb-cccc-000000000008','Rəşad Əzizov','00055550808',9,6,0,7,2,'card',
    '[{"id":"82116fbf-3762-4170-98a5-daa6927ec5fa","name":"Tom Yam","qty":1,"price":13},
      {"id":"55d4b557-882f-4a58-9179-c90db8be146b","name":"Sake Nigiri","qty":2,"price":4}]');

  -- ── Günay Səfərli — 3 visits, ₼106 ─────────────────────────────────────
  PERFORM _demo_mk_order('d0000009-aaaa-bbbb-cccc-000000000009','Günay Səfərli','00055550909',23,4,0,5,2,'card',
    '[{"id":"82116fbf-3762-4170-98a5-daa6927ec5fa","name":"Tom Yam","qty":2,"price":13},
      {"id":"f3d6eae3-0272-4481-98d0-be9c54e6d2f1","name":"Green Tea Japanese Style","qty":2,"price":4}]');
  PERFORM _demo_mk_order('d0000009-aaaa-bbbb-cccc-000000000009','Günay Səfərli','00055550909',11,5,0,5,3,'cash',
    '[{"id":"82116fbf-3762-4170-98a5-daa6927ec5fa","name":"Tom Yam","qty":2,"price":13},
      {"id":"79c749f4-da59-44ef-bfd0-d5177922c499","name":"Filadelfiya Classic","qty":1,"price":14},
      {"id":"c4458f48-8ad9-4904-ba61-be813f3f60cf","name":"Coca-Cola 330ml","qty":3,"price":3}]');
  PERFORM _demo_mk_order('d0000009-aaaa-bbbb-cccc-000000000009','Günay Səfərli','00055550909',4,2,0,3,2,'card',
    '[{"id":"82116fbf-3762-4170-98a5-daa6927ec5fa","name":"Tom Yam","qty":1,"price":13},
      {"id":"f3d6eae3-0272-4481-98d0-be9c54e6d2f1","name":"Green Tea Japanese Style","qty":2,"price":4},
      {"id":"55d4b557-882f-4a58-9179-c90db8be146b","name":"Sake Nigiri","qty":1,"price":4}]');

  -- ── Elchin Rzayev — 4 visits, ₼155, last = Dünən ───────────────────────
  PERFORM _demo_mk_order('d0000010-aaaa-bbbb-cccc-000000000010','Elchin Rzayev','00055551010',24,6,0,2,2,'card',
    '[{"id":"b9ea21b5-3e46-4a6a-9073-3d1d06d40ac0","name":"Kaliforniya Gold","qty":2,"price":12},
      {"id":"c4458f48-8ad9-4904-ba61-be813f3f60cf","name":"Coca-Cola 330ml","qty":2,"price":3}]');
  PERFORM _demo_mk_order('d0000010-aaaa-bbbb-cccc-000000000010','Elchin Rzayev','00055551010',13,4,0,8,4,'cash',
    '[{"id":"79c749f4-da59-44ef-bfd0-d5177922c499","name":"Filadelfiya Classic","qty":2,"price":14},
      {"id":"b9ea21b5-3e46-4a6a-9073-3d1d06d40ac0","name":"Kaliforniya Gold","qty":2,"price":12},
      {"id":"55d4b557-882f-4a58-9179-c90db8be146b","name":"Sake Nigiri","qty":2,"price":4}]');
  PERFORM _demo_mk_order('d0000010-aaaa-bbbb-cccc-000000000010','Elchin Rzayev','00055551010',7,5,30,2,2,'card',
    '[{"id":"b9ea21b5-3e46-4a6a-9073-3d1d06d40ac0","name":"Kaliforniya Gold","qty":2,"price":12},
      {"id":"82116fbf-3762-4170-98a5-daa6927ec5fa","name":"Tom Yam","qty":1,"price":13},
      {"id":"f3d6eae3-0272-4481-98d0-be9c54e6d2f1","name":"Green Tea Japanese Style","qty":1,"price":4}]');
  PERFORM _demo_mk_order('d0000010-aaaa-bbbb-cccc-000000000010','Elchin Rzayev','00055551010',1,2,0,10,3,'card',
    '[{"id":"79c749f4-da59-44ef-bfd0-d5177922c499","name":"Filadelfiya Classic","qty":1,"price":14},
      {"id":"b9ea21b5-3e46-4a6a-9073-3d1d06d40ac0","name":"Kaliforniya Gold","qty":1,"price":12},
      {"id":"c4458f48-8ad9-4904-ba61-be813f3f60cf","name":"Coca-Cola 330ml","qty":2,"price":3}]');

  DROP FUNCTION _demo_mk_order(uuid,text,text,int,int,int,int,int,text,jsonb);
END $outer$;

-- verification: per-customer live stats
SELECT c.name,
       count(o.id) AS visits,
       round(coalesce(sum(o.paid_amount),0),2)::text AS spent,
       max(o.created_at) AS last
FROM customers c
LEFT JOIN orders o ON o.customer_id = c.id AND o.status NOT IN ('cancelled','voided')
WHERE c.phone LIKE '0005555%'
GROUP BY c.id, c.name
ORDER BY c.name;
