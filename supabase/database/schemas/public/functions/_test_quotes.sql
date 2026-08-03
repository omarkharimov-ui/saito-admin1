CREATE FUNCTION public._test_quotes()
  RETURNS text
  LANGUAGE plpgsql
  AS $function$ BEGIN RETURN chr(39) || chr(112) || chr(97) || chr(105) || chr(100); END; $function$;

GRANT ALL ON FUNCTION public._test_quotes() TO anon;

GRANT ALL ON FUNCTION public._test_quotes() TO authenticated;

GRANT ALL ON FUNCTION public._test_quotes() TO service_role;