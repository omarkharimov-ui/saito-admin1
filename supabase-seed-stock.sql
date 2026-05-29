-- ═══════════════════════════════════════════════════════════════
-- SAITO ADMIN — Stok + Resept Seed (Sushi Restoran)
-- Supabase SQL Editor-da run edin
-- ═══════════════════════════════════════════════════════════════

-- Köhnə constraint varsa sil
ALTER TABLE ingredients DROP CONSTRAINT IF EXISTS ingredients_unit_check;

-- ═══════════════════════════════════════════════════════════════
-- 1. XƏMMALLAR (ingredients) — real stok rəqəmləri
-- ═══════════════════════════════════════════════════════════════

INSERT INTO ingredients (name, unit, current_stock, critical_limit, average_cost_per_unit) VALUES
  ('Somon file', 'gram', 4370, 500, 0.045),
  ('Ton file', 'gram', 2850, 300, 0.052),
  ('Düyü (sushi)', 'gram', 8750, 1000, 0.003),
  ('Nori (yosun)', 'piece', 173, 20, 0.15),
  ('Avokado', 'gram', 1240, 200, 0.012),
  ('Xiyar', 'gram', 1680, 150, 0.004),
  ('Filadelfiya pendiri', 'gram', 2150, 300, 0.018),
  ('İkra (masqut)', 'gram', 645, 80, 0.08),
  ('Unagi (dəniz kilsəsi)', 'gram', 980, 150, 0.065),
  ('Qarğıdalı', 'gram', 1430, 100, 0.006),
  ('Soya sousu', 'ml', 3780, 500, 0.005),
  ('Zəncəfil (marinad)', 'gram', 420, 50, 0.02),
  ('Wasabi', 'gram', 265, 30, 0.04),
  ('Bənövşəyi soğan', 'gram', 310, 40, 0.008),
  ('Qızardılmış soğan', 'gram', 540, 60, 0.01),
  ('Balsamik sous', 'ml', 720, 80, 0.015),
  ('Sésam toxumu', 'gram', 380, 40, 0.012),
  ('Krevetka', 'gram', 1560, 200, 0.038),
  ('Dəniz güləkləri', 'gram', 890, 120, 0.025),
  ('Tofu', 'gram', 1340, 100, 0.009),
  ('Qırmızı kələm', 'gram', 760, 80, 0.005),
  ('Mango', 'gram', 520, 60, 0.011),
  ('Yengən (qaçaq çəyirdək)', 'gram', 430, 50, 0.022),
  ('Qaynadılmış heyva', 'gram', 290, 40, 0.016),
  ('Marul', 'gram', 1380, 150, 0.003)
ON CONFLICT DO NOTHING;


-- ═══════════════════════════════════════════════════════════════
-- 2. MƏHSULLAR (products) — sushi menyu
-- ═══════════════════════════════════════════════════════════════

INSERT INTO products (id, name, name_az, name_en, name_ru, price, category_id, image_url, has_active_recipe, is_ready_product) VALUES
  ('a1b2c3d4-0001-0000-0000-000000000001', 'Dragon Roll', 'Dragon Roll', 'Dragon Roll', 'Дракон Ролл', 18.00, NULL, NULL, true, false),
  ('a1b2c3d4-0001-0000-0000-000000000002', 'Philadelphia Roll', 'Philadelphia Roll', 'Philadelphia Roll', 'Филадельфия Ролл', 16.50, NULL, NULL, true, false),
  ('a1b2c3d4-0001-0000-0000-000000000003', 'California Roll', 'California Roll', 'California Roll', 'Калифорния Ролл', 15.00, NULL, NULL, true, false),
  ('a1b2c3d4-0001-0000-0000-000000000004', 'Spicy Tuna Roll', 'Spicy Tuna Roll', 'Spicy Tuna Roll', 'Острый Тунец Ролл', 17.00, NULL, NULL, true, false),
  ('a1b2c3d4-0001-0000-0000-000000000005', 'Unagi Roll', 'Unagi Roll', 'Unagi Roll', 'Унаги Ролл', 19.50, NULL, NULL, true, false),
  ('a1b2c3d4-0001-0000-0000-000000000006', 'Tempura Roll', 'Tempura Roll', 'Tempura Roll', 'Темпура Ролл', 16.00, NULL, NULL, true, false),
  ('a1b2c3d4-0001-0000-0000-000000000007', 'Maki Somon', 'Maki Somon', 'Salmon Maki', 'Лосось Маки', 12.00, NULL, NULL, true, false),
  ('a1b2c3d4-0001-0000-0000-000000000008', 'Ebi Nigiri', 'Ebi Nigiri', 'Shrimp Nigiri', 'Креветка Нигири', 14.00, NULL, NULL, true, false),
  ('a1b2c3d4-0001-0000-0000-000000000009', 'Tuna Sashimi', 'Tuna Sashimi', 'Tuna Sashimi', 'Тунец Сашими', 22.00, NULL, NULL, true, false),
  ('a1b2c3d4-0001-0000-0000-000000000010', 'Vegetarian Roll', 'Vegetarian Roll', 'Vegetarian Roll', 'Вегетарианский Ролл', 13.00, NULL, NULL, true, false)
ON CONFLICT (id) DO NOTHING;


-- ═══════════════════════════════════════════════════════════════
-- 3. RESEPTLƏR (recipes)
-- ═══════════════════════════════════════════════════════════════

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

-- Spicy Tuna: Ton 70g, Düyü 120g, Nori 1pc, Soya sousu 10ml, Wasabi 3g
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

-- Tuna Sashimi: Ton 120g, Soya sousu 15ml, Wasabi 5g, Zəncəfil 10g
INSERT INTO recipes (menu_item_id, ingredient_id, quantity_required, is_ai_suggested) VALUES
  ('a1b2c3d4-0001-0000-0000-000000000009', (SELECT id FROM ingredients WHERE name = 'Ton file'), 120, true),
  ('a1b2c3d4-0001-0000-0000-000000000009', (SELECT id FROM ingredients WHERE name = 'Soya sousu'), 15, true),
  ('a1b2c3d4-0001-0000-0000-000000000009', (SELECT id FROM ingredients WHERE name = 'Wasabi'), 5, true),
  ('a1b2c3d4-0001-0000-0000-000000000009', (SELECT id FROM ingredients WHERE name = 'Zəncəfil (marinad)'), 10, true)
ON CONFLICT DO NOTHING;

-- Vegetarian Roll: Tofu 70g, Düyü 120g, Nori 1pc, Avokado 35g, Xiyar 20g, Qırmızı kələm 15g
INSERT INTO recipes (menu_item_id, ingredient_id, quantity_required, is_ai_suggested) VALUES
  ('a1b2c3d4-0001-0000-0000-000000000010', (SELECT id FROM ingredients WHERE name = 'Tofu'), 70, true),
  ('a1b2c3d4-0001-0000-0000-000000000010', (SELECT id FROM ingredients WHERE name = 'Düyü (sushi)'), 120, true),
  ('a1b2c3d4-0001-0000-0000-000000000010', (SELECT id FROM ingredients WHERE name = 'Nori (yosun)'), 1, true),
  ('a1b2c3d4-0001-0000-0000-000000000010', (SELECT id FROM ingredients WHERE name = 'Avokado'), 35, true),
  ('a1b2c3d4-0001-0000-0000-000000000010', (SELECT id FROM ingredients WHERE name = 'Xiyar'), 20, true),
  ('a1b2c3d4-0001-0000-0000-000000000010', (SELECT id FROM ingredients WHERE name = 'Qırmızı kələm'), 15, true)
ON CONFLICT DO NOTHING;


-- ═══════════════════════════════════════════════════════════════
-- 4. STOK DAXILOLMA (inventory_logs) — tarixçə
-- ═══════════════════════════════════════════════════════════════

INSERT INTO inventory_logs (ingredient_id, quantity_change, log_type, reason, created_at) VALUES
  ((SELECT id FROM ingredients WHERE name = 'Somon file'), 5000, 'stock_in', 'İlkin stok', now() - interval '7 days'),
  ((SELECT id FROM ingredients WHERE name = 'Ton file'), 3000, 'stock_in', 'İlkin stok', now() - interval '7 days'),
  ((SELECT id FROM ingredients WHERE name = 'Düyü (sushi)'), 10000, 'stock_in', 'İlkin stok', now() - interval '7 days'),
  ((SELECT id FROM ingredients WHERE name = 'Nori (yosun)'), 200, 'stock_in', 'İlkin stok', now() - interval '7 days'),
  ((SELECT id FROM ingredients WHERE name = 'Avokado'), 1500, 'stock_in', 'İlkin stok', now() - interval '7 days'),
  ((SELECT id FROM ingredients WHERE name = 'Somon file'), -630, 'order_consumption', 'Sifarişlər', now() - interval '5 days'),
  ((SELECT id FROM ingredients WHERE name = 'Ton file'), -150, 'order_consumption', 'Sifarişlər', now() - interval '5 days'),
  ((SELECT id FROM ingredients WHERE name = 'Düyü (sushi)'), -1250, 'order_consumption', 'Sifarişlər', now() - interval '5 days'),
  ((SELECT id FROM ingredients WHERE name = 'Nori (yosun)'), -27, 'order_consumption', 'Sifarişlər', now() - interval '5 days')
ON CONFLICT DO NOTHING;


-- ═══════════════════════════════════════════════════════════════
-- 5. YOXLAMA
-- ═══════════════════════════════════════════════════════════════

SELECT 
  p.name_az AS məhsul,
  COUNT(r.id) AS xəmmal_sayı,
  STRING_AGG(i.name || ' × ' || r.quantity_required || ' ' || i.unit, ', ' ORDER BY i.name) AS resept
FROM products p
LEFT JOIN recipes r ON r.menu_item_id = p.id
LEFT JOIN ingredients i ON i.id = r.ingredient_id
WHERE p.has_active_recipe = true
GROUP BY p.id, p.name_az
ORDER BY p.name_az;
