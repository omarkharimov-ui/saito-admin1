-- ═══════════════════════════════════════════════════════════════
-- DUPLICATE PRODUCTS → TƏMİZLƏMƏ + RECIPE KÖÇÜRTMƏ
-- ═══════════════════════════════════════════════════════════════
-- Bu SQL seed-dən gələn duplicate məhsulları silir
-- və onların reseptlərini əsl məhsullara köçürür.

-- 1) Hansı məhsulların duplicate olduğunu göstər
WITH dups AS (
  SELECT name_az FROM products GROUP BY name_az HAVING COUNT(*) > 1
)
SELECT p.id, p.name_az, p.image_url,
  CASE WHEN p.id::text LIKE 'a1b2c3d4-%' THEN 'SEED (silinəcək)' ELSE 'ORIJINAL (qalacaq)' END AS status,
  (SELECT COUNT(*) FROM recipes WHERE menu_item_id = p.id) AS recipe_count
FROM products p
JOIN dups d ON d.name_az = p.name_az
ORDER BY p.name_az, p.id::text LIKE 'a1b2c3d4-%';


-- 2) Reseptlər köçür
DO $$
DECLARE
  rec RECORD;
  target_id UUID;
BEGIN
  FOR rec IN (
    SELECT DISTINCT p.name_az
    FROM products p
    WHERE p.id::text LIKE 'a1b2c3d4-%'
      AND (SELECT COUNT(*) FROM products p2 WHERE p2.name_az = p.name_az) > 1
  ) LOOP
    SELECT id INTO target_id FROM products
    WHERE name_az = rec.name_az AND id::text NOT LIKE 'a1b2c3d4-%'
    LIMIT 1;

    INSERT INTO recipes (menu_item_id, ingredient_id, quantity_required, is_ai_suggested)
    SELECT target_id, r.ingredient_id, r.quantity_required, r.is_ai_suggested
    FROM recipes r
    JOIN products sp ON sp.id = r.menu_item_id
    WHERE sp.name_az = rec.name_az
      AND sp.id::text LIKE 'a1b2c3d4-%'
      AND NOT EXISTS (
        SELECT 1 FROM recipes r2
        WHERE r2.menu_item_id = target_id
          AND r2.ingredient_id = r.ingredient_id
      );
  END LOOP;
END $$;


-- 3) Orijinal məhsulların has_active_recipe = true et
UPDATE products p
SET has_active_recipe = true
WHERE p.id::text NOT LIKE 'a1b2c3d4-%'
  AND EXISTS (SELECT 1 FROM recipes r WHERE r.menu_item_id = p.id)
  AND p.has_active_recipe = false;


-- 4) Seed məhsullarına aid order_items sil
DELETE FROM order_items
WHERE product_id::text LIKE 'a1b2c3d4-%'
  AND EXISTS (SELECT 1 FROM products p2 WHERE p2.name_az = (
    SELECT name_az FROM products WHERE id = order_items.product_id
  ) AND p2.id != order_items.product_id);


-- 5) Seed məhsullarını sil
DELETE FROM products p
WHERE p.id::text LIKE 'a1b2c3d4-%'
  AND EXISTS (SELECT 1 FROM products p2 WHERE p2.name_az = p.name_az AND p2.id != p.id);


-- 6) Yoxlama: unique ad
SELECT p.name_az, COUNT(*) as cnt
FROM products p
GROUP BY p.name_az
HAVING COUNT(*) > 1;


-- 7) Yoxlama: resept vəziyyəti
SELECT 
  p.name_az,
  p.has_active_recipe,
  p.image_url IS NOT NULL AS has_image,
  COUNT(r.id) as recipe_count
FROM products p
LEFT JOIN recipes r ON r.menu_item_id = p.id
GROUP BY p.id, p.name_az, p.has_active_recipe, p.image_url
ORDER BY p.name_az;
