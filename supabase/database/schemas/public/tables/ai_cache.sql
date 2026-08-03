CREATE TABLE public.ai_cache (
  query_hash text                     NOT NULL,
  query_text text,
  response   text,
  language   text,
  hit_count  integer                  DEFAULT 0,
  created_at timestamp with time zone DEFAULT now()
);

CREATE POLICY ai_cache_select ON public.ai_cache
  FOR SELECT
  USING (true);

ALTER TABLE public.ai_cache
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.ai_cache
  ADD CONSTRAINT ai_cache_pkey PRIMARY KEY (query_hash);

GRANT ALL ON public.ai_cache TO anon;

GRANT ALL ON public.ai_cache TO authenticated;

GRANT ALL ON public.ai_cache TO service_role;