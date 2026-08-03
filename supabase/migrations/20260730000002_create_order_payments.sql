-- order_payments: support split/partial/refund payments per order
CREATE TABLE IF NOT EXISTS public.order_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL,
  method TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  currency TEXT DEFAULT 'AZN',
  status TEXT DEFAULT 'success',
  transaction_id TEXT,
  split_group_id UUID,
  is_partial BOOLEAN DEFAULT false,
  is_refund BOOLEAN DEFAULT false,
  reference_order_id UUID,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.order_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow service_role full access" ON public.order_payments
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Allow anon read" ON public.order_payments
  FOR SELECT USING (auth.role() = 'anon');
