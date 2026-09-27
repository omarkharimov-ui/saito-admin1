-- ═══════════════════════════════════════════════════════════════════════
-- Saito POS — test order seed (2026-09-28, owner request: "~100-200 sifər")
--
-- Restores realistic history data after the 2026-09-27 DB hygiene wipe:
--   150 past orders (terminal statuses only: paid/closed/cancelled/refunded/
--   voided) + order_items + payments + order_payments + audit_logs +
--   cancelled_orders archive rows.
--
-- Safety properties:
--   * terminal statuses only → sync_table_order_aggregates ignores them
--     (tables stay BOŞ — floor view untouched)
--   * Kassa balance = cash_drawer_log walk → untouched
--   * trg_kds_ticket_emit DISABLED during seeding → no ghost kitchen tickets
--   * order_number_sequences counters advanced → no future collisions
--   * single transaction — any error rolls everything back
-- ═══════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP on
BEGIN;

ALTER TABLE order_items DISABLE TRIGGER trg_kds_ticket_emit;

DROP TABLE IF EXISTS _seed_products;
DROP TABLE IF EXISTS _seed_tables;
DROP TABLE IF EXISTS _seed_customers;

CREATE TEMP TABLE _seed_products AS
  SELECT row_number() OVER (ORDER BY random()) AS rn,
         id, name_az, price, COALESCE(cost_price, 0) AS cost, image_url
  FROM products
  WHERE price > 0 AND COALESCE(name_az, '') <> '';

CREATE TEMP TABLE _seed_tables AS
  SELECT row_number() OVER (ORDER BY random()) AS rn, table_number
  FROM table_floors
  WHERE location_id = 'f1f830b3-cf15-47e3-a538-01abd8222c6d'
    AND COALESCE(is_archived, false) = false;

CREATE TEMP TABLE _seed_customers AS
  SELECT row_number() OVER (ORDER BY random()) AS rn, id, name, phone
  FROM customers
  WHERE name IS NOT NULL;

SELECT setseed(0.20260928); -- deterministic distribution

DO $$
DECLARE
  v_org  uuid := '00000000-0000-0000-0000-000000000001';
  v_loc  uuid := 'f1f830b3-cf15-47e3-a538-01abd8222c6d';

  -- weighted staff (Kassir dominant, like the original 849)
  v_staff uuid[]    := ARRAY['96baaa16-8779-4d1d-a500-a3ce9084810e','96baaa16-8779-4d1d-a500-a3ce9084810e','96baaa16-8779-4d1d-a500-a3ce9084810e','c814879d-5378-4791-8c5f-8ee5aee51994','4e25370a-66cf-4362-ad72-95e8e892355d','87fbcd0f-cb38-405b-b397-c129206a1407'];
  v_names text[]    := ARRAY['Kassir','Kassir','Kassir','superadmin','Admin Updated','Tural Memmedov'];
  -- reason = enum (cancelled_orders_reason_check), reason_text = human AZ
  v_reasons text[]   := ARRAY['customer_refused','quality_issue','delay','wrong_order','other'];
  v_reason_texts text[] := ARRAY['Müştəri ləğv etdi','Məhsul keyfiyyəti','Çatdırılma təxirə düştü','Sifariş yanlış qeyd olunub','Masa yığılır'];
  v_refreasons text[] := ARRAY['Müştəri şikayəti','Məhsul keyfiyyəti','Sifariş səhvi'];

  v_n_tables int; v_n_cust int; v_n_prod int;
  v_i int; v_j int;
  v_day int; v_hour int; v_min int;
  v_src text; v_status text; v_method text; v_order_number text;
  v_t timestamptz; v_paid_at timestamptz; v_cancel_at timestamptz; v_refund_at timestamptz;
  v_order uuid;
  v_table int;
  v_cust_id uuid; v_cust_name text; v_cust_phone text;
  v_si int;
  -- items
  v_n_items int;
  v_prns int[]; v_pids uuid[]; v_pnames text[]; v_pprices numeric[]; v_pcogs numeric[]; v_pimgs text[]; v_qtys int[];
  v_prow record;
  v_r int;
  v_rn int; v_seen int[]; v_attempts int;
  v_sub numeric(10,2); v_tip numeric(10,2); v_fee numeric(10,2); v_disc numeric(10,2);
  v_total numeric(10,2); v_cogs numeric(12,2);
  v_guest int;
  v_seq_ord int; v_seq_a int; v_seq_d int;
BEGIN
  v_seq_ord := 2831; v_seq_a := 49; v_seq_d := 53;
  SELECT count(*) INTO v_n_tables FROM _seed_tables;
  SELECT count(*) INTO v_n_cust   FROM _seed_customers;
  SELECT count(*) INTO v_n_prod   FROM _seed_products;
  IF v_n_tables = 0 OR v_n_cust = 0 OR v_n_prod = 0 THEN
    RAISE EXCEPTION 'seed: reference data missing (tables %, customers %, products %)', v_n_tables, v_n_cust, v_n_prod;
  END IF;

  FOR v_i IN 1..150 LOOP
    -- ── source & status mix ────────────────────────────────────────────
    v_src := CASE
      WHEN random() < 0.62 THEN 'dine_in'
      WHEN random() < 0.61 THEN 'takeaway'
      ELSE 'delivery' END;

    CASE
      WHEN random() < 0.66 THEN v_status := 'paid';
      WHEN random() < 0.79 THEN v_status := 'cancelled';
      WHEN random() < 0.89 THEN v_status := 'closed';
      WHEN random() < 0.94 THEN v_status := 'refunded';
      ELSE v_status := 'voided'; END CASE;

    v_method := CASE WHEN random() < 0.62 THEN 'cash' ELSE 'card' END;

    -- ── timestamp: last 45 days, skewed recent; Baku local 11:00–22:59 ─
    v_day  := floor(power(random(), 1.35) * 45)::int;
    v_hour := 11 + floor(random() * 12)::int;
    v_min  := floor(random() * 60)::int;
    v_t := timezone('Asia/Baku',
             (timezone('Asia/Baku', now()))::date - v_day
             + make_time(v_hour, v_min, floor(random() * 60)::float8));
    -- clamp: "today" local hours can still be in the FUTURE (Baku 00:xx) —
    -- everything must sit in the past.
    IF v_t > now() - interval '3 hours' THEN
      v_t := now() - interval '3 hours' - make_interval(mins => floor(random() * 72)::int);
    END IF;

    v_paid_at   := LEAST(v_t + make_interval(mins => 15 + floor(random() * 45)::int),
                         now() - interval '60 minutes');
    v_cancel_at := LEAST(v_t + make_interval(mins => 5  + floor(random() * 35)::int),
                         now() - interval '45 minutes');
    v_refund_at := LEAST(v_paid_at + make_interval(hours => 2 + floor(random() * 20)::int),
                         now() - interval '30 minutes');

    -- ── order number (app format: prefix + lpad, per-location sequences) ─
    IF v_src = 'dine_in' THEN
      v_seq_ord := v_seq_ord + 1;
      v_order_number := 'ORD-' || lpad(v_seq_ord::text, GREATEST(3, length(v_seq_ord::text)), '0');
    ELSIF v_src = 'takeaway' THEN
      v_seq_a := v_seq_a + 1;
      v_order_number := '#A' || lpad(v_seq_a::text, GREATEST(3, length(v_seq_a::text)), '0');
    ELSE
      v_seq_d := v_seq_d + 1;
      v_order_number := '#D' || lpad(v_seq_d::text, GREATEST(3, length(v_seq_d::text)), '0');
    END IF;

    v_si := 1 + floor(random() * 6)::int;

    -- ── table / customer ───────────────────────────────────────────────
    IF v_src = 'dine_in' THEN
      SELECT table_number INTO v_table FROM _seed_tables WHERE rn = 1 + floor(random() * v_n_tables)::int;
      v_guest := 2 + floor(random() * 4)::int;
      IF random() < 0.30 THEN
        SELECT id, name, phone INTO v_cust_id, v_cust_name, v_cust_phone
          FROM _seed_customers WHERE rn = 1 + floor(random() * v_n_cust)::int;
      ELSE
        v_cust_id := NULL; v_cust_name := NULL; v_cust_phone := NULL;
      END IF;
    ELSE
      v_table := NULL;
      v_guest := 1 + floor(random() * 3)::int;
      IF random() < 0.90 THEN
        SELECT id, name, phone INTO v_cust_id, v_cust_name, v_cust_phone
          FROM _seed_customers WHERE rn = 1 + floor(random() * v_n_cust)::int;
      ELSE
        v_cust_id := NULL;
        v_cust_name := NULL;
        v_cust_phone := NULL;
      END IF;
    END IF;

    -- ── items: 1–4 distinct products ───────────────────────────────────
    v_n_items := 1 + floor(random() * 3.4)::int;
    IF v_n_items > v_n_prod THEN v_n_items := v_n_prod; END IF;
    v_prns := ARRAY[]::int[]; v_pids := ARRAY[]::uuid[]; v_pnames := ARRAY[]::text[];
    v_pprices := ARRAY[]::numeric[]; v_pcogs := ARRAY[]::numeric[]; v_pimgs := ARRAY[]::text[];
    v_qtys := ARRAY[]::int[];
    FOR v_j IN 1..v_n_items LOOP
      v_seen := ARRAY[]::int[]; v_attempts := 0;
      LOOP
        v_rn := 1 + floor(random() * v_n_prod)::int;
        v_attempts := v_attempts + 1;
        IF NOT (v_rn = ANY (v_seen)) OR v_attempts > 12 THEN EXIT; END IF;
        v_seen := array_append(v_seen, v_rn);
      END LOOP;
      v_prns := array_append(v_prns, v_rn);
      SELECT * INTO v_prow FROM _seed_products WHERE rn = v_rn;
      v_pids[v_j] := v_prow.id;
      v_pnames[v_j] := v_prow.name_az;
      v_pprices[v_j] := v_prow.price;
      v_pcogs[v_j] := v_prow.cost;
      v_pimgs[v_j] := v_prow.image_url;
      v_qtys[v_j] := CASE WHEN random() < 0.65 THEN 1 WHEN random() < 0.85 THEN 2 ELSE 3 END;
    END LOOP;

    v_sub := 0; v_cogs := 0;
    FOR v_j IN 1..v_n_items LOOP
      v_sub  := v_sub + v_pprices[v_j] * v_qtys[v_j];
      v_cogs := v_cogs + v_pcogs[v_j] * v_qtys[v_j];
    END LOOP;

    v_tip := 0; v_fee := 0; v_disc := 0;
    IF v_src = 'delivery' THEN v_fee := 3 + floor(random() * 6)::int; END IF;
    IF v_status IN ('paid','closed','refunded') THEN
      IF random() < 0.15 THEN v_tip := round(v_sub * (0.05 + random() * 0.08)); END IF;
      IF v_status = 'paid' AND random() < 0.08 THEN
        v_disc := round(v_sub * 0.10);
      END IF;
    END IF;
    v_total := v_sub + v_tip + v_fee - v_disc;

    -- ── order row ──────────────────────────────────────────────────────
    INSERT INTO orders (
      organization_id, location_id, total_amount, total_price, status,
      order_source, order_type, order_number, table_number,
      customer_id, customer_name, customer_phone, guest_count,
      created_by, assigned_to, payment_method,
      paid_amount, cash_amount, card_amount, tip_amount,
      discount_amount, discount_type, delivery_fee, refund_amount,
      created_at, updated_at, paid_at, closed_at, cancelled_at,
      kitchen_status, is_served, inventory_deducted,
      cogs, profit, version, split_count, is_draft
    ) VALUES (
      v_org, v_loc, v_total, v_total, v_status,
      v_src, v_src, v_order_number, v_table,
      v_cust_id, v_cust_name, v_cust_phone, v_guest,
      v_staff[v_si], v_staff[v_si], v_method,
      CASE WHEN v_status IN ('paid','closed') THEN v_total
           WHEN v_status = 'refunded' THEN 0 ELSE 0 END,
      CASE WHEN v_status IN ('paid','closed') AND v_method = 'cash' THEN v_total ELSE 0 END,
      CASE WHEN v_status IN ('paid','closed') AND v_method = 'card' THEN v_total ELSE 0 END,
      v_tip,
      v_disc, CASE WHEN v_disc > 0 THEN 'percent' ELSE NULL END, v_fee,
      CASE WHEN v_status = 'refunded' THEN v_total ELSE 0 END,
      v_t,
      CASE WHEN v_status = 'paid' THEN v_paid_at
           WHEN v_status = 'closed' THEN v_paid_at + interval '5 minutes'
           WHEN v_status = 'refunded' THEN v_refund_at
           ELSE v_t END,
      CASE WHEN v_status IN ('paid','closed','refunded') THEN v_paid_at ELSE NULL END,
      CASE WHEN v_status = 'closed' THEN v_paid_at + interval '5 minutes' ELSE NULL END,
      CASE WHEN v_status = 'cancelled' THEN v_cancel_at ELSE NULL END,
      CASE WHEN v_status IN ('paid','closed','refunded') THEN 'served' ELSE 'pending' END,
      v_status IN ('paid','closed','refunded'),
      v_status IN ('paid','closed','refunded'),
      v_cogs, v_total - v_cogs, 1, 1, false
    ) RETURNING id INTO v_order;

    -- ── items ──────────────────────────────────────────────────────────
    FOR v_j IN 1..v_n_items LOOP
      INSERT INTO order_items (
        order_id, product_id, quantity, unit_price, total_price,
        product_name, image_url, kitchen_status, course, station,
        served_quantity, modifiers, tax_rate, tax_amount, created_at
      ) VALUES (
        v_order, v_pids[v_j], v_qtys[v_j], v_pprices[v_j], v_pprices[v_j] * v_qtys[v_j],
        v_pnames[v_j], v_pimgs[v_j],
        CASE WHEN v_status IN ('paid','closed','refunded') THEN 'served' ELSE 'pending' END,
        'main', 'all',
        CASE WHEN v_status IN ('paid','closed','refunded') THEN v_qtys[v_j] ELSE 0 END,
        '[]', 0, 0, v_t
      );
    END LOOP;

    -- ── payment rows (payments = history detail; order_payments = ledger) ─
    IF v_status IN ('paid','closed','refunded') THEN
      INSERT INTO payments (
        order_id, payment_method, amount, tip_amount, currency, status,
        idempotency_key, performed_by, performed_by_name, created_at
      ) VALUES (
        v_order, v_method, v_total, v_tip, 'AZN', 'completed',
        'SIM-' || lpad(floor(random() * 1000000)::int::text, 6, '0'),
        v_staff[v_si], v_names[v_si], v_paid_at
      );
      INSERT INTO order_payments (
        order_id, payment_method, method, amount, status,
        is_refund, is_partial, created_by, reference, currency, created_at
      ) VALUES (
        v_order, v_method, v_method, v_total, 'captured',
        false, false, v_staff[v_si],
        'SIM-' || lpad(floor(random() * 1000000)::int::text, 6, '0'), 'AZN', v_paid_at
      );
      IF v_status = 'refunded' THEN
        INSERT INTO payments (
          order_id, payment_method, amount, currency, status,
          is_refund, performed_by, performed_by_name, created_at
        ) VALUES (
          v_order, v_method, v_total, 'AZN', 'completed',
          true, v_staff[v_si], v_names[v_si], v_refund_at
        );
        INSERT INTO order_payments (
          order_id, payment_method, method, amount, status,
          is_refund, is_partial, created_by, reference, currency, created_at
        ) VALUES (
          v_order, v_method, v_method, v_total, 'captured',
          true, false, v_staff[v_si],
          'SIM-' || lpad(floor(random() * 1000000)::int::text, 6, '0'), 'AZN', v_refund_at
        );
      END IF;
    END IF;

    -- ── audit rows (detail timeline + İstisnalar feed) ─────────────────
    INSERT INTO audit_logs (
      action, record_id, table_name, performed_by, staff_name,
      details, reason, created_at
    ) VALUES (
      'status_change', v_order, 'orders', v_staff[v_si], v_names[v_si],
      jsonb_build_object('from', 'confirmed', 'to', v_status),
      NULL,
      CASE WHEN v_status IN ('paid','closed') THEN v_paid_at
           WHEN v_status = 'refunded' THEN v_paid_at
           WHEN v_status = 'cancelled' THEN v_cancel_at
           ELSE v_t END
    );
    IF v_status = 'cancelled' THEN
      v_r := floor(random() * 5)::int;
      INSERT INTO cancelled_orders (order_id, table_number, total_amount, reason, reason_text, items, created_at)
      VALUES (v_order, v_table, v_total, v_reasons[1 + v_r], v_reason_texts[1 + v_r],
              jsonb_build_array(v_pnames[1]), v_cancel_at);
      INSERT INTO audit_logs (action, record_id, table_name, performed_by, staff_name, details, reason, created_at)
      VALUES ('cancel', v_order, 'orders', v_staff[v_si], v_names[v_si],
              jsonb_build_object('from','confirmed','to','cancelled'), v_reason_texts[1 + v_r], v_cancel_at);
    ELSIF v_status = 'voided' THEN
      INSERT INTO audit_logs (action, record_id, table_name, performed_by, staff_name, details, reason, created_at)
      VALUES ('void', v_order, 'orders', v_staff[v_si], v_names[v_si],
              jsonb_build_object('from','confirmed','to','voided'), 'Sifariş ləğv edildi', v_t + interval '10 minutes');
    ELSIF v_status = 'refunded' THEN
      INSERT INTO audit_logs (action, record_id, table_name, performed_by, staff_name, details, reason, created_at)
      VALUES ('refund', v_order, 'orders', v_staff[v_si], v_names[v_si],
              jsonb_build_object('amount', v_total, 'method', v_method), v_refreasons[1 + floor(random()*3)::int], v_refund_at);
    END IF;
  END LOOP;

  -- ── advance the daily sequences so future app orders never collide ──
  UPDATE order_number_sequences SET last_num = v_seq_ord WHERE prefix = 'ORD-' AND location_id = v_loc;
  UPDATE order_number_sequences SET last_num = v_seq_a   WHERE prefix = '#A'   AND location_id = v_loc;
  UPDATE order_number_sequences SET last_num = v_seq_d   WHERE prefix = '#D'   AND location_id = v_loc;
END $$;

ALTER TABLE order_items ENABLE TRIGGER trg_kds_ticket_emit;

DROP TABLE IF EXISTS _seed_products;
DROP TABLE IF EXISTS _seed_tables;
DROP TABLE IF EXISTS _seed_customers;

COMMIT;

-- ── verification ─────────────────────────────────────────────────────────
SELECT status, count(*) FROM orders GROUP BY status ORDER BY 2 DESC;
SELECT order_source, count(*) FROM orders GROUP BY 1 ORDER BY 2 DESC;
SELECT count(*) AS items  FROM order_items;
SELECT count(*) AS pays   FROM payments;
SELECT count(*) AS ledg   FROM order_payments;
SELECT count(*) AS audits FROM audit_logs WHERE record_id IS NOT NULL;
SELECT count(*) AS canc   FROM cancelled_orders;
SELECT min(created_at), max(created_at) FROM orders;
SELECT current_order_id IS NOT NULL AS any_table_occupied FROM table_floors LIMIT 1;
