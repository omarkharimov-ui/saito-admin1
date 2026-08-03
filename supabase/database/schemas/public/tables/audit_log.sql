CREATE TABLE public.audit_log (
  id           uuid                     DEFAULT gen_random_uuid() NOT NULL,
  table_name   text                     NOT NULL,
  record_id    uuid,
  action       text                     NOT NULL,
  old_data     jsonb,
  new_data     jsonb,
  performed_by uuid,
  created_at   timestamp with time zone DEFAULT now(),
  changed_by   uuid
);

ALTER TABLE public.audit_log
  ADD CONSTRAINT audit_log_pkey PRIMARY KEY (id);

GRANT ALL ON public.audit_log TO anon;

GRANT ALL ON public.audit_log TO authenticated;

GRANT ALL ON public.audit_log TO service_role;