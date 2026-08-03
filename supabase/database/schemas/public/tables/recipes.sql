CREATE TABLE public.recipes (
  id                   uuid          DEFAULT gen_random_uuid() NOT NULL,
  menu_item_id         uuid          NOT NULL,
  ingredient_id        uuid          NOT NULL,
  quantity_required    numeric(12,3) NOT NULL,
  is_ai_suggested      boolean       DEFAULT false NOT NULL,
  recipe_header_id     uuid,
  quantity_brutto      numeric,
  hot_waste_percentage numeric       DEFAULT 0
);

CREATE INDEX idx_recipes_ingredient ON public.recipes (ingredient_id);

CREATE INDEX idx_recipes_menu_item ON public.recipes (menu_item_id);

CREATE TRIGGER trg_recipe_cost_change
  AFTER INSERT OR DELETE OR UPDATE ON public.recipes
  FOR EACH ROW
  EXECUTE FUNCTION public.recalculate_cost_for_recipe();

CREATE POLICY auth_read_recipes ON public.recipes
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY inv_recipes_all ON public.recipes
  USING (true)
  WITH CHECK (true);

CREATE POLICY service_full_recipes ON public.recipes
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY auth_modify_recipes ON public.recipes
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM public.staff
  WHERE ((staff.id = auth.uid()) AND (staff.role = ANY (ARRAY['superadmin'::text, 'admin'::text]))))));

ALTER TABLE public.recipes
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.recipes
  ADD CONSTRAINT recipes_ingredient_id_fkey FOREIGN KEY (ingredient_id) REFERENCES public.ingredients(id) ON DELETE CASCADE;

ALTER TABLE public.recipes
  ADD CONSTRAINT recipes_menu_item_id_ingredient_id_key UNIQUE (menu_item_id, ingredient_id);

ALTER TABLE public.recipes
  ADD CONSTRAINT recipes_pkey PRIMARY KEY (id);

ALTER TABLE public.recipes
  ADD CONSTRAINT recipes_quantity_required_check CHECK (quantity_required > 0::numeric);

ALTER TABLE public.recipes
  ADD CONSTRAINT recipes_recipe_header_id_fkey FOREIGN KEY (recipe_header_id) REFERENCES public.recipe_headers(id) ON DELETE CASCADE;

GRANT ALL ON public.recipes TO anon;

GRANT ALL ON public.recipes TO authenticated;

GRANT ALL ON public.recipes TO service_role;