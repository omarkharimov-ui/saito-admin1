CREATE FUNCTION public.verify_password (
  plain_password  text,
  hashed_password text
)
  RETURNS boolean
  LANGUAGE plpgsql
  IMMUTABLE
  AS $function$
BEGIN
  RETURN hashed_password = crypt(plain_password, hashed_password);
END;
$function$;

GRANT ALL ON FUNCTION public.verify_password(text, text) TO anon;

GRANT ALL ON FUNCTION public.verify_password(text, text) TO authenticated;

GRANT ALL ON FUNCTION public.verify_password(text, text) TO service_role;