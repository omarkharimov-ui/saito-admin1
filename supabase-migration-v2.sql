-- ═══════════════════════════════════════════════════════════════
-- SAITO ADMIN v3 — WAC + Brutto/Netto + Theoretical Stock
-- ═══════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════
-- 1. INGREDIENTS — WAC + theoretical stock + cold waste
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE ingredients
  ADD COLUMN IF NOT EXISTS purchase_price numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cold_waste_percentage numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS theoretical_stock numeric DEFAULT 0;

-- purchase_price = son alış sənədindəki vahid qiyməti
-- average_cost_per_unit = BÜTÜN alışların çəkili ortalaması (WAC)
-- cold_waste_percentage = soyuq itki (təmizləmə, kəsmə) — 0-100
-- theoretical_stock = proqramın hesabladığı nəzəri qalıq
-- current_stock = inventarizasiyadan sonra real qalıq

-- Köhnə waste_percentage varsa, cold_waste_percentage-ə köçür
UPDATE ingredients SET cold_waste_percentage = waste_percentage WHERE waste_percentage IS DISTINCT FROM 0 AND cold_waste_percentage = 0;

-- ═══════════════════════════════════════════════════════════════
-- 2. PRODUCTS — maya dəyəri + qazanc
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS cost_price numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS profit_margin numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_ready_product boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS direct_ingredient_id uuid REFERENCES ingredients(id) ON DELETE SET NULL;

-- ═══════════════════════════════════════════════════════════════
-- 3. RECIPES — brutto/netto + isti itki
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE recipes
  ADD COLUMN IF NOT EXISTS quantity_brutto numeric,
  ADD COLUMN IF NOT EXISTS hot_waste_percentage numeric DEFAULT 0;

-- quantity_brutto = stokdan silinəcək miqdar (cold waste daxil olmaqla)
-- quantity_required = netto (məhsulun içinə girən xalis miqdar)
-- hot_waste_percentage = bişmə itkisi (0-100). Məs: ət 30% kiçilir

-- quantity_brutto yoxdursa, quantity_required-a bərabər et
UPDATE recipes SET quantity_brutto = quantity_required WHERE quantity_brutto IS NULL;

-- ═══════════════════════════════════════════════════════════════
-- 4. RECIPE_HEADERS — resept başlıq cədvəli
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS recipe_headers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_item_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  instructions text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(menu_item_id)
);

ALTER TABLE recipes
  ADD COLUMN IF NOT EXISTS recipe_header_id uuid REFERENCES recipe_headers(id) ON DELETE CASCADE;

-- ═══════════════════════════════════════════════════════════════
-- 5. WAC FUNKSİYASI: stock_in yazılanda average_cost_per_unit yenilə
--    Formula: WAC = (old_qty * old_avg_cost + new_qty * new_price) / (old_qty + new_qty)
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION apply_wac_on_stock_in()
RETURNS TRIGGER AS $$
DECLARE
  v_old_stock numeric;
  v_old_avg_cost numeric;
  v_wac numeric;
BEGIN
  -- Yalnız stock_in tipində işlə
  IF NEW.type != 'stock_in' THEN
    RETURN NEW;
  END IF;

  -- Mövcud stoku və ortalama dəyəri oxu
  SELECT COALESCE(current_stock, 0), COALESCE(average_cost_per_unit, 0)
  INTO v_old_stock, v_old_avg_cost
  FROM ingredients WHERE id = NEW.ingredient_id;

  -- WAC = (köhnə miqdar × köhnə ortalama + təzə miqdar × təzə qiymət) / (köhnə + təzə)
  IF (v_old_stock + NEW.quantity) > 0 THEN
    v_wac := (v_old_stock * v_old_avg_cost + NEW.quantity * COALESCE(NEW.cost_per_unit, 0)) / (v_old_stock + NEW.quantity);
  ELSE
    v_wac := COALESCE(NEW.cost_per_unit, v_old_avg_cost);
  END IF;

  -- WAC-i yenilə — bu, trg_recalculate_costs trigger-ini işə salacaq
  UPDATE ingredients
  SET average_cost_per_unit = ROUND(v_wac, 6),
      purchase_price = COALESCE(NEW.cost_per_unit, purchase_price),
      updated_at = now()
  WHERE id = NEW.ingredient_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_wac_on_stock_in ON inventory_logs;
CREATE TRIGGER trg_wac_on_stock_in
  AFTER INSERT ON inventory_logs
  FOR EACH ROW
  WHEN (NEW.type = 'stock_in')
  EXECUTE FUNCTION apply_wac_on_stock_in();

-- ═══════════════════════════════════════════════════════════════
-- 6. THEORETICAL STOCK: order_consumption yazılanda theoretical_stock-u yenilə
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION update_theoretical_stock()
RETURNS TRIGGER AS $$
DECLARE
  v_delta numeric;
BEGIN
  IF NEW.type = 'stock_in' THEN
    v_delta := NEW.quantity;
  ELSIF NEW.type IN ('waste', 'order_consumption') THEN
    v_delta := -NEW.quantity;
  ELSIF NEW.type = 'adjustment' THEN
    v_delta := NEW.quantity;
  ELSE
    v_delta := 0;
  END IF;

  UPDATE ingredients
  SET theoretical_stock = GREATEST(0, COALESCE(theoretical_stock, 0) + v_delta),
      updated_at = now()
  WHERE id = NEW.ingredient_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_theoretical_stock ON inventory_logs;
CREATE TRIGGER trg_theoretical_stock
  AFTER INSERT ON inventory_logs
  FOR EACH ROW
  EXECUTE FUNCTION update_theoretical_stock();

-- ═══════════════════════════════════════════════════════════════
-- 6b. CURRENT STOCK: inventory_logs insert-də current_stock-u da yenilə
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION update_current_stock()
RETURNS TRIGGER AS $$
DECLARE
  v_delta numeric;
BEGIN
  IF NEW.type = 'stock_in' THEN
    v_delta := NEW.quantity;
  ELSIF NEW.type IN ('waste', 'order_consumption') THEN
    v_delta := -NEW.quantity;
  ELSIF NEW.type = 'adjustment' THEN
    v_delta := NEW.quantity;
  ELSE
    v_delta := 0;
  END IF;

  UPDATE ingredients
  SET current_stock = GREATEST(0, COALESCE(current_stock, 0) + v_delta),
      updated_at = now()
  WHERE id = NEW.ingredient_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_current_stock ON inventory_logs;
CREATE TRIGGER trg_current_stock
  AFTER INSERT ON inventory_logs
  FOR EACH ROW
  EXECUTE FUNCTION update_current_stock();

-- ═══════════════════════════════════════════════════════════════
-- 7. COST CASCADE: average_cost_per_unit dəyişəndə bütün məhsulları yenilə
--    quantity_brutto istifadə olunur (cold waste daxil)
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION recalculate_product_costs()
RETURNS TRIGGER AS $$
DECLARE
  v_product RECORD;
  v_total_cost numeric;
  v_margin numeric;
BEGIN
  FOR v_product IN
    SELECT DISTINCT p.id, p.price
    FROM products p
    JOIN recipes r ON r.menu_item_id = p.id
    WHERE r.ingredient_id = NEW.id AND r.is_ai_suggested = false
  LOOP
    -- Maya dəyəri = Σ(quantity_brutto × average_cost_per_unit)
    -- quantity_brutto cold waste-i əhatə edir
    SELECT COALESCE(SUM(COALESCE(r2.quantity_brutto, r2.quantity_required) * i2.average_cost_per_unit), 0)
    INTO v_total_cost
    FROM recipes r2
    JOIN ingredients i2 ON i2.id = r2.ingredient_id
    WHERE r2.menu_item_id = v_product.id AND r2.is_ai_suggested = false;

    IF v_product.price > 0 THEN
      v_margin := ((v_product.price - v_total_cost) / v_product.price) * 100;
    ELSE
      v_margin := 0;
    END IF;

    UPDATE products
    SET cost_price = ROUND(v_total_cost, 2),
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
-- 8. TRIGGER: Resept dəyişəndə maya dəyərini yenilə (brutto əsasında)
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION recalculate_cost_for_recipe()
RETURNS TRIGGER AS $$
DECLARE
  v_product_id uuid;
  v_total_cost numeric;
  v_price numeric;
  v_margin numeric;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_product_id := OLD.menu_item_id;
  ELSE
    v_product_id := NEW.menu_item_id;
  END IF;

  SELECT price INTO v_price FROM products WHERE id = v_product_id;

  -- quantity_brutto istifadə et (cold waste daxil)
  SELECT COALESCE(SUM(COALESCE(r.quantity_brutto, r.quantity_required) * i.average_cost_per_unit), 0)
  INTO v_total_cost
  FROM recipes r
  JOIN ingredients i ON i.id = r.ingredient_id
  WHERE r.menu_item_id = v_product_id AND r.is_ai_suggested = false;

  IF v_price > 0 THEN
    v_margin := ((v_price - v_total_cost) / v_price) * 100;
  ELSE
    v_margin := 0;
  END IF;

  UPDATE products
  SET cost_price = ROUND(v_total_cost, 2),
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
-- 9. INVENTORY_STATUS VIEW (theoretical_stock daxil)
-- ═══════════════════════════════════════════════════════════════

DROP VIEW IF EXISTS inventory_status;
CREATE VIEW inventory_status AS
SELECT
  i.id,
  i.name,
  i.unit,
  i.current_stock,
  i.theoretical_stock,
  i.critical_limit,
  i.average_cost_per_unit,
  i.purchase_price,
  i.cold_waste_percentage,
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
-- 10. PRODUCT_COST_SUMMARY VIEW (brutto əsaslı)
-- ═══════════════════════════════════════════════════════════════

DROP VIEW IF EXISTS product_cost_summary;
CREATE VIEW product_cost_summary AS
SELECT
  p.id AS product_id,
  p.name_az AS product_name,
  p.price AS sale_price,
  COALESCE(
    SUM(COALESCE(r.quantity_brutto, r.quantity_required) * i.average_cost_per_unit),
    0
  ) AS calculated_cost,
  CASE WHEN p.price > 0
    THEN ROUND(
      ((p.price - COALESCE(SUM(COALESCE(r.quantity_brutto, r.quantity_required) * i.average_cost_per_unit), 0)) / p.price) * 100,
      1
    )
    ELSE 0
  END AS calculated_margin
FROM products p
LEFT JOIN recipes r ON r.menu_item_id = p.id AND r.is_ai_suggested = false
LEFT JOIN ingredients i ON i.id = r.ingredient_id
GROUP BY p.id, p.name_az, p.price;

-- ═══════════════════════════════════════════════════════════════
-- 11. STOCK AUDIT FUNKSİYASI: inventarizasiya
--     current_stock-u yeniləyir, fərqi adjustment kimi log-a yazır
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION perform_stock_audit(
  p_ingredient_id uuid,
  p_actual_qty numeric
) RETURNS json AS $$
DECLARE
  v_theoretical numeric;
  v_diff numeric;
  v_avg_cost numeric;
BEGIN
  SELECT theoretical_stock, average_cost_per_unit
  INTO v_theoretical, v_avg_cost
  FROM ingredients WHERE id = p_ingredient_id;

  v_diff := p_actual_qty - COALESCE(v_theoretical, 0);

  -- Fərq varsa adjustment log yaz
  IF v_diff != 0 THEN
    INSERT INTO inventory_logs (ingredient_id, type, quantity, cost_per_unit, reason)
    VALUES (p_ingredient_id, 'adjustment', v_diff, v_avg_cost, 'İnventarizasiya uyğunsuzluğu');
  END IF;

  -- Real stoku yenilə (trigger avtomatik current_stock-u artıracaq/azaldacaq)
  -- current_stock-u birbaşa yeniləyirik (trigger log-dan asılı deyil)
  UPDATE ingredients
  SET current_stock = GREATEST(0, p_actual_qty),
      theoretical_stock = GREATEST(0, p_actual_qty),
      updated_at = now()
  WHERE id = p_ingredient_id;

  RETURN json_build_object(
    'ingredient_id', p_ingredient_id,
    'theoretical_before', v_theoretical,
    'actual', p_actual_qty,
    'difference', v_diff,
    'adjustment_cost', ROUND(ABS(v_diff) * v_avg_cost, 2)
  );
END;
$$ LANGUAGE plpgsql;

-- ═══════════════════════════════════════════════════════════════
-- 12. WASTE_STANDARDS — standart itki faizləri bazası
--     Şefə avtomatik təklif göstərmək üçün, "Avokado → 12%"
--     Admin panel vasitəsilə redaktə edilə bilər
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS waste_standards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  keyword text NOT NULL UNIQUE,       -- axtarış açarı (azərbaycanca)
  keyword_en text,                    -- ingiliscə axtarış üçün
  waste_percentage numeric NOT NULL CHECK (waste_percentage >= 0 AND waste_percentage < 100),
  note text,                          -- "Qabıq + çəyirdək"
  category text,                      -- tərəvəz, meyvə, ət, balıq, süd...
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Seed data
INSERT INTO waste_standards (keyword, keyword_en, waste_percentage, note, category) VALUES
  ('avokado', 'avocado', 12, 'Qabıq + çəyirdək', 'meyvə'),
  ('kartof', 'potato', 18, 'Qabıq + göz', 'tərəvəz'),
  ('somon', 'salmon', 8, 'Dəri + sümük', 'balıq'),
  ('ət', 'beef', 10, 'Pərdə + sümük', 'ət'),
  ('mal', 'beef', 10, 'Pərdə + sümük', 'ət'),
  ('quzu', 'lamb', 10, 'Pərdə + sümük', 'ət'),
  ('dana', 'veal', 10, 'Pərdə + sümük', 'ət'),
  ('toyuq', 'chicken', 12, 'Sümük + dəri', 'ət'),
  ('balıq', 'fish', 15, 'Sümük + bağırsaq', 'balıq'),
  ('soğan', 'onion', 5, 'Qabıq + kök', 'tərəvəz'),
  ('bibər', 'pepper', 8, 'Toxum + sap', 'tərəvəz'),
  ('pomidor', 'tomato', 3, 'Sap yeri', 'tərəvəz'),
  ('xiyar', 'cucumber', 5, 'Qabıq (arzuolunan)', 'tərəvəz'),
  ('limon', 'lemon', 40, 'Qabıq + toxum', 'meyvə'),
  ('kələm', 'cabbage', 15, 'Xarici yarpaqlar + kök', 'tərəvəz'),
  ('yumurta', 'egg', 0, 'Itkisiz (qabıq çəkiyə daxil deyil)', 'süd'),
  ('un', 'flour', 0, 'Itkisiz', 'quru'),
  ('şəkər', 'sugar', 0, 'Itkisiz', 'quru'),
  ('yağ', 'butter', 0, 'Itkisiz (tam istifadə olunur)', 'yağ'),
  ('pendir', 'cheese', 2, 'Qabıq (minimal)', 'süd'),
  ('banan', 'banana', 30, 'Qabıq', 'meyvə'),
  ('alma', 'apple', 8, 'Nüvə + sap', 'meyvə'),
  ('çiyələk', 'strawberry', 5, 'Sap + yarpaq', 'meyvə'),
  ('üzüm', 'grape', 3, 'Salxım sapı', 'meyvə'),
  ('düyü', 'rice', 0, 'Itkisiz', 'quru'),
  ('makaron', 'pasta', 0, 'Itkisiz', 'quru'),
  ('çörək', 'bread', 5, 'Qabıq kənarları', 'quru'),
  ('kök', 'carrot', 10, 'Qabıq + uc', 'tərəvəz'),
  ('göbələk', 'mushroom', 5, 'Kök hissə', 'tərəvəz'),
  ('qaymaq', 'cream', 0, 'Itkisiz', 'süd'),
  ('süd', 'milk', 0, 'Itkisiz', 'süd'),
  ('badımcan', 'eggplant', 5, 'Sap + qabıq', 'tərəvəz'),
  ('qarpız', 'watermelon', 45, 'Qabıq + toxum', 'meyvə')
ON CONFLICT (keyword) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════
-- 13. YOXLAMA
-- ═══════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════
-- 14. PRODUCTS — UNIQUE constraint on name_az
-- ═══════════════════════════════════════════════════════════════
ALTER TABLE products ADD CONSTRAINT products_name_az_unique UNIQUE (name_az);

-- ═══════════════════════════════════════════════════════════════
-- 15. ORDERS — payment / discount / split columns
-- ═══════════════════════════════════════════════════════════════
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS payment_method text,
  ADD COLUMN IF NOT EXISTS discount_type text,
  ADD COLUMN IF NOT EXISTS discount_value numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS paid_amount numeric,
  ADD COLUMN IF NOT EXISTS split_count integer DEFAULT 1;

-- ═══════════════════════════════════════════════════════════════
-- 16. DELETE stub/test products (no category, no image, a1b2c3d4 UUID)
-- ═══════════════════════════════════════════════════════════════
DELETE FROM order_items
WHERE product_id IN (
  SELECT id FROM products
  WHERE category_id IS NULL AND (image_url IS NULL OR image_url = '')
);

DELETE FROM products
WHERE category_id IS NULL AND (image_url IS NULL OR image_url = '');

-- ═══════════════════════════════════════════════════════════════

SELECT 'migration v3 completed' AS status;
