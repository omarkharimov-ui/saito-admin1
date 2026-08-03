CREATE TABLE public.cash_drawer_log (
  id          uuid                     DEFAULT gen_random_uuid() NOT NULL,
  session_id  uuid                     NOT NULL,
  type        text                     NOT NULL,
  amount      numeric(10,2)            NOT NULL,
  description text,
  order_id    uuid,
  created_by  uuid,
  created_at  timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX idx_cash_drawer_log_session ON public.cash_drawer_log (session_id);

CREATE INDEX idx_cash_drawer_log_created ON public.cash_drawer_log (created_at);

CREATE POLICY allow_auth_log ON public.cash_drawer_log
  USING ((auth.role() = 'authenticated'::text));

ALTER TABLE public.cash_drawer_log
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.cash_drawer_log
  ADD CONSTRAINT cash_drawer_log_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);

ALTER TABLE public.cash_drawer_log
  ADD CONSTRAINT cash_drawer_log_pkey PRIMARY KEY (id);

ALTER TABLE public.cash_drawer_log
  ADD CONSTRAINT cash_drawer_log_type_check CHECK (type = ANY (ARRAY['cash_in'::text, 'cash_out'::text, 'payment'::text, 'open'::text, 'close'::text]));

ALTER TABLE public.cash_drawer_log
  ADD CONSTRAINT cash_drawer_log_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.cash_drawer_sessions(id) ON DELETE CASCADE;

GRANT ALL ON public.cash_drawer_log TO anon;

GRANT ALL ON public.cash_drawer_log TO authenticated;

GRANT ALL ON public.cash_drawer_log TO service_role;