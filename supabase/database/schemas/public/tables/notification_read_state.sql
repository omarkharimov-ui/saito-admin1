CREATE TABLE public.notification_read_state (
  user_id      uuid                     NOT NULL,
  last_read_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE POLICY notification_read_state_policy ON public.notification_read_state
  TO authenticated
  USING (true)
  WITH CHECK (true);

ALTER TABLE public.notification_read_state
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.notification_read_state
  ADD CONSTRAINT notification_read_state_pkey PRIMARY KEY (user_id);

GRANT ALL ON public.notification_read_state TO anon;

GRANT ALL ON public.notification_read_state TO authenticated;

GRANT ALL ON public.notification_read_state TO service_role;