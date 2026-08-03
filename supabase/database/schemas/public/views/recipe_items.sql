CREATE VIEW public.recipe_items AS SELECT menu_item_id AS product_id,
    ingredient_id,
    quantity_required AS quantity,
    id
   FROM public.recipes;

GRANT ALL ON public.recipe_items TO anon;

GRANT ALL ON public.recipe_items TO authenticated;

GRANT ALL ON public.recipe_items TO service_role;