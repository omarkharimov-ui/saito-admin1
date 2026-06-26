-- Saito Admin POS - Backend & Integration Migrations

-- 1. Bill Split support
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS is_split BOOLEAN DEFAULT FALSE;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;

-- 2. POS-Stock Bridge support
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS direct_ingredient_id UUID REFERENCES public.ingredients(id);

-- 3. Ingredients improvements
ALTER TABLE public.ingredients ADD COLUMN IF NOT EXISTS theoretical_stock NUMERIC DEFAULT 0;

-- 4. Combo management improvements
ALTER TABLE public.combos ADD COLUMN IF NOT EXISTS is_in_stock BOOLEAN DEFAULT TRUE;
ALTER TABLE public.combos ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;

-- 5. Cancelled orders history tracking
CREATE TABLE IF NOT EXISTS public.cancelled_orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
    table_number INTEGER,
    total_amount NUMERIC,
    reason TEXT,
    reason_text TEXT,
    items JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. Trigger for stock update on payment (if handled via DB)
-- Note: Currently handled in /api/orders/pay, but good to have DB consistency
-- CREATE OR REPLACE FUNCTION update_stock_on_payment()...
