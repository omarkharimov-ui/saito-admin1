-- Create operation_logs table for SSOT operation tracking
-- Matches the deployed database schema

CREATE TABLE IF NOT EXISTS public.operation_logs (
  id                  uuid                     DEFAULT gen_random_uuid() NOT NULL,
  operation           text,
  order_id            uuid,
  source_table_number integer,
  target_table_number integer,
  old_state           jsonb                    DEFAULT '{}'::jsonb NOT NULL,
  new_state           jsonb                    DEFAULT '{}'::jsonb NOT NULL,
  undo_payload        jsonb,
  is_undone           boolean                  DEFAULT false,
  undone_at           timestamp with time zone,
  undone_by           uuid,
  performed_by        uuid,
  employee_name       text,
  reason              text,
  ip_address          text,
  device_id           text,
  created_at          timestamp with time zone DEFAULT now(),
  table_number        integer,
  action              text,
  old_values          jsonb,
  new_values          jsonb,
  reservation_id      uuid,
  table_name          text,
  record_id           uuid,
  old_data            jsonb,
  new_data            jsonb,
  type                text,
  payload             jsonb,
  inverse_payload     jsonb
);

CREATE INDEX IF NOT EXISTS idx_operation_logs_created ON public.operation_logs (created_at);
CREATE INDEX IF NOT EXISTS idx_operation_logs_order ON public.operation_logs (order_id);
CREATE INDEX IF NOT EXISTS idx_operation_logs_type ON public.operation_logs (operation);
CREATE INDEX IF NOT EXISTS idx_operation_logs_source ON public.operation_logs (source_table_number);
CREATE INDEX IF NOT EXISTS idx_operation_logs_undo ON public.operation_logs (is_undone)
  WHERE is_undone = false;

CREATE POLICY "Allow anon read" ON public.operation_logs
  FOR SELECT
  USING ((auth.role() = 'anon'::text));

CREATE POLICY "Allow service_role full access" ON public.operation_logs
  USING ((auth.role() = 'service_role'::text));

CREATE POLICY service_role_full_operation_logs ON public.operation_logs
  USING (true) WITH CHECK (true);

ALTER TABLE public.operation_logs ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.operation_logs
  ADD CONSTRAINT operation_logs_pkey PRIMARY KEY (id);

ALTER TABLE public.operation_logs
  ADD CONSTRAINT operation_logs_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE SET NULL;

GRANT ALL ON public.operation_logs TO service_role;
REVOKE ALL ON public.operation_logs FROM anon;
REVOKE ALL ON public.operation_logs FROM authenticated;
