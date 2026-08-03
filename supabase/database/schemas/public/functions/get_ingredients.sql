CREATE FUNCTION public.get_ingredients (
  product_row public.products,
  lang        text
)
  RETURNS text[]
  LANGUAGE plpgsql
  IMMUTABLE
  AS $function$
BEGIN
    -- Return ingredients in requested language, fallback to 'az', then empty array
    RETURN COALESCE(
        (product_row.ingredients_i18n->>lang)::TEXT[],
        (product_row.ingredients_i18n->>'az')::TEXT[],
        product_row.ingredients,  -- Legacy fallback
        ARRAY[]::TEXT[]
    );
END;
$function$;

GRANT ALL ON FUNCTION public.get_ingredients(public.products, text) TO anon;

GRANT ALL ON FUNCTION public.get_ingredients(public.products, text) TO authenticated;

GRANT ALL ON FUNCTION public.get_ingredients(public.products, text) TO service_role;