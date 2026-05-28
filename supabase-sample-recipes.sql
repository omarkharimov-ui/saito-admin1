-- ═══════════════════════════════════════════════════════════════
-- SAITO ADMIN — Sample Recipes (Texmini Reseptlər)
-- Bu SQL-i Supabase Editor-da run edin
-- ═══════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════
-- 1. İLK OLARAQ NÜMUNƏVİ XƏMMALLAR ƏLAVƏ EDİLİR
-- (əgər artıq varsa, IGNORE edəcək)
-- ═══════════════════════════════════════════════════════════════

INSERT INTO ingredients (name, unit, current_stock, critical_limit, average_cost_per_unit)
SELECT v.name, v.unit, v.current_stock, v.critical_limit, v.average_cost_per_unit
FROM (VALUES
  ('Somon file', 'gram', 4370, 500, 0.045),
  ('Ton file', 'gram', 2850, 300, 0.052),
  ('Düyü (sushi)', 'gram', 8750, 1000, 0.003),
  ('Nori (yosun vərəqi)', 'piece', 173, 20, 0.15),
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
  ('Tofu', 'gram', 1340, 100, 0.009)
) AS v(name, unit, current_stock, critical_limit, average_cost_per_unit)
WHERE NOT EXISTS (SELECT 1 FROM ingredients i WHERE i.name = v.name);


-- ═══════════════════════════════════════════════════════════════
-- 2. MOVCUD MƏHSULLARI TAP və RESEPT BAĞLA
-- (məhsul adına görə avtomatik match)
-- ═══════════════════════════════════════════════════════════════

-- Dragon Roll
WITH prod AS (SELECT id FROM products WHERE name_az ILIKE '%dragon%' OR name_en ILIKE '%dragon%' OR name ILIKE '%dragon%' LIMIT 1),
     ing_somon AS (SELECT id FROM ingredients WHERE name ILIKE '%somon%' LIMIT 1),
     ing_duyu AS (SELECT id FROM ingredients WHERE name ILIKE '%düyü%' OR name ILIKE '%duyu%' LIMIT 1),
     ing_nori AS (SELECT id FROM ingredients WHERE name ILIKE '%nori%' LIMIT 1),
     ing_avo AS (SELECT id FROM ingredients WHERE name ILIKE '%avokado%' LIMIT 1)
INSERT INTO recipes (menu_item_id, ingredient_id, quantity_required, is_ai_suggested)
SELECT prod.id, ing_somon.id, 80, true FROM prod, ing_somon WHERE prod.id IS NOT NULL AND ing_somon.id IS NOT NULL
UNION ALL
SELECT prod.id, ing_duyu.id, 120, true FROM prod, ing_duyu WHERE prod.id IS NOT NULL AND ing_duyu.id IS NOT NULL
UNION ALL
SELECT prod.id, ing_nori.id, 1, true FROM prod, ing_nori WHERE prod.id IS NOT NULL AND ing_nori.id IS NOT NULL
UNION ALL
SELECT prod.id, ing_avo.id, 40, true FROM prod, ing_avo WHERE prod.id IS NOT NULL AND ing_avo.id IS NOT NULL;

-- Philadelphia Roll
WITH prod AS (SELECT id FROM products WHERE name_az ILIKE '%philadelphia%' OR name_en ILIKE '%philadelphia%' OR name ILIKE '%philadelphia%' LIMIT 1),
     ing_somon AS (SELECT id FROM ingredients WHERE name ILIKE '%somon%' LIMIT 1),
     ing_duyu AS (SELECT id FROM ingredients WHERE name ILIKE '%düyü%' OR name ILIKE '%duyu%' LIMIT 1),
     ing_nori AS (SELECT id FROM ingredients WHERE name ILIKE '%nori%' LIMIT 1),
     ing_pendir AS (SELECT id FROM ingredients WHERE name ILIKE '%filadelfiya%' OR name ILIKE '%pendir%' LIMIT 1)
INSERT INTO recipes (menu_item_id, ingredient_id, quantity_required, is_ai_suggested)
SELECT prod.id, ing_somon.id, 60, true FROM prod, ing_somon WHERE prod.id IS NOT NULL AND ing_somon.id IS NOT NULL
UNION ALL
SELECT prod.id, ing_duyu.id, 120, true FROM prod, ing_duyu WHERE prod.id IS NOT NULL AND ing_duyu.id IS NOT NULL
UNION ALL
SELECT prod.id, ing_nori.id, 1, true FROM prod, ing_nori WHERE prod.id IS NOT NULL AND ing_nori.id IS NOT NULL
UNION ALL
SELECT prod.id, ing_pendir.id, 50, true FROM prod, ing_pendir WHERE prod.id IS NOT NULL AND ing_pendir.id IS NOT NULL;

-- California Roll
WITH prod AS (SELECT id FROM products WHERE name_az ILIKE '%california%' OR name_en ILIKE '%california%' OR name ILIKE '%california%' LIMIT 1),
     ing_krevet AS (SELECT id FROM ingredients WHERE name ILIKE '%krevet%' LIMIT 1),
     ing_duyu AS (SELECT id FROM ingredients WHERE name ILIKE '%düyü%' OR name ILIKE '%duyu%' LIMIT 1),
     ing_nori AS (SELECT id FROM ingredients WHERE name ILIKE '%nori%' LIMIT 1),
     ing_avo AS (SELECT id FROM ingredients WHERE name ILIKE '%avokado%' LIMIT 1),
     ing_ikra AS (SELECT id FROM ingredients WHERE name ILIKE '%ikra%' LIMIT 1)
INSERT INTO recipes (menu_item_id, ingredient_id, quantity_required, is_ai_suggested)
SELECT prod.id, ing_krevet.id, 50, true FROM prod, ing_krevet WHERE prod.id IS NOT NULL AND ing_krevet.id IS NOT NULL
UNION ALL
SELECT prod.id, ing_duyu.id, 120, true FROM prod, ing_duyu WHERE prod.id IS NOT NULL AND ing_duyu.id IS NOT NULL
UNION ALL
SELECT prod.id, ing_nori.id, 1, true FROM prod, ing_nori WHERE prod.id IS NOT NULL AND ing_nori.id IS NOT NULL
UNION ALL
SELECT prod.id, ing_avo.id, 30, true FROM prod, ing_avo WHERE prod.id IS NOT NULL AND ing_avo.id IS NOT NULL
UNION ALL
SELECT prod.id, ing_ikra.id, 15, true FROM prod, ing_ikra WHERE prod.id IS NOT NULL AND ing_ikra.id IS NOT NULL;

-- Spicy Tuna Roll
WITH prod AS (SELECT id FROM products WHERE name_az ILIKE '%tuna%' OR name_en ILIKE '%tuna%' OR name ILIKE '%tuna%' OR name_az ILIKE '%ton%' OR name_en ILIKE '%ton%' LIMIT 1),
     ing_ton AS (SELECT id FROM ingredients WHERE name ILIKE '%ton%' LIMIT 1),
     ing_duyu AS (SELECT id FROM ingredients WHERE name ILIKE '%düyü%' OR name ILIKE '%duyu%' LIMIT 1),
     ing_nori AS (SELECT id FROM ingredients WHERE name ILIKE '%nori%' LIMIT 1),
     ing_sous AS (SELECT id FROM ingredients WHERE name ILIKE '%soya%' LIMIT 1)
INSERT INTO recipes (menu_item_id, ingredient_id, quantity_required, is_ai_suggested)
SELECT prod.id, ing_ton.id, 70, true FROM prod, ing_ton WHERE prod.id IS NOT NULL AND ing_ton.id IS NOT NULL
UNION ALL
SELECT prod.id, ing_duyu.id, 120, true FROM prod, ing_duyu WHERE prod.id IS NOT NULL AND ing_duyu.id IS NOT NULL
UNION ALL
SELECT prod.id, ing_nori.id, 1, true FROM prod, ing_nori WHERE prod.id IS NOT NULL AND ing_nori.id IS NOT NULL
UNION ALL
SELECT prod.id, ing_sous.id, 10, true FROM prod, ing_sous WHERE prod.id IS NOT NULL AND ing_sous.id IS NOT NULL;

-- Unagi Roll
WITH prod AS (SELECT id FROM products WHERE name_az ILIKE '%unagi%' OR name_en ILIKE '%unagi%' OR name ILIKE '%unagi%' OR name_az ILIKE '%kilsə%' OR name_en ILIKE '%eel%' LIMIT 1),
     ing_unagi AS (SELECT id FROM ingredients WHERE name ILIKE '%unagi%' LIMIT 1),
     ing_duyu AS (SELECT id FROM ingredients WHERE name ILIKE '%düyü%' OR name ILIKE '%duyu%' LIMIT 1),
     ing_nori AS (SELECT id FROM ingredients WHERE name ILIKE '%nori%' LIMIT 1),
     ing_avo AS (SELECT id FROM ingredients WHERE name ILIKE '%avokado%' LIMIT 1)
INSERT INTO recipes (menu_item_id, ingredient_id, quantity_required, is_ai_suggested)
SELECT prod.id, ing_unagi.id, 80, true FROM prod, ing_unagi WHERE prod.id IS NOT NULL AND ing_unagi.id IS NOT NULL
UNION ALL
SELECT prod.id, ing_duyu.id, 120, true FROM prod, ing_duyu WHERE prod.id IS NOT NULL AND ing_duyu.id IS NOT NULL
UNION ALL
SELECT prod.id, ing_nori.id, 1, true FROM prod, ing_nori WHERE prod.id IS NOT NULL AND ing_nori.id IS NOT NULL
UNION ALL
SELECT prod.id, ing_avo.id, 30, true FROM prod, ing_avo WHERE prod.id IS NOT NULL AND ing_avo.id IS NOT NULL;

-- Tempura Roll
WITH prod AS (SELECT id FROM products WHERE name_az ILIKE '%tempura%' OR name_en ILIKE '%tempura%' OR name ILIKE '%tempura%' LIMIT 1),
     ing_krevet AS (SELECT id FROM ingredients WHERE name ILIKE '%krevet%' LIMIT 1),
     ing_duyu AS (SELECT id FROM ingredients WHERE name ILIKE '%düyü%' OR name ILIKE '%duyu%' LIMIT 1),
     ing_nori AS (SELECT id FROM ingredients WHERE name ILIKE '%nori%' LIMIT 1),
     ing_avo AS (SELECT id FROM ingredients WHERE name ILIKE '%avokado%' LIMIT 1)
INSERT INTO recipes (menu_item_id, ingredient_id, quantity_required, is_ai_suggested)
SELECT prod.id, ing_krevet.id, 60, true FROM prod, ing_krevet WHERE prod.id IS NOT NULL AND ing_krevet.id IS NOT NULL
UNION ALL
SELECT prod.id, ing_duyu.id, 120, true FROM prod, ing_duyu WHERE prod.id IS NOT NULL AND ing_duyu.id IS NOT NULL
UNION ALL
SELECT prod.id, ing_nori.id, 1, true FROM prod, ing_nori WHERE prod.id IS NOT NULL AND ing_nori.id IS NOT NULL
UNION ALL
SELECT prod.id, ing_avo.id, 25, true FROM prod, ing_avo WHERE prod.id IS NOT NULL AND ing_avo.id IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════
-- 3. HƏM RESEPTƏNİ OLAN MƏHSULLARI has_active_recipe = true ET
-- ═══════════════════════════════════════════════════════════════

UPDATE products
SET has_active_recipe = true
WHERE id IN (SELECT DISTINCT menu_item_id FROM recipes);


-- ═══════════════════════════════════════════════════════════════
-- 4. NƏTİCƏNİ YOXLA
-- ═══════════════════════════════════════════════════════════════

SELECT 
  p.name_az AS product,
  COUNT(r.id) AS recipe_count,
  STRING_AGG(i.name || ' x' || r.quantity_required, ', ' ORDER BY i.name) AS ingredients
FROM products p
JOIN recipes r ON r.menu_item_id = p.id
JOIN ingredients i ON i.id = r.ingredient_id
GROUP BY p.id, p.name_az
ORDER BY recipe_count DESC;
