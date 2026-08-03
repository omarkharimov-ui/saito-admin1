CREATE TABLE public.cash_drawer_sessions (
  id               uuid                     DEFAULT gen_random_uuid() NOT NULL,
  opened_at        timestamp with time zone DEFAULT now() NOT NULL,
  closed_at        timestamp with time zone,
  opening_balance  numeric(10,2)            DEFAULT 0 NOT NULL,
  closing_balance  numeric(10,2),
  expected_balance numeric(10,2),
  difference       numeric(10,2),
  opened_by        uuid,
  closed_by        uuid,
  status           text                     DEFAULT 'open'::text NOT NULL,
  notes            text,
  created_at       timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX idx_cash_drawer_sessions_status ON public.cash_drawer_sessions (status);

CREATE POLICY allow_auth_sess ON public.cash_drawer_sessions
  USING ((auth.role() = 'authenticated'::text));

ALTER TABLE public.cash_drawer_sessions
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.cash_drawer_sessions
  ADD CONSTRAINT cash_drawer_sessions_closed_by_fkey FOREIGN KEY (closed_by) REFERENCES auth.users(id);

ALTER TABLE public.cash_drawer_sessions
  ADD CONSTRAINT cash_drawer_sessions_opened_by_fkey FOREIGN KEY (opened_by) REFERENCES auth.users(id);

ALTER TABLE public.cash_drawer_sessions
  ADD CONSTRAINT cash_drawer_sessions_pkey PRIMARY KEY (id);

ALTER TABLE public.cash_drawer_sessions
  ADD CONSTRAINT cash_drawer_sessions_status_check CHECK (status = ANY (ARRAY['open'::text, 'closed'::text]));

GRANT ALL ON public.cash_drawer_sessions TO anon;

GRANT ALL ON public.cash_drawer_sessions TO authenticated;

GRANT ALL ON public.cash_drawer_sessions TO service_role;