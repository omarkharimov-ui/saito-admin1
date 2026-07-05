-- ============================================================================
-- SAITO ADMIN: SINGLE SOURCE OF TRUTH — DATABASE SCHEMA SYNC
-- ============================================================================
-- Bu SQL kodunu Supabase Dashboard -> SQL Editor hissəsində işlədin.
-- Məqsəd: Bütün workflow-ların (Alerts, Labor, Sync) bazada rəsmiləşdirilməsi.

-- 1. DISCREPANCY ALERTS (İtki və Kənarlaşma Xəbərdarlıqları)
CREATE TABLE IF NOT EXISTS discrepancy_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type TEXT NOT NULL, -- 'invoice_amount', 'waste_vs_norm', 'margin_drop', etc.
    severity TEXT DEFAULT 'medium', -- 'critical', 'high', 'medium', 'low'
    title TEXT NOT NULL,
    description TEXT,
    source_id TEXT, -- Order ID və ya Invoice ID
    source_table TEXT, -- 'orders' və ya 'invoices'
    value NUMERIC,
    expected_value NUMERIC,
    variance_pct NUMERIC,
    status TEXT DEFAULT 'open', -- 'open', 'acknowledged', 'resolved'
    created_at TIMESTAMPTZ DEFAULT now(),
    resolved_at TIMESTAMPTZ
);

-- 2. CLOCK EVENTS (İşçi Davamiyyəti — Labor Cost üçün)
CREATE TABLE IF NOT EXISTS clock_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    clock_in TIMESTAMPTZ DEFAULT now(),
    clock_out TIMESTAMPTZ,
    note TEXT
);

-- 3. WASTE STANDARDS (İsraf Normaları)
CREATE TABLE IF NOT EXISTS waste_standards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    keyword TEXT NOT NULL, -- Məsələn: 'Ət', 'Kartof', 'Pomidor'
    waste_percentage NUMERIC NOT NULL, -- Məsələn: 5.0 (yəni 5%)
    category TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. MISSING COLUMNS IN ORDERS (Lifecycle Sync)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS kitchen_status TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS reservation_id UUID;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS checkin_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;

-- 5. COMBO GROUP SUPPORT (Combo parent-child grouping)
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS combo_group_id UUID DEFAULT NULL;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS is_combo_parent BOOLEAN DEFAULT FALSE;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS special_notes TEXT;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS variant_id UUID DEFAULT NULL;

-- 6. ITEM-LEVEL STOCK TRACKING (Inventory)
ALTER TABLE inventory_logs ADD COLUMN IF NOT EXISTS order_item_id UUID REFERENCES order_items(id) ON DELETE SET NULL;
ALTER TABLE inventory_logs ADD COLUMN IF NOT EXISTS item_quantity NUMERIC DEFAULT 1;
CREATE INDEX IF NOT EXISTS idx_inventory_logs_order_item ON inventory_logs(order_item_id);

-- 7. MISSING COLUMNS IN TABLE_FLOORS (Workflow Sync)
ALTER TABLE table_floors ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ;
ALTER TABLE table_floors ADD COLUMN IF NOT EXISTS opened_at TIMESTAMPTZ;

-- 8. INDEXES for Performance
CREATE INDEX IF NOT EXISTS idx_alerts_status ON discrepancy_alerts(status);
CREATE INDEX IF NOT EXISTS idx_clock_staff ON clock_events(staff_id);
CREATE INDEX IF NOT EXISTS idx_orders_reservation ON orders(reservation_id);

-- ============================================================================
-- END OF SCHEMA SYNC
-- ============================================================================
