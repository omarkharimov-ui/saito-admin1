CREATE FUNCTION public.auto_populate_ingredients_i18n()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  AS $function$
BEGIN
    -- If ingredients_i18n is null/empty but legacy ingredients exists
    IF (NEW.ingredients_i18n IS NULL OR NEW.ingredients_i18n = '{}') AND NEW.ingredients IS NOT NULL AND array_length(NEW.ingredients, 1) > 0 THEN
        NEW.ingredients_i18n = jsonb_build_object('az', NEW.ingredients);
    END IF;
    RETURN NEW;
END;
$function$;

GRANT ALL ON FUNCTION public.auto_populate_ingredients_i18n() TO anon;

GRANT ALL ON FUNCTION public.auto_populate_ingredients_i18n() TO authenticated;

GRANT ALL ON FUNCTION public.auto_populate_ingredients_i18n() TO service_role;