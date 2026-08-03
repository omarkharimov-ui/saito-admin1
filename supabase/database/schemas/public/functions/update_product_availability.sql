CREATE FUNCTION public.update_product_availability()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  AS $function$
BEGIN
  -- 1. HAZIR MƏHSULLAR: birbaşa direct_ingredient_id-dən stock yoxla
  UPDATE products p
  SET is_available = i.current_stock > 0
  FROM ingredients i
  WHERE p.direct_ingredient_id = i.id
    AND p.is_ready_product = true;

  -- 2. RESEPTLİ məhsullar (hazır deyil amma resepti var): stock-dan asılıdır
  UPDATE products p
  SET is_available = NOT EXISTS (
    SELECT 1
    FROM recipes r
    JOIN ingredients i ON i.id = r.ingredient_id
    WHERE r.menu_item_id = p.id
      AND i.current_stock < r.quantity_required
  )
  WHERE p.is_ready_product = false
    AND EXISTS (
      SELECT 1 FROM recipes r2 WHERE r2.menu_item_id = p.id
    );

  -- 3. NE RESEPTLİ NE HAZIR: həmişə available
  UPDATE products p
  SET is_available = true
  WHERE p.is_ready_product = false
    AND p.direct_ingredient_id IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM recipes r WHERE r.menu_item_id = p.id
    );

  RETURN NULL;
END;
$function$;

GRANT ALL ON FUNCTION public.update_product_availability() TO anon;

GRANT ALL ON FUNCTION public.update_product_availability() TO authenticated;

GRANT ALL ON FUNCTION public.update_product_availability() TO service_role;