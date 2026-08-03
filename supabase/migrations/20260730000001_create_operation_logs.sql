-- operation_logs: audit trail for POS actions (undo, merge, transfer, seat, cancel, etc.)
CREATE TABLE IF NOT EXISTS public.operation_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_number INT,
  order_id UUID,
  reservation_id UUID,
  action TEXT NOT NULL,
  old_values JSONB,
  new_values JSONB,
  performed_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.operation_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow service_role full access" ON public.operation_logs
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Allow anon read" ON public.operation_logs
  FOR SELECT USING (auth.role() = 'anon');
