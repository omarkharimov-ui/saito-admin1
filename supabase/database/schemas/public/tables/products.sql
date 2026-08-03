CREATE TABLE public.products (
  id                   uuid                     DEFAULT gen_random_uuid() NOT NULL,
  name                 text                     NOT NULL,
  description          text,
  price                numeric(10,2)            NOT NULL,
  category_id          uuid,
  image_url            text,
  ingredients          text[],
  calories             integer                  DEFAULT 0,
  is_spicy             boolean                  DEFAULT false,
  is_special           boolean                  DEFAULT false,
  is_in_stock          boolean                  DEFAULT true,
  views_count          integer                  DEFAULT 0,
  created_at           timestamp with time zone DEFAULT now(),
  is_available         boolean                  DEFAULT true,
  ingredients_i18n     jsonb                    DEFAULT '{"az": [], "en": [], "ru": []}'::jsonb,
  description_az       text,
  description_ru       text,
  ingredients_az       text,
  ingredients_ru       text,
  kitchen_section      character varying(20)    DEFAULT 'hot'::character varying,
  name_az              text,
  name_en              text,
  name_ru              text,
  description_en       text,
  ingredients_en       text,
  translations         jsonb                    DEFAULT '{}'::jsonb,
  ingredients_layers   jsonb,
  has_exploded_view    boolean                  DEFAULT false,
  is_ready_product     boolean                  DEFAULT false NOT NULL,
  direct_ingredient_id uuid,
  has_active_recipe    boolean                  DEFAULT false NOT NULL,
  cost_price           numeric                  DEFAULT 0,
  profit_margin        numeric                  DEFAULT 0,
  prep_time_min        integer                  DEFAULT 15,
  is_active            boolean                  DEFAULT true,
  modifiers            jsonb                    DEFAULT '{}'::jsonb,
  sold_count           integer                  DEFAULT 0,
  discount_price       numeric,
  station              text                     DEFAULT 'all'::text,
  allergens            jsonb                    DEFAULT '[]'::jsonb,
  printer_route        text,
  station_id           uuid,
  updated_at           timestamp with time zone DEFAULT now()
);

CREATE INDEX idx_products_category_id ON public.products (category_id);

CREATE INDEX idx_products_is_in_stock ON public.products (is_in_stock);

CREATE INDEX idx_products_views_count ON public.products (views_count DESC);

CREATE INDEX idx_products_station ON public.products (station);

CREATE INDEX idx_products_has_exploded_view ON public.products (has_exploded_view)
  WHERE has_exploded_view = true;

CREATE INDEX idx_products_station_id ON public.products (station_id);

CREATE INDEX idx_products_kitchen_section ON public.products (kitchen_section);

CREATE INDEX idx_products_has_layers ON public.products ((ingredients_layers IS NOT NULL));

CREATE TRIGGER auto_populate_ingredients_i18n
  BEFORE INSERT OR UPDATE ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_populate_ingredients_i18n();

CREATE POLICY auth_read_products ON public.products
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY products_delete_staff ON public.products
  FOR DELETE
  TO authenticated
  USING ((public.is_admin_staff() OR public.is_superadmin()));

CREATE POLICY products_insert_staff ON public.products
  FOR INSERT
  TO authenticated
  WITH CHECK ((public.is_admin_staff() OR public.is_superadmin()));

CREATE POLICY products_select_public ON public.products
  FOR SELECT
  TO anon, authenticated
  USING (((COALESCE(is_in_stock, true) = true) AND (COALESCE(is_available, true) = true)));

CREATE POLICY products_select_staff ON public.products
  FOR SELECT
  TO authenticated
  USING (public.is_any_staff());

CREATE POLICY products_update_anon_happy_hour ON public.products
  FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

CREATE POLICY products_update_kitchen ON public.products
  FOR UPDATE
  TO authenticated
  USING (public.is_kitchen_staff())
  WITH CHECK (public.is_kitchen_staff());

CREATE POLICY products_update_staff ON public.products
  FOR UPDATE
  TO authenticated
  USING ((public.is_admin_staff() OR public.is_superadmin()))
  WITH CHECK ((public.is_admin_staff() OR public.is_superadmin()));

CREATE POLICY service_full_products ON public.products
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY auth_modify_products ON public.products
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM public.staff
  WHERE ((staff.id = auth.uid()) AND (staff.role = ANY (ARRAY['superadmin'::text, 'admin'::text]))))));

COMMENT ON COLUMN public.products.ingredients_layers IS 'Array of layer objects for AI-powered exploded view animation. Each object contains: {name: string, image_url: string, order: number}';

ALTER TABLE public.products
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.products
  ADD CONSTRAINT products_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(id) ON DELETE CASCADE;

ALTER TABLE public.products
  ADD CONSTRAINT products_direct_ingredient_id_fkey FOREIGN KEY (direct_ingredient_id) REFERENCES public.ingredients(id) ON DELETE SET NULL;

ALTER TABLE public.products
  ADD CONSTRAINT products_pkey PRIMARY KEY (id);

ALTER TABLE public.products
  ADD CONSTRAINT products_station_id_fkey FOREIGN KEY (station_id) REFERENCES public.stations(id) ON DELETE SET NULL;

GRANT ALL ON public.products TO anon;

GRANT ALL ON public.products TO authenticated;

GRANT ALL ON public.products TO service_role;