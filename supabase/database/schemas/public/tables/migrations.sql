CREATE TABLE public.migrations (
  name        text                     NOT NULL,
  executed_at timestamp with time zone
);

ALTER TABLE public.migrations
  ADD CONSTRAINT migrations_pkey PRIMARY KEY (name);

GRANT ALL ON public.migrations TO anon;

GRANT ALL ON public.migrations TO authenticated;

GRANT ALL ON public.migrations TO service_role;