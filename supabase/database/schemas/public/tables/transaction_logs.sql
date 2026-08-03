CREATE TABLE public.transaction_logs (
  id         uuid                     DEFAULT gen_random_uuid() NOT NULL,
  operation  text                     NOT NULL,
  status     text                     DEFAULT 'completed'::text NOT NULL,
  details    text,
  snapshot   jsonb,
  error      text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX idx_transaction_logs_operation ON public.transaction_logs (operation);

CREATE INDEX idx_transaction_logs_created_at ON public.transaction_logs (created_at);

CREATE POLICY service_role_all ON public.transaction_logs
  TO service_role
  USING (true);

ALTER TABLE public.transaction_logs
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.transaction_logs
  ADD CONSTRAINT transaction_logs_pkey PRIMARY KEY (id);

GRANT ALL ON public.transaction_logs TO anon;

GRANT ALL ON public.transaction_logs TO authenticated;

GRANT ALL ON public.transaction_logs TO service_role;