-- ============================================================
-- SAITO ADMIN v2.1 — TƏHLÜKƏSİZ MİQRASYON
-- Artıq mövcud cədvəllərə SALAMAT əlavə edir
-- ============================================================

-- table_floors: mövcud sütunlara əlavə et
ALTER TABLE table_floors ADD COLUMN IF NOT EXISTS total_amount NUMERIC DEFAULT 0;
ALTER TABLE table_floors ADD COLUMN IF NOT EXISTS order_count INTEGER DEFAULT 0;
ALTER TABLE table_floors ADD COLUMN IF NOT EXISTS order_ids TEXT[] DEFAULT '{}';
ALTER TABLE table_floors ADD COLUMN IF NOT EXISTS opened_at TIMESTAMPTZ;
ALTER TABLE table_floors ADD COLUMN IF NOT EXISTS has_pending BOOLEAN DEFAULT false;
ALTER TABLE table_floors ADD COLUMN IF NOT EXISTS oldest_pending_at TIMESTAMPTZ;
ALTER TABLE table_floors ADD COLUMN IF NOT EXISTS merged_into_table INTEGER;
ALTER TABLE table_floors ADD COLUMN IF NOT EXISTS merged_orders JSONB DEFAULT '[]'::jsonb;
ALTER TABLE table_floors ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ DEFAULT NOW();

-- orders: mövcud sütunlara əlavə et
ALTER TABLE orders ADD COLUMN IF NOT EXISTS kitchen_status TEXT DEFAULT 'pending';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS kitchen_accepted_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS kitchen_ready_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_type TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_value NUMERIC;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS paid_amount NUMERIC DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS split_count INTEGER DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS is_draft BOOLEAN DEFAULT false;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS is_split BOOLEAN DEFAULT false;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS is_rush BOOLEAN DEFAULT false;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS merged_into UUID;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS reservation_id UUID;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS created_by UUID;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS assigned_to UUID;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS priority INTEGER DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS special_request TEXT;

-- order_items: mövcud sütunlara əlavə et
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS variant_id UUID;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS kitchen_status TEXT DEFAULT 'pending';
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS prepared_quantity INTEGER DEFAULT 0;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS served_quantity INTEGER DEFAULT 0;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS modifiers JSONB DEFAULT '[]'::jsonb;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS special_notes TEXT DEFAULT '';
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS course TEXT;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS is_ready_product BOOLEAN DEFAULT false;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS direct_ingredient_id UUID;

-- reservations: mövcud sütunlara əlavə et
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS time TEXT;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending';
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS note TEXT;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS table_number INTEGER;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS table_ids JSONB DEFAULT '[]'::jsonb;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS pre_order_items JSONB DEFAULT '[]'::jsonb;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS pre_order_total NUMERIC DEFAULT 0;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS kitchen_scheduled_at TIMESTAMPTZ;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS checked_in_at TIMESTAMPTZ;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

-- products: mövcud sütunlara əlavə et
ALTER TABLE products ADD COLUMN IF NOT EXISTS name_az TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS name_en TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS name_ru TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS translations JSONB DEFAULT '{}'::jsonb;
ALTER TABLE products ADD COLUMN IF NOT EXISTS category_id UUID;
ALTER TABLE products ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_ready_product BOOLEAN DEFAULT false;
ALTER TABLE products ADD COLUMN IF NOT EXISTS has_active_recipe BOOLEAN DEFAULT false;
ALTER TABLE products ADD COLUMN IF NOT EXISTS direct_ingredient_id UUID;
ALTER TABLE products ADD COLUMN IF NOT EXISTS modifiers JSONB DEFAULT '[]'::jsonb;
ALTER TABLE products ADD COLUMN IF NOT EXISTS views_count INTEGER DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS sold_count INTEGER DEFAULT 0;

-- categories: mövcud sütunlara əlavə et
ALTER TABLE categories ADD COLUMN IF NOT EXISTS name_az TEXT;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS name_en TEXT;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS name_ru TEXT;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS translations JSONB DEFAULT '{}'::jsonb;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- recipes: mövcud sütunlara əlavə et
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS quantity_required NUMERIC DEFAULT 0;
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS unit TEXT DEFAULT 'g';
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS is_optional BOOLEAN DEFAULT false;

-- ingredients: mövcud sütunlara əlavə et
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS current_stock NUMERIC DEFAULT 0;
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS unit TEXT DEFAULT 'g';
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS min_stock_threshold NUMERIC DEFAULT 0;
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS average_cost_per_unit NUMERIC DEFAULT 0;
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS supplier_id UUID;
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS last_restocked_at TIMESTAMPTZ;

-- staff: cari sütunlara uyğun dəyişiklik
ALTER TABLE staff ADD COLUMN IF NOT EXISTS pin_hash TEXT;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'cashier';
ALTER TABLE staff ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS hourly_rate NUMERIC DEFAULT 5;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS shift TEXT DEFAULT 'full_time';
ALTER TABLE staff ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- Səfi komandanı təmizlə (null name xətasını həll et)
UPDATE staff SET name = COALESCE(NULLIF(full_name, ''), 'Admin') WHERE name IS NULL OR name = '';

-- Index-lər
CREATE INDEX IF NOT EXISTS idx_inventory_logs_type ON inventory_logs(type);
CREATE INDEX IF NOT EXISTS idx_inventory_logs_ingredient ON inventory_logs(ingredient_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_order ON audit_logs(order_id);
CREATE INDEX IF NOT EXISTS idx_daily_reports_date ON daily_reports(report_date);
