-- inventory_transactions: idempotent stock movement tracking per order_item
CREATE TABLE IF NOT EXISTS public.inventory_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_item_id UUID UNIQUE,
  ingredient_id UUID NOT NULL,
  quantity NUMERIC NOT NULL,
  unit TEXT NOT NULL,
  transaction_type TEXT NOT NULL,
  reference_type TEXT,
  reference_id UUID,
  performed_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.inventory_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow service_role full access" ON public.inventory_transactions
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Allow anon read" ON public.inventory_transactions
  FOR SELECT USING (auth.role() = 'anon');
