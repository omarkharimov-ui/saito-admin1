-- BÜTÜN CƏDVƏLLƏRİ GÖSTƏR (schema, ad, təxmini row sayı, ölçü)
SELECT
  schemaname AS schema,
  tablename AS table_name,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size,
  (SELECT n_live_tup FROM pg_stat_user_tables WHERE relname = tablename) AS approx_rows
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY (SELECT n_live_tup FROM pg_stat_user_tables WHERE relname = tablename) DESC NULLS LAST;

-- HƏR CƏDVƏLİN SÜTUNLARI (ad, tip, nullable, default)
SELECT
  table_name,
  jsonb_agg(jsonb_build_object(
    'column', column_name,
    'type', data_type,
    'nullable', is_nullable,
    'default', column_default
  ) ORDER BY ordinal_position) AS columns
FROM information_schema.columns
WHERE table_schema = 'public'
GROUP BY table_name
ORDER BY table_name;

-- SÜTUNLARI AYRI-AYRI GÖSTƏR (daha oxunaqlı)
SELECT
  c.table_name,
  c.column_name,
  c.data_type,
  c.is_nullable,
  c.column_default,
  tc.constraint_type
FROM information_schema.columns c
LEFT JOIN information_schema.key_column_usage kcu
  ON c.table_name = kcu.table_name AND c.column_name = kcu.column_name
LEFT JOIN information_schema.table_constraints tc
  ON kcu.constraint_name = tc.constraint_name
  AND tc.table_name = c.table_name
WHERE c.table_schema = 'public'
ORDER BY c.table_name, c.ordinal_position;
