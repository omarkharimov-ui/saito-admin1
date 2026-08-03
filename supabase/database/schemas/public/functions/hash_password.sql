CREATE FUNCTION public.hash_password (
  plain_password text
)
  RETURNS text
  LANGUAGE plpgsql
  IMMUTABLE
  AS $function$
BEGIN
  RETURN crypt(plain_password, gen_salt('bf', 10));
END;
$function$;

GRANT ALL ON FUNCTION public.hash_password(text) TO anon;

GRANT ALL ON FUNCTION public.hash_password(text) TO authenticated;

GRANT ALL ON FUNCTION public.hash_password(text) TO service_role;