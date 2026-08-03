-- reservation_tables: normalized reservation-to-table assignments
CREATE TABLE IF NOT EXISTS public.reservation_tables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id UUID NOT NULL,
  table_number INT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.reservation_tables ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow service_role full access" ON public.reservation_tables
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Allow anon read" ON public.reservation_tables
  FOR SELECT USING (auth.role() = 'anon');
