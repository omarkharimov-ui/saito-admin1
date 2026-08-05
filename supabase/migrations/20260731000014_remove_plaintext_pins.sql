-- Remove plaintext PIN columns from staff and admin_users
-- Security fix: only pin_hash should be stored

-- Remove plaintext pin from staff
ALTER TABLE public.staff DROP COLUMN IF EXISTS pin;

-- Remove plaintext pin from admin_users
ALTER TABLE public.admin_users DROP COLUMN IF EXISTS pin;

-- Remove the index on plaintext pin
DROP INDEX IF EXISTS public.admin_users_pin_key;

-- Update hash_password function to accept plain_password directly (no pin column)
CREATE OR REPLACE FUNCTION public.hash_password(plain_password text)
  RETURNS text
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
BEGIN
  RETURN crypt(plain_password, gen_salt('bf', 10));
END;
$function$;
