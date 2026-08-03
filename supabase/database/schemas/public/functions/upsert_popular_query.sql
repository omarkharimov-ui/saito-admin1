CREATE FUNCTION public.upsert_popular_query (
  q_text text,
  q_lang text
)
  RETURNS void
  LANGUAGE plpgsql
  AS $function$
begin
  insert into popular_queries (query_text, language, count, last_seen)
  values (q_text, q_lang, 1, now())
  on conflict (query_text, language)
  do update set count = popular_queries.count + 1, last_seen = now();
end;
$function$;

GRANT ALL ON FUNCTION public.upsert_popular_query(text, text) TO anon;

GRANT ALL ON FUNCTION public.upsert_popular_query(text, text) TO authenticated;

GRANT ALL ON FUNCTION public.upsert_popular_query(text, text) TO service_role;