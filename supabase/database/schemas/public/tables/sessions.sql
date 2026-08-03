CREATE TABLE public.sessions (
  token      text                     NOT NULL,
  user_id    uuid                     NOT NULL,
  role       text                     NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);

CREATE INDEX idx_sessions_token ON public.sessions (token);

CREATE UNIQUE INDEX sessions_token_unique ON public.sessions (token);

CREATE INDEX idx_sessions_expires ON public.sessions (expires_at);

CREATE INDEX idx_sessions_user ON public.sessions (user_id);

CREATE POLICY "Service role manages sessions" ON public.sessions
  USING (true)
  WITH CHECK (true);

ALTER TABLE public.sessions
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.sessions
  ADD CONSTRAINT sessions_pkey PRIMARY KEY (token);

ALTER TABLE public.sessions
  ADD CONSTRAINT sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.admin_users(id) ON DELETE CASCADE;

GRANT ALL ON public.sessions TO anon;

GRANT ALL ON public.sessions TO authenticated;

GRANT ALL ON public.sessions TO service_role;