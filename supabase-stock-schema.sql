-- ═══════════════════════════════════════════════════════════════
-- SAITO ADMIN — Inventory Management System v2
-- Production-Ready Schema + Triggers
-- Supabase SQL Editor-a yapışdırın (tam yeni başlanğıc)
-- ═══════════════════════════════════════════════════════════════

-- ── MIGRATION: Köhnə ingredients cədvəlini yenilə ─────────────
-- Əvvəlcə BU BLOKU run edin, sonra aşağıdakı CREATE-lər öz-özünə skip edəcək
ALTER TABLE ingredients
  ADD COLUMN IF NOT EXISTS current_stock         NUMERIC(12,3) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS critical_limit        NUMERIC(12,3) NOT NULL DEFAULT 500,
  ADD COLUMN IF NOT EXISTS average_cost_per_unit NUMERIC(10,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at            TIMESTAMPTZ   NOT NULL DEFAULT now();

-- unit column-u köhnə TEXT idi, yeni ENUM-a migrate et
DO $$ BEGIN
  ALTER TABLE ingredients ALTER COLUMN unit TYPE TEXT;
EXCEPTION WHEN others THEN NULL; END $$;

-- köhnə stock_transactions-ı saxlayın, inventory_logs ayrı cədvəldir
-- köhnə min_limit varsa, critical_limit-ə kopyala
UPDATE ingredients SET critical_limit = min_limit WHERE critical_limit = 500 AND min_limit IS NOT NULL;

-- ── 0. ENUM Types ─────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE ingredient_unit AS ENUM ('gram', 'piece', 'ml');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE inventory_log_type AS ENUM ('stock_in', 'waste', 'adjustment', 'order_consumption');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 1. INGREDIENTS ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ingredients (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  TEXT NOT NULL,
  unit                  ingredient_unit NOT NULL DEFAULT 'gram',
  current_stock         NUMERIC(12, 3) NOT NULL DEFAULT 0,
  critical_limit        NUMERIC(12, 3) NOT NULL DEFAULT 500,
  average_cost_per_unit NUMERIC(10, 4) NOT NULL DEFAULT 0,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ingredients_name ON ingredients(name);

-- ── 2. RECIPES (menu_item ↔ ingredient Many-to-Many) ──────────
CREATE TABLE IF NOT EXISTS recipes (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_item_id      UUID NOT NULL,   -- products.id ilə bağlıdır
  ingredient_id     UUID NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
  quantity_required NUMERIC(12, 3) NOT NULL CHECK (quantity_required > 0),
  UNIQUE (menu_item_id, ingredient_id)
);

CREATE INDEX IF NOT EXISTS idx_recipes_menu_item  ON recipes(menu_item_id);
CREATE INDEX IF NOT EXISTS idx_recipes_ingredient ON recipes(ingredient_id);

-- ── 3. INVENTORY_LOGS ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inventory_logs (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ingredient_id  UUID NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
  type           inventory_log_type NOT NULL,
  quantity       NUMERIC(12, 3) NOT NULL,  -- həmişə müsbət; istiqamət type-dan aydındır
  cost_per_unit  NUMERIC(10, 4),           -- yalnız stock_in üçün doldurulur
  reason         TEXT,
  order_id       UUID,                     -- order_consumption üçün
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invlogs_ingredient ON inventory_logs(ingredient_id);
CREATE INDEX IF NOT EXISTS idx_invlogs_type       ON inventory_logs(type);
CREATE INDEX IF NOT EXISTS idx_invlogs_created    ON inventory_logs(created_at DESC);

-- ── 4. TRIGGER: update_stock_on_log ───────────────────────────
-- inventory_logs-a hər INSERT-də ingredients.current_stock və
-- average_cost_per_unit-i avtomatik yenilə
CREATE OR REPLACE FUNCTION update_stock_on_log()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_current  NUMERIC;
  v_avg_cost NUMERIC;
  v_new_stock NUMERIC;
BEGIN
  SELECT current_stock, average_cost_per_unit
    INTO v_current, v_avg_cost
    FROM ingredients WHERE id = NEW.ingredient_id;

  IF NEW.type = 'stock_in' THEN
    v_new_stock := v_current + NEW.quantity;
    -- Ortalama maya dəyəri: weighted average
    IF NEW.cost_per_unit IS NOT NULL AND NEW.cost_per_unit > 0 THEN
      v_avg_cost := CASE
        WHEN v_current = 0 THEN NEW.cost_per_unit
        ELSE (v_current * v_avg_cost + NEW.quantity * NEW.cost_per_unit) / v_new_stock
      END;
    END IF;
  ELSE
    -- waste / adjustment / order_consumption → azalt
    v_new_stock := GREATEST(v_current - NEW.quantity, 0);
  END IF;

  UPDATE ingredients SET
    current_stock         = v_new_stock,
    average_cost_per_unit = v_avg_cost,
    updated_at            = now()
  WHERE id = NEW.ingredient_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_stock_on_log ON inventory_logs;
CREATE TRIGGER trg_update_stock_on_log
  AFTER INSERT ON inventory_logs
  FOR EACH ROW EXECUTE FUNCTION update_stock_on_log();

-- ── 5. FUNCTION: deduct_stock_on_order ────────────────────────
-- Sifariş tamamlandıqda (status='paid') çağırılır.
-- Sifarişdəki hər menu_item üçün recipes-dən miqdarı tapıb
-- inventory_logs-a order_consumption kimi yazır.
-- Trigger update_stock_on_log bunu avtomatik işlədəcək.
CREATE OR REPLACE FUNCTION deduct_stock_on_order(p_order_id UUID)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT
      r.ingredient_id,
      r.quantity_required * oi.quantity AS total_qty
    FROM order_items oi
    JOIN recipes r ON r.menu_item_id = oi.product_id
    WHERE oi.order_id = p_order_id
  LOOP
    INSERT INTO inventory_logs (ingredient_id, type, quantity, reason, order_id)
    VALUES (
      rec.ingredient_id,
      'order_consumption',
      rec.total_qty,
      'Avtomatik silinmə — Sifariş #' || p_order_id,
      p_order_id
    );
  END LOOP;
END;
$$;

-- ── 6. TRIGGER: auto deduct when order paid ───────────────────
-- orders.status 'paid'-a keçdikdə avtomatik deduct_stock_on_order-i çağır
CREATE OR REPLACE FUNCTION trg_deduct_stock_on_order_paid()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'paid' AND (OLD.status IS DISTINCT FROM 'paid') THEN
    PERFORM deduct_stock_on_order(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_order_paid_deduct ON orders;
CREATE TRIGGER trg_order_paid_deduct
  AFTER UPDATE OF status ON orders
  FOR EACH ROW EXECUTE FUNCTION trg_deduct_stock_on_order_paid();

-- ── 7. VIEW: inventory_status ─────────────────────────────────
CREATE OR REPLACE VIEW inventory_status AS
SELECT
  i.id,
  i.name,
  i.unit::text AS unit,
  i.current_stock,
  i.critical_limit,
  i.average_cost_per_unit,
  i.updated_at,
  CASE
    WHEN i.current_stock <= 0                  THEN 'out_of_stock'
    WHEN i.current_stock <= i.critical_limit   THEN 'critical'
    ELSE                                             'normal'
  END AS status,
  ROUND(
    (i.current_stock / NULLIF(i.critical_limit, 0)) * 100, 1
  ) AS stock_ratio,
  -- Bu aykı waste xərci
  COALESCE((
    SELECT SUM(l.quantity * COALESCE(l.cost_per_unit, i.average_cost_per_unit))
    FROM inventory_logs l
    WHERE l.ingredient_id = i.id
      AND l.type IN ('waste', 'adjustment')
      AND l.created_at >= date_trunc('month', now())
  ), 0) AS monthly_waste_cost
FROM ingredients i
ORDER BY
  CASE WHEN i.current_stock <= 0 THEN 0
       WHEN i.current_stock <= i.critical_limit THEN 1
       ELSE 2 END,
  i.name;

-- ── 8. RLS ────────────────────────────────────────────────────
ALTER TABLE ingredients    ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipes        ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_logs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "inv_ingredients_all"    ON ingredients    FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "inv_recipes_all"        ON recipes        FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "inv_inventory_logs_all" ON inventory_logs FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 9. TRIGGER: Avtomatik Product Availability (stock → products) ──
-- inventory_logs dəyişəndə, reseptdən istifadə edən məhsulların
-- is_available statusu avtomatik yenilənsin

CREATE OR REPLACE FUNCTION update_product_availability()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- Hər hansı ingredient-in stoku reseptdəki tələbdən az olduqda,
  -- həmin ingredient-i istifadə edən məhsul unavailable olur
  UPDATE products p
  SET is_available = NOT EXISTS (
    SELECT 1
    FROM recipes r
    JOIN ingredients i ON i.id = r.ingredient_id
    WHERE r.menu_item_id = p.id
      AND i.current_stock < r.quantity_required
  )
  WHERE EXISTS (
    SELECT 1 FROM recipes r2 WHERE r2.menu_item_id = p.id
  );

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_product_availability_on_stock ON inventory_logs;
CREATE TRIGGER trg_product_availability_on_stock
  AFTER INSERT OR UPDATE OR DELETE ON inventory_logs
  FOR EACH STATEMENT
  EXECUTE FUNCTION update_product_availability();

-- İlkin sync: resepti olan bütün məhsullar üçün availability hesabla
UPDATE products p
SET is_available = NOT EXISTS (
  SELECT 1
  FROM recipes r
  JOIN ingredients i ON i.id = r.ingredient_id
  WHERE r.menu_item_id = p.id
    AND i.current_stock < r.quantity_required
)
WHERE EXISTS (
  SELECT 1 FROM recipes r2 WHERE r2.menu_item_id = p.id
);

-- ── 10. Seed data (şərhi açın, test üçün) ────────────────────
-- INSERT INTO ingredients (name, unit, current_stock, critical_limit, average_cost_per_unit) VALUES
--   ('Somon filesi',  'gram',  8000,  1000, 0.045),
--   ('Düyü (sushi)',  'gram',  15000, 2000, 0.004),
--   ('Avokado',       'piece', 30,    10,   1.20),
--   ('Nori vərəqi',   'piece', 100,   20,   0.35),
--   ('Soya sousu',    'ml',    5000,  500,  0.003),
--   ('Krem pendir',   'gram',  3000,  500,  0.018),
--   ('Xiyar',         'gram',  4000,  800,  0.002),
--   ('Wasabi',        'gram',  500,   100,  0.025);
