-- Create audit_logs table for SSOT audit trail
-- Matches the deployed database schema

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id             uuid                     DEFAULT gen_random_uuid() NOT NULL,
  action         text                     NOT NULL,
  order_id       uuid,
  item_id        uuid,
  user_id        uuid,
  old_amount     numeric,
  new_amount     numeric,
  discount_type  text,
  discount_value numeric,
  reason         text,
  approved_by    uuid,
  snapshot       jsonb                    DEFAULT '{}'::jsonb,
  created_at     timestamp with time zone DEFAULT now(),
  table_name     text,
  record_id      text,
  old_data       jsonb,
  new_data       jsonb,
  performed_by   uuid,
  ip_address     text,
  staff_id       uuid,
  staff_name     text,
  target_type    text,
  target_id      text,
  details        jsonb
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON public.audit_logs (created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON public.audit_logs (action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_order ON public.audit_logs (order_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_table_name ON public.audit_logs (table_name);
CREATE INDEX IF NOT EXISTS idx_audit_logs_record_id ON public.audit_logs (record_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs (created_at DESC);

CREATE POLICY audit_logs_insert ON public.audit_logs
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY audit_logs_select ON public.audit_logs
  FOR SELECT
  USING (true);

CREATE POLICY service_full_audit_logs ON public.audit_logs
  TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY auth_read_audit_logs ON public.audit_logs
  FOR SELECT
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM public.staff
  WHERE ((staff.id = auth.uid()) AND (staff.role = ANY (ARRAY['superadmin'::text, 'admin'::text]))))));

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.audit_logs
  ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);

GRANT ALL ON public.audit_logs TO service_role;
REVOKE ALL ON public.audit_logs FROM anon;
REVOKE ALL ON public.audit_logs FROM authenticated;
