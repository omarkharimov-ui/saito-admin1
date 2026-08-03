CREATE SEQUENCE public.popular_queries_id_seq AS integer;

GRANT ALL ON SEQUENCE public.popular_queries_id_seq TO anon;

GRANT ALL ON SEQUENCE public.popular_queries_id_seq TO authenticated;

GRANT ALL ON SEQUENCE public.popular_queries_id_seq TO service_role;