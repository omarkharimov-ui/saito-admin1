-- ═══════════════════════════════════════════════════════════════
-- SAITO ADMIN — Tam Test Data (Seed + Test Satış)
-- Supabase SQL Editor-da bir dəfəyə run edin
-- ═══════════════════════════════════════════════════════════════
-- Bu SQL:
--   1. Xəmmallar (ingredients) — 25 növ
--   2. Məhsullar (products) — 10 sushi, sabit UUID
--   3. Reseptlər (recipes) — hər məhsul üçün
--   4. Stok daxilolma (inventory_logs) — ilkin stok
--   5. Test sifarişləri (orders + order_items) — 5 paid sifariş
--   6. Order consumption logları
-- ═══════════════════════════════════════════════════════════════

-- ── 1. XƏMMALLAR (ingredients) ────────────────────────────────
INSERT INTO ingredients (name, unit, current_stock, theoretical_stock, critical_limit, average_cost_per_unit) VALUES
  ('Somon file', 'gram', 4370, 5000, 500, 0.045),
  ('Ton file', 'gram', 2850, 3000, 300, 0.052),
  ('Düyü (sushi)', 'gram', 8750, 10000, 1000, 0.003),
  ('Nori (yosun)', 'piece', 173, 200, 20, 0.15),
  ('Avokado', 'gram', 1240, 1500, 200, 0.012),
  ('Xiyar', 'gram', 1680, 2000, 150, 0.004),
  ('Filadelfiya pendiri', 'gram', 2150, 2500, 300, 0.018),
  ('İkra (masqut)', 'gram', 645, 800, 80, 0.08),
  ('Unagi (dəniz kilsəsi)', 'gram', 980, 1000, 150, 0.065),
  ('Qarğıdalı', 'gram', 1430, 1500, 100, 0.006),
  ('Soya sousu', 'ml', 3780, 4000, 500, 0.005),
  ('Zəncəfil (marinad)', 'gram', 420, 500, 50, 0.02),
  ('Wasabi', 'gram', 265, 300, 30, 0.04),
  ('Bənövşəyi soğan', 'gram', 310, 400, 40, 0.008),
  ('Qızardılmış soğan', 'gram', 540, 600, 60, 0.01),
  ('Balsamik sous', 'ml', 720, 800, 80, 0.015),
  ('Sésam toxumu', 'gram', 380, 500, 40, 0.012),
  ('Krevetka', 'gram', 1560, 2000, 200, 0.038),
  ('Dəniz güləkləri', 'gram', 890, 1000, 120, 0.025),
  ('Tofu', 'gram', 1340, 1500, 100, 0.009),
  ('Qırmızı kələm', 'gram', 760, 800, 80, 0.005),
  ('Mango', 'gram', 520, 600, 60, 0.011),
  ('Yengən (qaçaq çəyirdək)', 'gram', 430, 500, 50, 0.022),
  ('Qaynadılmış heyva', 'gram', 290, 400, 40, 0.016),
  ('Marul', 'gram', 1380, 1500, 150, 0.003)
ON CONFLICT DO NOTHING;


-- ── 2. MƏHSULLAR (products) — sabit UUID ilə ────────────────
INSERT INTO products (id, name, name_az, name_en, name_ru, price, has_active_recipe, is_ready_product) VALUES
  ('a1b2c3d4-0001-0000-0000-000000000001', 'Dragon Roll', 'Dragon Roll', 'Dragon Roll', 'Дракон Ролл', 18.00, true, false),
  ('a1b2c3d4-0001-0000-0000-000000000002', 'Philadelphia Roll', 'Philadelphia Roll', 'Philadelphia Roll', 'Филадельфия Ролл', 16.50, true, false),
  ('a1b2c3d4-0001-0000-0000-000000000003', 'California Roll', 'California Roll', 'California Roll', 'Калифорния Ролл', 15.00, true, false),
  ('a1b2c3d4-0001-0000-0000-000000000004', 'Spicy Tuna Roll', 'Spicy Tuna Roll', 'Spicy Tuna Roll', 'Острый Тунец Ролл', 17.00, true, false),
  ('a1b2c3d4-0001-0000-0000-000000000005', 'Unagi Roll', 'Unagi Roll', 'Unagi Roll', 'Унаги Ролл', 19.50, true, false),
  ('a1b2c3d4-0001-0000-0000-000000000006', 'Tempura Roll', 'Tempura Roll', 'Tempura Roll', 'Темпура Ролл', 16.00, true, false),
  ('a1b2c3d4-0001-0000-0000-000000000007', 'Maki Somon', 'Maki Somon', 'Salmon Maki', 'Лосось Маки', 12.00, true, false),
  ('a1b2c3d4-0001-0000-0000-000000000008', 'Ebi Nigiri', 'Ebi Nigiri', 'Shrimp Nigiri', 'Креветка Нигири', 14.00, true, false),
  ('a1b2c3d4-0001-0000-0000-000000000009', 'Tuna Sashimi', 'Tuna Sashimi', 'Tuna Sashimi', 'Тунец Сашими', 22.00, true, false),
  ('a1b2c3d4-0001-0000-0000-000000000010', 'Vegetarian Roll', 'Vegetarian Roll', 'Vegetarian Roll', 'Вегетарианский Ролл', 13.00, true, false)
ON CONFLICT (id) DO NOTHING;


-- ── 3. RESEPTLƏR (recipes) ────────────────────────────────────
-- Dragon Roll: Somon 80g, Düyü 120g, Nori 1pc, Avokado 40g, Sésam 5g
INSERT INTO recipes (menu_item_id, ingredient_id, quantity_required, is_ai_suggested) VALUES
  ('a1b2c3d4-0001-0000-0000-000000000001', (SELECT id FROM ingredients WHERE name = 'Somon file'), 80, true),
  ('a1b2c3d4-0001-0000-0000-000000000001', (SELECT id FROM ingredients WHERE name = 'Düyü (sushi)'), 120, true),
  ('a1b2c3d4-0001-0000-0000-000000000001', (SELECT id FROM ingredients WHERE name = 'Nori (yosun)'), 1, true),
  ('a1b2c3d4-0001-0000-0000-000000000001', (SELECT id FROM ingredients WHERE name = 'Avokado'), 40, true),
  ('a1b2c3d4-0001-0000-0000-000000000001', (SELECT id FROM ingredients WHERE name = 'Sésam toxumu'), 5, true)
ON CONFLICT DO NOTHING;

-- Philadelphia: Somon 60g, Düyü 120g, Nori 1pc, Pendir 50g
INSERT INTO recipes (menu_item_id, ingredient_id, quantity_required, is_ai_suggested) VALUES
  ('a1b2c3d4-0001-0000-0000-000000000002', (SELECT id FROM ingredients WHERE name = 'Somon file'), 60, true),
  ('a1b2c3d4-0001-0000-0000-000000000002', (SELECT id FROM ingredients WHERE name = 'Düyü (sushi)'), 120, true),
  ('a1b2c3d4-0001-0000-0000-000000000002', (SELECT id FROM ingredients WHERE name = 'Nori (yosun)'), 1, true),
  ('a1b2c3d4-0001-0000-0000-000000000002', (SELECT id FROM ingredients WHERE name = 'Filadelfiya pendiri'), 50, true)
ON CONFLICT DO NOTHING;

-- California: Krevet 50g, Düyü 120g, Nori 1pc, Avokado 30g, İkra 15g
INSERT INTO recipes (menu_item_id, ingredient_id, quantity_required, is_ai_suggested) VALUES
  ('a1b2c3d4-0001-0000-0000-000000000003', (SELECT id FROM ingredients WHERE name = 'Krevetka'), 50, true),
  ('a1b2c3d4-0001-0000-0000-000000000003', (SELECT id FROM ingredients WHERE name = 'Düyü (sushi)'), 120, true),
  ('a1b2c3d4-0001-0000-0000-000000000003', (SELECT id FROM ingredients WHERE name = 'Nori (yosun)'), 1, true),
  ('a1b2c3d4-0001-0000-0000-000000000003', (SELECT id FROM ingredients WHERE name = 'Avokado'), 30, true),
  ('a1b2c3d4-0001-0000-0000-000000000003', (SELECT id FROM ingredients WHERE name = 'İkra (masqut)'), 15, true)
ON CONFLICT DO NOTHING;

-- Spicy Tuna: Ton 70g, Düyü 120g, Nori 1pc, Soya 10ml, Wasabi 3g
INSERT INTO recipes (menu_item_id, ingredient_id, quantity_required, is_ai_suggested) VALUES
  ('a1b2c3d4-0001-0000-0000-000000000004', (SELECT id FROM ingredients WHERE name = 'Ton file'), 70, true),
  ('a1b2c3d4-0001-0000-0000-000000000004', (SELECT id FROM ingredients WHERE name = 'Düyü (sushi)'), 120, true),
  ('a1b2c3d4-0001-0000-0000-000000000004', (SELECT id FROM ingredients WHERE name = 'Nori (yosun)'), 1, true),
  ('a1b2c3d4-0001-0000-0000-000000000004', (SELECT id FROM ingredients WHERE name = 'Soya sousu'), 10, true),
  ('a1b2c3d4-0001-0000-0000-000000000004', (SELECT id FROM ingredients WHERE name = 'Wasabi'), 3, true)
ON CONFLICT DO NOTHING;

-- Unagi Roll: Unagi 80g, Düyü 120g, Nori 1pc, Avokado 30g, Balsamik 5ml
INSERT INTO recipes (menu_item_id, ingredient_id, quantity_required, is_ai_suggested) VALUES
  ('a1b2c3d4-0001-0000-0000-000000000005', (SELECT id FROM ingredients WHERE name = 'Unagi (dəniz kilsəsi)'), 80, true),
  ('a1b2c3d4-0001-0000-0000-000000000005', (SELECT id FROM ingredients WHERE name = 'Düyü (sushi)'), 120, true),
  ('a1b2c3d4-0001-0000-0000-000000000005', (SELECT id FROM ingredients WHERE name = 'Nori (yosun)'), 1, true),
  ('a1b2c3d4-0001-0000-0000-000000000005', (SELECT id FROM ingredients WHERE name = 'Avokado'), 30, true),
  ('a1b2c3d4-0001-0000-0000-000000000005', (SELECT id FROM ingredients WHERE name = 'Balsamik sous'), 5, true)
ON CONFLICT DO NOTHING;

-- Tempura Roll: Krevet 60g, Düyü 120g, Nori 1pc, Avokado 25g
INSERT INTO recipes (menu_item_id, ingredient_id, quantity_required, is_ai_suggested) VALUES
  ('a1b2c3d4-0001-0000-0000-000000000006', (SELECT id FROM ingredients WHERE name = 'Krevetka'), 60, true),
  ('a1b2c3d4-0001-0000-0000-000000000006', (SELECT id FROM ingredients WHERE name = 'Düyü (sushi)'), 120, true),
  ('a1b2c3d4-0001-0000-0000-000000000006', (SELECT id FROM ingredients WHERE name = 'Nori (yosun)'), 1, true),
  ('a1b2c3d4-0001-0000-0000-000000000006', (SELECT id FROM ingredients WHERE name = 'Avokado'), 25, true)
ON CONFLICT DO NOTHING;

-- Maki Somon: Somon 50g, Düyü 80g, Nori 1pc
INSERT INTO recipes (menu_item_id, ingredient_id, quantity_required, is_ai_suggested) VALUES
  ('a1b2c3d4-0001-0000-0000-000000000007', (SELECT id FROM ingredients WHERE name = 'Somon file'), 50, true),
  ('a1b2c3d4-0001-0000-0000-000000000007', (SELECT id FROM ingredients WHERE name = 'Düyü (sushi)'), 80, true),
  ('a1b2c3d4-0001-0000-0000-000000000007', (SELECT id FROM ingredients WHERE name = 'Nori (yosun)'), 1, true)
ON CONFLICT DO NOTHING;

-- Ebi Nigiri: Krevet 40g, Düyü 60g
INSERT INTO recipes (menu_item_id, ingredient_id, quantity_required, is_ai_suggested) VALUES
  ('a1b2c3d4-0001-0000-0000-000000000008', (SELECT id FROM ingredients WHERE name = 'Krevetka'), 40, true),
  ('a1b2c3d4-0001-0000-0000-000000000008', (SELECT id FROM ingredients WHERE name = 'Düyü (sushi)'), 60, true)
ON CONFLICT DO NOTHING;

-- Tuna Sashimi: Ton 120g, Soya 15ml, Wasabi 5g, Zəncəfil 10g
INSERT INTO recipes (menu_item_id, ingredient_id, quantity_required, is_ai_suggested) VALUES
  ('a1b2c3d4-0001-0000-0000-000000000009', (SELECT id FROM ingredients WHERE name = 'Ton file'), 120, true),
  ('a1b2c3d4-0001-0000-0000-000000000009', (SELECT id FROM ingredients WHERE name = 'Soya sousu'), 15, true),
  ('a1b2c3d4-0001-0000-0000-000000000009', (SELECT id FROM ingredients WHERE name = 'Wasabi'), 5, true),
  ('a1b2c3d4-0001-0000-0000-000000000009', (SELECT id FROM ingredients WHERE name = 'Zəncəfil (marinad)'), 10, true)
ON CONFLICT DO NOTHING;

-- Vegetarian Roll: Tofu 70g, Düyü 120g, Nori 1pc, Avokado 35g, Xiyar 20g, Kələm 15g
INSERT INTO recipes (menu_item_id, ingredient_id, quantity_required, is_ai_suggested) VALUES
  ('a1b2c3d4-0001-0000-0000-000000000010', (SELECT id FROM ingredients WHERE name = 'Tofu'), 70, true),
  ('a1b2c3d4-0001-0000-0000-000000000010', (SELECT id FROM ingredients WHERE name = 'Düyü (sushi)'), 120, true),
  ('a1b2c3d4-0001-0000-0000-000000000010', (SELECT id FROM ingredients WHERE name = 'Nori (yosun)'), 1, true),
  ('a1b2c3d4-0001-0000-0000-000000000010', (SELECT id FROM ingredients WHERE name = 'Avokado'), 35, true),
  ('a1b2c3d4-0001-0000-0000-000000000010', (SELECT id FROM ingredients WHERE name = 'Xiyar'), 20, true),
  ('a1b2c3d4-0001-0000-0000-000000000010', (SELECT id FROM ingredients WHERE name = 'Qırmızı kələm'), 15, true)
ON CONFLICT DO NOTHING;


-- ── 4. İLKİN STOK DAXİLOLMA (inventory_logs) ─────────────────
INSERT INTO inventory_logs (ingredient_id, type, quantity, cost_per_unit, reason, created_at) VALUES
  ((SELECT id FROM ingredients WHERE name = 'Somon file'), 'stock_in', 5000, 0.045, 'İlkin stok', now() - interval '7 days'),
  ((SELECT id FROM ingredients WHERE name = 'Ton file'), 'stock_in', 3000, 0.052, 'İlkin stok', now() - interval '7 days'),
  ((SELECT id FROM ingredients WHERE name = 'Düyü (sushi)'), 'stock_in', 10000, 0.003, 'İlkin stok', now() - interval '7 days'),
  ((SELECT id FROM ingredients WHERE name = 'Nori (yosun)'), 'stock_in', 200, 0.15, 'İlkin stok', now() - interval '7 days'),
  ((SELECT id FROM ingredients WHERE name = 'Avokado'), 'stock_in', 1500, 0.012, 'İlkin stok', now() - interval '7 days')
ON CONFLICT DO NOTHING;


-- ── 5. TEST SİFARİŞ VƏ KONSUMSİYA ─────────────────────────────
-- FUNKSİYA: order_consumption log yarat + stok yenilə
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

  INSERT INTO inventory_logs (ingredient_id, type, quantity, cost_per_unit, reason, order_id, created_at)
  VALUES (v_ingredient_id, 'order_consumption', p_quantity, v_unit_cost, p_reason, p_order_id, NOW());

  UPDATE ingredients SET
    current_stock = GREATEST(0, current_stock - ABS(p_quantity)),
    theoretical_stock = GREATEST(0, theoretical_stock - ABS(p_quantity))
  WHERE id = v_ingredient_id;
END;
$$ LANGUAGE plpgsql;


-- ── Sifariş 1: Masa 3 — Dragon + Philly + Maki ────────────────
INSERT INTO orders (id, table_number, status, total_amount, order_type, created_at)
VALUES ('00000000-0000-0000-0000-000000000001', 3, 'paid', 46.50, 'dine_in', NOW() - INTERVAL '3 days')
ON CONFLICT (id) DO NOTHING;

INSERT INTO order_items (order_id, product_id, product_name, quantity, unit_price) VALUES
  ('00000000-0000-0000-0000-000000000001', 'a1b2c3d4-0001-0000-0000-000000000001', 'Dragon Roll', 1, 18.00),
  ('00000000-0000-0000-0000-000000000001', 'a1b2c3d4-0001-0000-0000-000000000002', 'Philadelphia Roll', 1, 16.50),
  ('00000000-0000-0000-0000-000000000001', 'a1b2c3d4-0001-0000-0000-000000000007', 'Maki Somon', 1, 12.00)
ON CONFLICT DO NOTHING;

SELECT create_order_consumption('Somon file', -80, '00000000-0000-0000-0000-000000000001', 'Dragon Roll');
SELECT create_order_consumption('Düyü (sushi)', -120, '00000000-0000-0000-0000-000000000001', 'Dragon Roll');
SELECT create_order_consumption('Nori (yosun)', -1, '00000000-0000-0000-0000-000000000001', 'Dragon Roll');
SELECT create_order_consumption('Avokado', -40, '00000000-0000-0000-0000-000000000001', 'Dragon Roll');
SELECT create_order_consumption('Sésam toxumu', -5, '00000000-0000-0000-0000-000000000001', 'Dragon Roll');
SELECT create_order_consumption('Somon file', -60, '00000000-0000-0000-0000-000000000001', 'Philadelphia Roll');
SELECT create_order_consumption('Düyü (sushi)', -120, '00000000-0000-0000-0000-000000000001', 'Philadelphia Roll');
SELECT create_order_consumption('Nori (yosun)', -1, '00000000-0000-0000-0000-000000000001', 'Philadelphia Roll');
SELECT create_order_consumption('Filadelfiya pendiri', -50, '00000000-0000-0000-0000-000000000001', 'Philadelphia Roll');
SELECT create_order_consumption('Somon file', -50, '00000000-0000-0000-0000-000000000001', 'Maki Somon');
SELECT create_order_consumption('Düyü (sushi)', -80, '00000000-0000-0000-0000-000000000001', 'Maki Somon');
SELECT create_order_consumption('Nori (yosun)', -1, '00000000-0000-0000-0000-000000000001', 'Maki Somon');

-- ── Sifariş 2: Masa 7 — Spicy Tuna + California ───────────────
INSERT INTO orders (id, table_number, status, total_amount, order_type, created_at)
VALUES ('00000000-0000-0000-0000-000000000002', 7, 'paid', 32.00, 'dine_in', NOW() - INTERVAL '2 days')
ON CONFLICT (id) DO NOTHING;

INSERT INTO order_items (order_id, product_id, product_name, quantity, unit_price) VALUES
  ('00000000-0000-0000-0000-000000000002', 'a1b2c3d4-0001-0000-0000-000000000004', 'Spicy Tuna Roll', 1, 17.00),
  ('00000000-0000-0000-0000-000000000002', 'a1b2c3d4-0001-0000-0000-000000000003', 'California Roll', 1, 15.00)
ON CONFLICT DO NOTHING;

SELECT create_order_consumption('Ton file', -70, '00000000-0000-0000-0000-000000000002', 'Spicy Tuna');
SELECT create_order_consumption('Düyü (sushi)', -120, '00000000-0000-0000-0000-000000000002', 'Spicy Tuna');
SELECT create_order_consumption('Nori (yosun)', -1, '00000000-0000-0000-0000-000000000002', 'Spicy Tuna');
SELECT create_order_consumption('Soya sousu', -10, '00000000-0000-0000-0000-000000000002', 'Spicy Tuna');
SELECT create_order_consumption('Wasabi', -3, '00000000-0000-0000-0000-000000000002', 'Spicy Tuna');
SELECT create_order_consumption('Krevetka', -50, '00000000-0000-0000-0000-000000000002', 'California');
SELECT create_order_consumption('Düyü (sushi)', -120, '00000000-0000-0000-0000-000000000002', 'California');
SELECT create_order_consumption('Nori (yosun)', -1, '00000000-0000-0000-0000-000000000002', 'California');
SELECT create_order_consumption('Avokado', -30, '00000000-0000-0000-0000-000000000002', 'California');
SELECT create_order_consumption('İkra (masqut)', -15, '00000000-0000-0000-0000-000000000002', 'California');

-- ── Sifariş 3: Masa 1 — Unagi + Tempura + Ebi ─────────────────
INSERT INTO orders (id, table_number, status, total_amount, order_type, created_at)
VALUES ('00000000-0000-0000-0000-000000000003', 1, 'paid', 49.50, 'dine_in', NOW() - INTERVAL '1 day')
ON CONFLICT (id) DO NOTHING;

INSERT INTO order_items (order_id, product_id, product_name, quantity, unit_price) VALUES
  ('00000000-0000-0000-0000-000000000003', 'a1b2c3d4-0001-0000-0000-000000000005', 'Unagi Roll', 1, 19.50),
  ('00000000-0000-0000-0000-000000000003', 'a1b2c3d4-0001-0000-0000-000000000006', 'Tempura Roll', 1, 16.00),
  ('00000000-0000-0000-0000-000000000003', 'a1b2c3d4-0001-0000-0000-000000000008', 'Ebi Nigiri', 1, 14.00)
ON CONFLICT DO NOTHING;

SELECT create_order_consumption('Unagi (dəniz kilsəsi)', -80, '00000000-0000-0000-0000-000000000003', 'Unagi Roll');
SELECT create_order_consumption('Düyü (sushi)', -120, '00000000-0000-0000-0000-000000000003', 'Unagi Roll');
SELECT create_order_consumption('Nori (yosun)', -1, '00000000-0000-0000-0000-000000000003', 'Unagi Roll');
SELECT create_order_consumption('Avokado', -30, '00000000-0000-0000-0000-000000000003', 'Unagi Roll');
SELECT create_order_consumption('Balsamik sous', -5, '00000000-0000-0000-0000-000000000003', 'Unagi Roll');
SELECT create_order_consumption('Krevetka', -60, '00000000-0000-0000-0000-000000000003', 'Tempura Roll');
SELECT create_order_consumption('Düyü (sushi)', -120, '00000000-0000-0000-0000-000000000003', 'Tempura Roll');
SELECT create_order_consumption('Nori (yosun)', -1, '00000000-0000-0000-0000-000000000003', 'Tempura Roll');
SELECT create_order_consumption('Avokado', -25, '00000000-0000-0000-0000-000000000003', 'Tempura Roll');
SELECT create_order_consumption('Krevetka', -40, '00000000-0000-0000-0000-000000000003', 'Ebi Nigiri');
SELECT create_order_consumption('Düyü (sushi)', -60, '00000000-0000-0000-0000-000000000003', 'Ebi Nigiri');

-- ── Sifariş 4: Masa 5 — Tuna Sashimi + Vegan ──────────────────
INSERT INTO orders (id, table_number, status, total_amount, order_type, created_at)
VALUES ('00000000-0000-0000-0000-000000000004', 5, 'paid', 35.00, 'dine_in', NOW() - INTERVAL '12 hours')
ON CONFLICT (id) DO NOTHING;

INSERT INTO order_items (order_id, product_id, product_name, quantity, unit_price) VALUES
  ('00000000-0000-0000-0000-000000000004', 'a1b2c3d4-0001-0000-0000-000000000009', 'Tuna Sashimi', 1, 22.00),
  ('00000000-0000-0000-0000-000000000004', 'a1b2c3d4-0001-0000-0000-000000000010', 'Vegetarian Roll', 1, 13.00)
ON CONFLICT DO NOTHING;

SELECT create_order_consumption('Ton file', -120, '00000000-0000-0000-0000-000000000004', 'Tuna Sashimi');
SELECT create_order_consumption('Soya sousu', -15, '00000000-0000-0000-0000-000000000004', 'Tuna Sashimi');
SELECT create_order_consumption('Wasabi', -5, '00000000-0000-0000-0000-000000000004', 'Tuna Sashimi');
SELECT create_order_consumption('Zəncəfil (marinad)', -10, '00000000-0000-0000-0000-000000000004', 'Tuna Sashimi');
SELECT create_order_consumption('Tofu', -70, '00000000-0000-0000-0000-000000000004', 'Vegan Roll');
SELECT create_order_consumption('Düyü (sushi)', -120, '00000000-0000-0000-0000-000000000004', 'Vegan Roll');
SELECT create_order_consumption('Nori (yosun)', -1, '00000000-0000-0000-0000-000000000004', 'Vegan Roll');
SELECT create_order_consumption('Avokado', -35, '00000000-0000-0000-0000-000000000004', 'Vegan Roll');
SELECT create_order_consumption('Xiyar', -20, '00000000-0000-0000-0000-000000000004', 'Vegan Roll');
SELECT create_order_consumption('Qırmızı kələm', -15, '00000000-0000-0000-0000-000000000004', 'Vegan Roll');

-- ── Sifariş 5: Masa 2 — Dragon x2 + Philly x2 ─────────────────
INSERT INTO orders (id, table_number, status, total_amount, order_type, created_at)
VALUES ('00000000-0000-0000-0000-000000000005', 2, 'paid', 69.00, 'dine_in', NOW() - INTERVAL '6 hours')
ON CONFLICT (id) DO NOTHING;

INSERT INTO order_items (order_id, product_id, product_name, quantity, unit_price) VALUES
  ('00000000-0000-0000-0000-000000000005', 'a1b2c3d4-0001-0000-0000-000000000001', 'Dragon Roll', 2, 18.00),
  ('00000000-0000-0000-0000-000000000005', 'a1b2c3d4-0001-0000-0000-000000000002', 'Philadelphia Roll', 2, 16.50)
ON CONFLICT DO NOTHING;

SELECT create_order_consumption('Somon file', -160, '00000000-0000-0000-0000-000000000005', 'Dragon Roll x2');
SELECT create_order_consumption('Düyü (sushi)', -240, '00000000-0000-0000-0000-000000000005', 'Dragon Roll x2');
SELECT create_order_consumption('Nori (yosun)', -2, '00000000-0000-0000-0000-000000000005', 'Dragon Roll x2');
SELECT create_order_consumption('Avokado', -80, '00000000-0000-0000-0000-000000000005', 'Dragon Roll x2');
SELECT create_order_consumption('Sésam toxumu', -10, '00000000-0000-0000-0000-000000000005', 'Dragon Roll x2');
SELECT create_order_consumption('Somon file', -120, '00000000-0000-0000-0000-000000000005', 'Philly x2');
SELECT create_order_consumption('Düyü (sushi)', -240, '00000000-0000-0000-0000-000000000005', 'Philly x2');
SELECT create_order_consumption('Nori (yosun)', -2, '00000000-0000-0000-0000-000000000005', 'Philly x2');
SELECT create_order_consumption('Filadelfiya pendiri', -100, '00000000-0000-0000-0000-000000000005', 'Philly x2');


-- ═══════════════════════════════════════════════════════════════
-- YOXLAMA SORĞULARI
-- ═══════════════════════════════════════════════════════════════
-- 1) Sifarişlər (sadəcə test sifarişlərini göstər)
SELECT id, table_number, status, total_amount, created_at
FROM orders
WHERE id IN (
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000003',
  '00000000-0000-0000-0000-000000000004',
  '00000000-0000-0000-0000-000000000005'
);

-- 2) Stok vəziyyəti (ən kritik ingredientlər)
SELECT name, unit, current_stock, theoretical_stock,
  current_stock - theoretical_stock AS fərq
FROM ingredients
WHERE name IN ('Somon file', 'Ton file', 'Düyü (sushi)', 'Nori (yosun)', 'Avokado', 'Krevetka')
ORDER BY fərq;

-- 3) Audit trail-da görünən order_consumption logları
SELECT i.name AS ingredient, il.quantity, il.reason, il.order_id, il.created_at
FROM inventory_logs il
JOIN ingredients i ON i.id = il.ingredient_id
WHERE il.type = 'order_consumption' AND il.created_at >= NOW() - INTERVAL '7 days'
ORDER BY il.created_at DESC;
