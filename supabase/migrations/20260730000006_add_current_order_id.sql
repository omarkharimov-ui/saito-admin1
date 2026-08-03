-- Add current_order_id to table_floors for direct order lookup
ALTER TABLE public.table_floors ADD COLUMN IF NOT EXISTS current_order_id UUID;
CREATE INDEX IF NOT EXISTS idx_table_floors_current_order_id ON public.table_floors(current_order_id);
