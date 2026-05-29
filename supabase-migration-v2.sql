-- ═══════════════════════════════════════════════════════════════
-- SAITO ADMIN v2 — Maya Dəyəri + Resept + Stok Zənciri
-- Bu SQL-i Supabase SQL Editor-da run edin
-- ═══════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════
-- 1. INGREDIENTS — yeni kolonkalar
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE ingredients
  ADD COLUMN IF NOT EXISTS purchase_price numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS waste_percentage numeric DEFAULT 0;

-- purchase_price = son alış qiyməti (vahid üçün)
-- waste_percentage = itki faizi (0-100). Əgər 10% itki varsa,
--   real maya dəyəri = purchase_price / (1 - waste_percentage/100)

-- ═══════════════════════════════════════════════════════════════
-- 2. PRODUCTS — maya dəyəri + qazanc kolonkaları
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS cost_price numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS profit_margin numeric DEFAULT 0;

-- cost_price = reseptdəki ingredient-lərin ümumi maya dəyəri
-- profit_margin = (price - cost_price) / price * 100

-- ═══════════════════════════════════════════════════════════════
-- 3. RECIPE_HEADERS — resept başlıq cədvəli
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS recipe_headers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_item_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  instructions text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(menu_item_id)
);

-- ═══════════════════════════════════════════════════════════════
-- 4. RECIPES cədvəlinə recipe_header_id FK əlavə et
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE recipes
  ADD COLUMN IF NOT EXISTS recipe_header_id uuid REFERENCES recipe_headers(id) ON DELETE CASCADE;

-- ═══════════════════════════════════════════════════════════════
-- 5. VIEW: product_cost_summary — hər məhsulun maya dəyəri
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW product_cost_summary AS
SELECT
  p.id AS product_id,
  p.name_az AS product_name,
  p.price AS sale_price,
  COALESCE(
    SUM(r.quantity_required * i.average_cost_per_unit),
    0
  ) AS calculated_cost,
  CASE WHEN p.price > 0
    THEN ROUND(
      ((p.price - COALESCE(SUM(r.quantity_required * i.average_cost_per_unit), 0)) / p.price) * 100,
      1
    )
    ELSE 0
  END AS calculated_margin
FROM products p
LEFT JOIN recipes r ON r.menu_item_id = p.id AND r.is_ai_suggested = false
LEFT JOIN ingredients i ON i.id = r.ingredient_id
GROUP BY p.id, p.name_az, p.price;

-- ═══════════════════════════════════════════════════════════════
-- 6. FUNKSİYA: Maya dəyərini avtomatik yenilə (cost cascade)
--    Ingredient qiyməti dəyişəndə çağırılır
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION recalculate_product_costs()
RETURNS TRIGGER AS $$
DECLARE
  v_product RECORD;
  v_total_cost numeric;
  v_margin numeric;
BEGIN
  -- Bu ingredient-i istifadə edən bütün reseptləri tap
  FOR v_product IN
    SELECT DISTINCT p.id, p.price
    FROM products p
    JOIN recipes r ON r.menu_item_id = p.id
    WHERE r.ingredient_id = NEW.id AND r.is_ai_suggested = false
  LOOP
    -- Ümumi maya dəyərini hesabla
    SELECT COALESCE(SUM(r2.quantity_required * i2.average_cost_per_unit), 0)
    INTO v_total_cost
    FROM recipes r2
    JOIN ingredients i2 ON i2.id = r2.ingredient_id
    WHERE r2.menu_item_id = v_product.id AND r2.is_ai_suggested = false;

    -- Profit margin
    IF v_product.price > 0 THEN
      v_margin := ((v_product.price - v_total_cost) / v_product.price) * 100;
    ELSE
      v_margin := 0;
    END IF;

    -- Yenilə
    UPDATE products
    SET cost_price = v_total_cost,
        profit_margin = ROUND(v_margin, 1)
    WHERE id = v_product.id;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_recalculate_costs ON ingredients;
CREATE TRIGGER trg_recalculate_costs
  AFTER UPDATE OF average_cost_per_unit ON ingredients
  FOR EACH ROW
  WHEN (OLD.average_cost_per_unit IS DISTINCT FROM NEW.average_cost_per_unit)
  EXECUTE FUNCTION recalculate_product_costs();

-- ═══════════════════════════════════════════════════════════════
-- 7. TRIGGER: Resept əlavə/sil/dəyişdiriləndə də maya dəyəri yenilənsin
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION recalculate_cost_for_recipe()
RETURNS TRIGGER AS $$
DECLARE
  v_product_id uuid;
  v_total_cost numeric;
  v_price numeric;
  v_margin numeric;
BEGIN
  -- menu_item_id-ni tap
  IF TG_OP = 'DELETE' THEN
    v_product_id := OLD.menu_item_id;
  ELSE
    v_product_id := NEW.menu_item_id;
  END IF;

  -- Məhsulun qiymətini oxu
  SELECT price INTO v_price FROM products WHERE id = v_product_id;

  -- Ümumi maya dəyəri hesabla
  SELECT COALESCE(SUM(r.quantity_required * i.average_cost_per_unit), 0)
  INTO v_total_cost
  FROM recipes r
  JOIN ingredients i ON i.id = r.ingredient_id
  WHERE r.menu_item_id = v_product_id AND r.is_ai_suggested = false;

  -- Margin
  IF v_price > 0 THEN
    v_margin := ((v_price - v_total_cost) / v_price) * 100;
  ELSE
    v_margin := 0;
  END IF;

  -- Yenilə
  UPDATE products
  SET cost_price = v_total_cost,
      profit_margin = ROUND(v_margin, 1)
  WHERE id = v_product_id;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_recipe_cost_change ON recipes;
CREATE TRIGGER trg_recipe_cost_change
  AFTER INSERT OR UPDATE OR DELETE ON recipes
  FOR EACH ROW
  EXECUTE FUNCTION recalculate_cost_for_recipe();

-- ═══════════════════════════════════════════════════════════════
-- 8. INVENTORY_STATUS VIEW-I YENIDƏN YARAT (yeni kolonkalar daxil olsun)
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW inventory_status AS
SELECT
  i.id,
  i.name,
  i.unit,
  i.current_stock,
  i.critical_limit,
  i.average_cost_per_unit,
  i.purchase_price,
  i.waste_percentage,
  i.updated_at,
  CASE
    WHEN i.current_stock <= 0 THEN 'out_of_stock'
    WHEN i.current_stock <= i.critical_limit THEN 'critical'
    ELSE 'normal'
  END AS status,
  CASE WHEN i.critical_limit > 0
    THEN ROUND((i.current_stock / i.critical_limit) * 100, 2)
    ELSE 0
  END AS stock_ratio,
  COALESCE(
    (SELECT SUM(l.quantity * i2.average_cost_per_unit)
     FROM inventory_logs l
     JOIN ingredients i2 ON i2.id = l.ingredient_id
     WHERE l.ingredient_id = i.id
       AND l.type = 'waste'
       AND l.created_at >= date_trunc('month', now())),
    0
  ) AS monthly_waste_cost
FROM ingredients i;

-- ═══════════════════════════════════════════════════════════════
-- 9. YOXLAMA
-- ═══════════════════════════════════════════════════════════════

SELECT 'migration v2 completed' AS status;
