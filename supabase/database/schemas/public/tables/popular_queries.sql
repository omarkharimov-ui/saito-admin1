CREATE TABLE public.popular_queries (
  id         integer                  DEFAULT nextval('public.popular_queries_id_seq'::regclass) NOT NULL,
  query_text text,
  language   text,
  count      integer                  DEFAULT 1,
  last_seen  timestamp with time zone DEFAULT now()
);

ALTER SEQUENCE public.popular_queries_id_seq OWNED BY public.popular_queries.id;

ALTER TABLE public.popular_queries
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.popular_queries
  ADD CONSTRAINT popular_queries_pkey PRIMARY KEY (id);

ALTER TABLE public.popular_queries
  ADD CONSTRAINT popular_queries_query_text_language_key UNIQUE (query_text, LANGUAGE);

GRANT ALL ON public.popular_queries TO anon;

GRANT ALL ON public.popular_queries TO authenticated;

GRANT ALL ON public.popular_queries TO service_role;