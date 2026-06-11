-- ═══════════════════════════════════════════════════════════════
-- SAITO ADMIN — Test Satış Data-sı (Reverse Inventory üçün)
-- Supabase SQL Editor-da run edin
-- ═══════════════════════════════════════════════════════════════
-- Bu SQL aşağıdakıları yaradır:
--   • 5 test sifarişi (status = 'paid', son 3 gündə)
--   • Hər sifarişə aid order_items
--   • Hər sifariş üçün order_consumption inventory_logs
--   • İngredient-lərin current_stock + theoretical_stock yeniləməsi
-- ═══════════════════════════════════════════════════════════════

-- ── FUNKSİYA: order_consumption log yarat ─────────────────────
-- Bu funksiya manual olaraq order_consumption log-larını yaradır
-- və ingredient cədvəlində current_stock + theoretical_stock yeniləyir.
CREATE OR REPLACE FUNCTION create_order_consumption(
  p_ingredient_name TEXT,
  p_quantity NUMERIC,
  p_order_id UUID,
  p_reason TEXT DEFAULT 'Test sifarişi'
) RETURNS void AS $$
DECLARE
  v_ingredient_id UUID;
  v_unit_cost NUMERIC;
BEGIN
  SELECT id, average_cost_per_unit INTO v_ingredient_id, v_unit_cost
  FROM ingredients WHERE name = p_ingredient_name;

  IF v_ingredient_id IS NULL THEN
    RAISE WARNING 'Ingredient tapılmadı: %', p_ingredient_name;
    RETURN;
  END IF;

  -- inventory_log əlavə et
  INSERT INTO inventory_logs (ingredient_id, type, quantity, cost_per_unit, reason, order_id, created_at)
  VALUES (v_ingredient_id, 'order_consumption', p_quantity, v_unit_cost, p_reason, p_order_id, NOW());

  -- current_stock azalt
  UPDATE ingredients SET
    current_stock = GREATEST(0, current_stock - ABS(p_quantity)),
    theoretical_stock = GREATEST(0, theoretical_stock - ABS(p_quantity))
  WHERE id = v_ingredient_id;
END;
$$ LANGUAGE plpgsql;


-- ── TEST SİFARİŞLƏRİ (son 3 gün) ──────────────────────────────
-- Hər sifariş real ssenari: 2-4 nəfərlik masa, müxtəlif yeməklər

-- Sifariş 1: Masa 3 — Dragon Roll + Philadelphia Roll + Maki Somon
INSERT INTO orders (id, table_number, status, total_amount, order_type, created_at)
VALUES ('00000000-0000-0000-0000-000000000001', 3, 'paid', 46.50, 'dine_in', NOW() - INTERVAL '3 days')
ON CONFLICT (id) DO NOTHING;

INSERT INTO order_items (order_id, product_id, product_name, quantity, unit_price) VALUES
  ('00000000-0000-0000-0000-000000000001', 'a1b2c3d4-0001-0000-0000-000000000001', 'Dragon Roll', 1, 18.00),
  ('00000000-0000-0000-0000-000000000001', 'a1b2c3d4-0001-0000-0000-000000000002', 'Philadelphia Roll', 1, 16.50),
  ('00000000-0000-0000-0000-000000000001', 'a1b2c3d4-0001-0000-0000-000000000007', 'Maki Somon', 1, 12.00)
ON CONFLICT DO NOTHING;

-- Dragon Roll: Somon 80g, Düyü 120g, Nori 1pc, Avokado 40g, Sésam 5g
SELECT create_order_consumption('Somon file', -80, '00000000-0000-0000-0000-000000000001', 'Sifariş #1 — Dragon Roll');
SELECT create_order_consumption('Düyü (sushi)', -120, '00000000-0000-0000-0000-000000000001', 'Sifariş #1 — Dragon Roll');
SELECT create_order_consumption('Nori (yosun)', -1, '00000000-0000-0000-0000-000000000001', 'Sifariş #1 — Dragon Roll');
SELECT create_order_consumption('Avokado', -40, '00000000-0000-0000-0000-000000000001', 'Sifariş #1 — Dragon Roll');
SELECT create_order_consumption('Sésam toxumu', -5, '00000000-0000-0000-0000-000000000001', 'Sifariş #1 — Dragon Roll');
-- Philadelphia: Somon 60g, Düyü 120g, Nori 1pc, Pendir 50g
SELECT create_order_consumption('Somon file', -60, '00000000-0000-0000-0000-000000000001', 'Sifariş #1 — Philadelphia Roll');
SELECT create_order_consumption('Düyü (sushi)', -120, '00000000-0000-0000-0000-000000000001', 'Sifariş #1 — Philadelphia Roll');
SELECT create_order_consumption('Nori (yosun)', -1, '00000000-0000-0000-0000-000000000001', 'Sifariş #1 — Philadelphia Roll');
SELECT create_order_consumption('Filadelfiya pendiri', -50, '00000000-0000-0000-0000-000000000001', 'Sifariş #1 — Philadelphia Roll');
-- Maki Somon: Somon 50g, Düyü 80g, Nori 1pc
SELECT create_order_consumption('Somon file', -50, '00000000-0000-0000-0000-000000000001', 'Sifariş #1 — Maki Somon');
SELECT create_order_consumption('Düyü (sushi)', -80, '00000000-0000-0000-0000-000000000001', 'Sifariş #1 — Maki Somon');
SELECT create_order_consumption('Nori (yosun)', -1, '00000000-0000-0000-0000-000000000001', 'Sifariş #1 — Maki Somon');

-- ── Sifariş 2: Masa 7 — Spicy Tuna + California Roll ──────────
INSERT INTO orders (id, table_number, status, total_amount, order_type, created_at)
VALUES ('00000000-0000-0000-0000-000000000002', 7, 'paid', 32.00, 'dine_in', NOW() - INTERVAL '2 days')
ON CONFLICT (id) DO NOTHING;

INSERT INTO order_items (order_id, product_id, product_name, quantity, unit_price) VALUES
  ('00000000-0000-0000-0000-000000000002', 'a1b2c3d4-0001-0000-0000-000000000004', 'Spicy Tuna Roll', 1, 17.00),
  ('00000000-0000-0000-0000-000000000002', 'a1b2c3d4-0001-0000-0000-000000000003', 'California Roll', 1, 15.00)
ON CONFLICT DO NOTHING;

-- Spicy Tuna: Ton 70g, Düyü 120g, Nori 1pc, Soya 10ml, Wasabi 3g
SELECT create_order_consumption('Ton file', -70, '00000000-0000-0000-0000-000000000002', 'Sifariş #2 — Spicy Tuna');
SELECT create_order_consumption('Düyü (sushi)', -120, '00000000-0000-0000-0000-000000000002', 'Sifariş #2 — Spicy Tuna');
SELECT create_order_consumption('Nori (yosun)', -1, '00000000-0000-0000-0000-000000000002', 'Sifariş #2 — Spicy Tuna');
SELECT create_order_consumption('Soya sousu', -10, '00000000-0000-0000-0000-000000000002', 'Sifariş #2 — Spicy Tuna');
SELECT create_order_consumption('Wasabi', -3, '00000000-0000-0000-0000-000000000002', 'Sifariş #2 — Spicy Tuna');
-- California: Krevet 50g, Düyü 120g, Nori 1pc, Avokado 30g, İkra 15g
SELECT create_order_consumption('Krevetka', -50, '00000000-0000-0000-0000-000000000002', 'Sifariş #2 — California');
SELECT create_order_consumption('Düyü (sushi)', -120, '00000000-0000-0000-0000-000000000002', 'Sifariş #2 — California');
SELECT create_order_consumption('Nori (yosun)', -1, '00000000-0000-0000-0000-000000000002', 'Sifariş #2 — California');
SELECT create_order_consumption('Avokado', -30, '00000000-0000-0000-0000-000000000002', 'Sifariş #2 — California');
SELECT create_order_consumption('İkra (masqut)', -15, '00000000-0000-0000-0000-000000000002', 'Sifariş #2 — California');

-- ── Sifariş 3: Masa 1 — Unagi Roll + Tempura Roll + Ebi Nigiri ─
INSERT INTO orders (id, table_number, status, total_amount, order_type, created_at)
VALUES ('00000000-0000-0000-0000-000000000003', 1, 'paid', 49.50, 'dine_in', NOW() - INTERVAL '1 day')
ON CONFLICT (id) DO NOTHING;

INSERT INTO order_items (order_id, product_id, product_name, quantity, unit_price) VALUES
  ('00000000-0000-0000-0000-000000000003', 'a1b2c3d4-0001-0000-0000-000000000005', 'Unagi Roll', 1, 19.50),
  ('00000000-0000-0000-0000-000000000003', 'a1b2c3d4-0001-0000-0000-000000000006', 'Tempura Roll', 1, 16.00),
  ('00000000-0000-0000-0000-000000000003', 'a1b2c3d4-0001-0000-0000-000000000008', 'Ebi Nigiri', 1, 14.00)
ON CONFLICT DO NOTHING;

-- Unagi Roll: Unagi 80g, Düyü 120g, Nori 1pc, Avokado 30g, Balsamik 5ml
SELECT create_order_consumption('Unagi (dəniz kilsəsi)', -80, '00000000-0000-0000-0000-000000000003', 'Sifariş #3 — Unagi Roll');
SELECT create_order_consumption('Düyü (sushi)', -120, '00000000-0000-0000-0000-000000000003', 'Sifariş #3 — Unagi Roll');
SELECT create_order_consumption('Nori (yosun)', -1, '00000000-0000-0000-0000-000000000003', 'Sifariş #3 — Unagi Roll');
SELECT create_order_consumption('Avokado', -30, '00000000-0000-0000-0000-000000000003', 'Sifariş #3 — Unagi Roll');
SELECT create_order_consumption('Balsamik sous', -5, '00000000-0000-0000-0000-000000000003', 'Sifariş #3 — Unagi Roll');
-- Tempura Roll: Krevet 60g, Düyü 120g, Nori 1pc, Avokado 25g
SELECT create_order_consumption('Krevetka', -60, '00000000-0000-0000-0000-000000000003', 'Sifariş #3 — Tempura Roll');
SELECT create_order_consumption('Düyü (sushi)', -120, '00000000-0000-0000-0000-000000000003', 'Sifariş #3 — Tempura Roll');
SELECT create_order_consumption('Nori (yosun)', -1, '00000000-0000-0000-0000-000000000003', 'Sifariş #3 — Tempura Roll');
SELECT create_order_consumption('Avokado', -25, '00000000-0000-0000-0000-000000000003', 'Sifariş #3 — Tempura Roll');
-- Ebi Nigiri: Krevet 40g, Düyü 60g
SELECT create_order_consumption('Krevetka', -40, '00000000-0000-0000-0000-000000000003', 'Sifariş #3 — Ebi Nigiri');
SELECT create_order_consumption('Düyü (sushi)', -60, '00000000-0000-0000-0000-000000000003', 'Sifariş #3 — Ebi Nigiri');

-- ── Sifariş 4: Masa 5 — Tuna Sashimi + Vegetarian Roll ────────
INSERT INTO orders (id, table_number, status, total_amount, order_type, created_at)
VALUES ('00000000-0000-0000-0000-000000000004', 5, 'paid', 35.00, 'dine_in', NOW() - INTERVAL '12 hours')
ON CONFLICT (id) DO NOTHING;

INSERT INTO order_items (order_id, product_id, product_name, quantity, unit_price) VALUES
  ('00000000-0000-0000-0000-000000000004', 'a1b2c3d4-0001-0000-0000-000000000009', 'Tuna Sashimi', 1, 22.00),
  ('00000000-0000-0000-0000-000000000004', 'a1b2c3d4-0001-0000-0000-000000000010', 'Vegetarian Roll', 1, 13.00)
ON CONFLICT DO NOTHING;

-- Tuna Sashimi: Ton 120g, Soya 15ml, Wasabi 5g, Zəncəfil 10g
SELECT create_order_consumption('Ton file', -120, '00000000-0000-0000-0000-000000000004', 'Sifariş #4 — Tuna Sashimi');
SELECT create_order_consumption('Soya sousu', -15, '00000000-0000-0000-0000-000000000004', 'Sifariş #4 — Tuna Sashimi');
SELECT create_order_consumption('Wasabi', -5, '00000000-0000-0000-0000-000000000004', 'Sifariş #4 — Tuna Sashimi');
SELECT create_order_consumption('Zəncəfil (marinad)', -10, '00000000-0000-0000-0000-000000000004', 'Sifariş #4 — Tuna Sashimi');
-- Vegetarian Roll: Tofu 70g, Düyü 120g, Nori 1pc, Avokado 35g, Xiyar 20g, Kələm 15g
SELECT create_order_consumption('Tofu', -70, '00000000-0000-0000-0000-000000000004', 'Sifariş #4 — Vegetarian Roll');
SELECT create_order_consumption('Düyü (sushi)', -120, '00000000-0000-0000-0000-000000000004', 'Sifariş #4 — Vegetarian Roll');
SELECT create_order_consumption('Nori (yosun)', -1, '00000000-0000-0000-0000-000000000004', 'Sifariş #4 — Vegetarian Roll');
SELECT create_order_consumption('Avokado', -35, '00000000-0000-0000-0000-000000000004', 'Sifariş #4 — Vegetarian Roll');
SELECT create_order_consumption('Xiyar', -20, '00000000-0000-0000-0000-000000000004', 'Sifariş #4 — Vegetarian Roll');
SELECT create_order_consumption('Qırmızı kələm', -15, '00000000-0000-0000-0000-000000000004', 'Sifariş #4 — Vegetarian Roll');

-- ── Sifariş 5: Masa 2 — Dragon Roll x2 + Philadelphia x2 ──────
INSERT INTO orders (id, table_number, status, total_amount, order_type, created_at)
VALUES ('00000000-0000-0000-0000-000000000005', 2, 'paid', 69.00, 'dine_in', NOW() - INTERVAL '6 hours')
ON CONFLICT (id) DO NOTHING;

INSERT INTO order_items (order_id, product_id, product_name, quantity, unit_price) VALUES
  ('00000000-0000-0000-0000-000000000005', 'a1b2c3d4-0001-0000-0000-000000000001', 'Dragon Roll', 2, 18.00),
  ('00000000-0000-0000-0000-000000000005', 'a1b2c3d4-0001-0000-0000-000000000002', 'Philadelphia Roll', 2, 16.50)
ON CONFLICT DO NOTHING;

-- Dragon Roll x2
SELECT create_order_consumption('Somon file', -160, '00000000-0000-0000-0000-000000000005', 'Sifariş #5 — Dragon Roll x2');
SELECT create_order_consumption('Düyü (sushi)', -240, '00000000-0000-0000-0000-000000000005', 'Sifariş #5 — Dragon Roll x2');
SELECT create_order_consumption('Nori (yosun)', -2, '00000000-0000-0000-0000-000000000005', 'Sifariş #5 — Dragon Roll x2');
SELECT create_order_consumption('Avokado', -80, '00000000-0000-0000-0000-000000000005', 'Sifariş #5 — Dragon Roll x2');
SELECT create_order_consumption('Sésam toxumu', -10, '00000000-0000-0000-0000-000000000005', 'Sifariş #5 — Dragon Roll x2');
-- Philadelphia x2
SELECT create_order_consumption('Somon file', -120, '00000000-0000-0000-0000-000000000005', 'Sifariş #5 — Philadelphia x2');
SELECT create_order_consumption('Düyü (sushi)', -240, '00000000-0000-0000-0000-000000000005', 'Sifariş #5 — Philadelphia x2');
SELECT create_order_consumption('Nori (yosun)', -2, '00000000-0000-0000-0000-000000000005', 'Sifariş #5 — Philadelphia x2');
SELECT create_order_consumption('Filadelfiya pendiri', -100, '00000000-0000-0000-0000-000000000005', 'Sifariş #5 — Philadelphia x2');


-- ═══════════════════════════════════════════════════════════════
-- YOXLAMA SORĞULARI
-- ═══════════════════════════════════════════════════════════════

-- 1) Sifarişlər
SELECT id, table_number, status, total_amount, created_at
FROM orders
WHERE id IN (
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000003',
  '00000000-0000-0000-0000-000000000004',
  '00000000-0000-0000-0000-000000000005'
);

-- 2) Ümumi stok vəziyyəti (ən çox istifadə olunan ingredientlər)
SELECT 
  i.name,
  i.unit,
  i.current_stock,
  i.theoretical_stock,
  i.current_stock - i.theoretical_stock AS fərq,
  ROUND(
    CASE WHEN i.theoretical_stock > 0 
      THEN (i.current_stock - i.theoretical_stock)::NUMERIC / i.theoretical_stock * 100 
      ELSE 0 
    END, 1
  ) AS fərq_pct
FROM ingredients i
WHERE i.name IN ('Somon file', 'Ton file', 'Düyü (sushi)', 'Nori (yosun)', 'Avokado', 'Krevetka')
ORDER BY fərq DESC;

-- 3) Audit Trail-da görünən order_consumption log-ları
SELECT 
  il.id,
  i.name AS ingredient,
  il.quantity,
  il.reason,
  il.order_id,
  il.created_at
FROM inventory_logs il
JOIN ingredients i ON i.id = il.ingredient_id
WHERE il.type = 'order_consumption'
  AND il.created_at >= NOW() - INTERVAL '7 days'
ORDER BY il.created_at DESC;


-- ═══════════════════════════════════════════════════════════════
-- TƏMİZLƏMƏ (istəsən run et)
-- ═══════════════════════════════════════════════════════════════
/*
DELETE FROM inventory_logs WHERE order_id IN (
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000003',
  '00000000-0000-0000-0000-000000000004',
  '00000000-0000-0000-0000-000000000005'
);
DELETE FROM order_items WHERE order_id IN (
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000003',
  '00000000-0000-0000-0000-000000000004',
  '00000000-0000-0000-0000-000000000005'
);
DELETE FROM orders WHERE id IN (
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000003',
  '00000000-0000-0000-0000-000000000004',
  '00000000-0000-0000-0000-000000000005'
);
*/
