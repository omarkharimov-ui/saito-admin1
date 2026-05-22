-- =============================================================================
-- Saito Admin — Supabase Row Level Security (RLS)
-- =============================================================================
-- Layihədəki bütün client sorğularına uyğundur:
--   • QR menyu (anon): sifariş, rezervasiya, menyu oxuma
--   • Admin / Superadmin: panel əməliyyatları
--   • Kitchen: mətbəx ekranı
--
-- Tətbiq: Supabase Dashboard → SQL Editor → bu faylı işə salın
--         və ya: supabase db push / migration apply
--
-- QEYD: API route-lar SERVICE_ROLE_KEY ilə RLS-i keçir — bu policy-lər
--       əsasən brauzerdə anon/authenticated client üçündür.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Helper funksiyalar (SECURITY DEFINER — admin_users RLS recursion yoxdur)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.jwt_email()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT lower(coalesce(auth.jwt() ->> 'email', ''));
$$;

CREATE OR REPLACE FUNCTION public.current_admin_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT au.role::text
  FROM public.admin_users au
  WHERE au.id = auth.uid()
    AND coalesce(au.is_active, true) = true
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.current_admin_role_by_email()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT au.role::text
  FROM public.admin_users au
  WHERE lower(au.email) = public.jwt_email()
    AND coalesce(au.is_active, true) = true
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.effective_admin_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(public.current_admin_role(), public.current_admin_role_by_email());
$$;

CREATE OR REPLACE FUNCTION public.is_superadmin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.effective_admin_role() = 'superadmin';
$$;

CREATE OR REPLACE FUNCTION public.is_admin_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.effective_admin_role() IN ('admin', 'superadmin');
$$;

CREATE OR REPLACE FUNCTION public.is_kitchen_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.effective_admin_role() IN ('kitchen', 'superadmin');
$$;

CREATE OR REPLACE FUNCTION public.is_any_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.effective_admin_role() IN ('admin', 'superadmin', 'kitchen');
$$;

CREATE OR REPLACE FUNCTION public.admin_users_is_empty()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NOT EXISTS (SELECT 1 FROM public.admin_users LIMIT 1);
$$;

-- ---------------------------------------------------------------------------
-- 2. Köhnə policy-ləri sil (yenidən tətbiq üçün təhlükəsiz)
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  r record;
  tables text[] := ARRAY[
    'admin_users', 'products', 'categories', 'product_variants', 'product_modifiers',
    'orders', 'order_items', 'reservations', 'campaigns', 'settings',
    'cancelled_orders', 'staff', 'combos', 'combo_items'
  ];
  t text;
BEGIN
  FOREACH t IN ARRAY tables
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = t
    ) THEN
      FOR r IN
        SELECT policyname FROM pg_policies
        WHERE schemaname = 'public' AND tablename = t
      LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, t);
      END LOOP;
    END IF;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 3. RLS aktiv et
-- ---------------------------------------------------------------------------

ALTER TABLE IF EXISTS public.admin_users        ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.products           ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.categories         ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.product_variants   ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.product_modifiers    ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.orders             ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.order_items        ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.reservations       ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.campaigns          ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.settings           ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.cancelled_orders   ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.staff              ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.combos             ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.combo_items        ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 4. admin_users
-- ---------------------------------------------------------------------------

CREATE POLICY admin_users_select_own ON public.admin_users
  FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR lower(email) = public.jwt_email()
    OR public.is_superadmin()
  );

CREATE POLICY admin_users_select_bootstrap ON public.admin_users
  FOR SELECT TO authenticated
  USING (public.admin_users_is_empty());

CREATE POLICY admin_users_insert_bootstrap ON public.admin_users
  FOR INSERT TO authenticated
  WITH CHECK (
    public.admin_users_is_empty()
    AND id = auth.uid()
    AND role = 'superadmin'
    AND coalesce(is_active, true) = true
  );

CREATE POLICY admin_users_insert_superadmin ON public.admin_users
  FOR INSERT TO authenticated
  WITH CHECK (public.is_superadmin());

CREATE POLICY admin_users_update_own ON public.admin_users
  FOR UPDATE TO authenticated
  USING (id = auth.uid() OR lower(email) = public.jwt_email())
  WITH CHECK (id = auth.uid());

CREATE POLICY admin_users_update_superadmin ON public.admin_users
  FOR UPDATE TO authenticated
  USING (public.is_superadmin())
  WITH CHECK (public.is_superadmin());

CREATE POLICY admin_users_delete_superadmin ON public.admin_users
  FOR DELETE TO authenticated
  USING (public.is_superadmin());

-- ---------------------------------------------------------------------------
-- 5. products
-- ---------------------------------------------------------------------------

-- Menyu + QR: anon oxuya bilər (stokda olanlar; is_available null/true)
CREATE POLICY products_select_public ON public.products
  FOR SELECT TO anon, authenticated
  USING (
    coalesce(is_in_stock, true) = true
    AND coalesce(is_available, true) = true
  );

-- Staff: bütün məhsullar (admin panel, kitchen)
CREATE POLICY products_select_staff ON public.products
  FOR SELECT TO authenticated
  USING (public.is_any_staff());

-- Admin + Superadmin: INSERT/UPDATE/DELETE (authenticated JWT tələb olunur)
CREATE POLICY products_insert_staff ON public.products
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_staff() OR public.is_superadmin());

CREATE POLICY products_update_staff ON public.products
  FOR UPDATE TO authenticated
  USING (public.is_admin_staff() OR public.is_superadmin())
  WITH CHECK (public.is_admin_staff() OR public.is_superadmin());

CREATE POLICY products_delete_staff ON public.products
  FOR DELETE TO authenticated
  USING (public.is_admin_staff() OR public.is_superadmin());

-- QR Happy Hour: UIContext anon endirimi sıfırlaya bilər
CREATE POLICY products_update_anon_happy_hour ON public.products
  FOR UPDATE TO anon
  USING (true)
  WITH CHECK (true);

-- Kitchen: məhsulu müvəqqəti söndür
CREATE POLICY products_update_kitchen ON public.products
  FOR UPDATE TO authenticated
  USING (public.is_kitchen_staff())
  WITH CHECK (public.is_kitchen_staff());

-- ---------------------------------------------------------------------------
-- 6. categories
-- ---------------------------------------------------------------------------

CREATE POLICY categories_select_public ON public.categories
  FOR SELECT TO anon, authenticated
  USING (true);

CREATE POLICY categories_write_superadmin ON public.categories
  FOR ALL TO authenticated
  USING (public.is_superadmin())
  WITH CHECK (public.is_superadmin());

CREATE POLICY categories_write_admin ON public.categories
  FOR ALL TO authenticated
  USING (public.is_admin_staff())
  WITH CHECK (public.is_admin_staff());

-- ---------------------------------------------------------------------------
-- 7. product_variants & product_modifiers
-- ---------------------------------------------------------------------------

CREATE POLICY product_variants_select_public ON public.product_variants
  FOR SELECT TO anon, authenticated
  USING (true);

CREATE POLICY product_variants_write_superadmin ON public.product_variants
  FOR ALL TO authenticated
  USING (public.is_superadmin())
  WITH CHECK (public.is_superadmin());

CREATE POLICY product_modifiers_select_public ON public.product_modifiers
  FOR SELECT TO anon, authenticated
  USING (true);

CREATE POLICY product_modifiers_write_superadmin ON public.product_modifiers
  FOR ALL TO authenticated
  USING (public.is_superadmin())
  WITH CHECK (public.is_superadmin());

-- ---------------------------------------------------------------------------
-- 8. combos & combo_items
-- ---------------------------------------------------------------------------

CREATE POLICY combos_select_public ON public.combos
  FOR SELECT TO anon, authenticated
  USING (
    coalesce(is_active, true) = true
    AND coalesce(is_in_stock, true) = true
  );

CREATE POLICY combos_select_staff ON public.combos
  FOR SELECT TO authenticated
  USING (public.is_any_staff());

CREATE POLICY combos_write_superadmin ON public.combos
  FOR ALL TO authenticated
  USING (public.is_superadmin())
  WITH CHECK (public.is_superadmin());

CREATE POLICY combo_items_select_public ON public.combo_items
  FOR SELECT TO anon, authenticated
  USING (true);

CREATE POLICY combo_items_write_superadmin ON public.combo_items
  FOR ALL TO authenticated
  USING (public.is_superadmin())
  WITH CHECK (public.is_superadmin());

-- ---------------------------------------------------------------------------
-- 9. campaigns
-- ---------------------------------------------------------------------------

CREATE POLICY campaigns_select_public ON public.campaigns
  FOR SELECT TO anon, authenticated
  USING (true);

CREATE POLICY campaigns_write_admin ON public.campaigns
  FOR ALL TO authenticated
  USING (public.is_admin_staff())
  WITH CHECK (public.is_admin_staff());

-- Happy Hour avtomatik söndürmə (UIContext — anon)
CREATE POLICY campaigns_update_anon_happy_hour ON public.campaigns
  FOR UPDATE TO anon
  USING (type = 'HAPPY_HOUR' AND status = 'active')
  WITH CHECK (status = 'inactive');

-- ---------------------------------------------------------------------------
-- 10. reservations
-- ---------------------------------------------------------------------------

CREATE POLICY reservations_insert_public ON public.reservations
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    coalesce(status, 'pending') = 'pending'
    AND guests IS NOT NULL
    AND guests >= 1
    AND guests <= 50
    AND name IS NOT NULL
    AND phone IS NOT NULL
  );

CREATE POLICY reservations_select_staff ON public.reservations
  FOR SELECT TO authenticated
  USING (public.is_admin_staff());

CREATE POLICY reservations_update_staff ON public.reservations
  FOR UPDATE TO authenticated
  USING (public.is_admin_staff())
  WITH CHECK (public.is_admin_staff());

CREATE POLICY reservations_delete_staff ON public.reservations
  FOR DELETE TO authenticated
  USING (public.is_admin_staff());

-- ---------------------------------------------------------------------------
-- 11. orders & order_items (QR + admin + kitchen)
-- ---------------------------------------------------------------------------

CREATE POLICY orders_select_public ON public.orders
  FOR SELECT TO anon, authenticated
  USING (true);

CREATE POLICY orders_insert_public ON public.orders
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    coalesce(status, 'new') IN ('new', 'confirmed')
    AND table_number IS NOT NULL
    AND table_number >= 1
    AND table_number <= 200
  );

CREATE POLICY orders_update_public ON public.orders
  FOR UPDATE TO anon
  USING (status IN ('new', 'confirmed'))
  WITH CHECK (status IN ('new', 'confirmed', 'paid', 'cancelled'));

CREATE POLICY orders_write_staff ON public.orders
  FOR ALL TO authenticated
  USING (public.is_admin_staff() OR public.is_kitchen_staff())
  WITH CHECK (public.is_admin_staff() OR public.is_kitchen_staff());

CREATE POLICY order_items_select_public ON public.order_items
  FOR SELECT TO anon, authenticated
  USING (true);

CREATE POLICY order_items_insert_public ON public.order_items
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY order_items_update_public ON public.order_items
  FOR UPDATE TO anon
  USING (true)
  WITH CHECK (true);

CREATE POLICY order_items_write_staff ON public.order_items
  FOR ALL TO authenticated
  USING (public.is_admin_staff() OR public.is_kitchen_staff())
  WITH CHECK (public.is_admin_staff() OR public.is_kitchen_staff());

-- ---------------------------------------------------------------------------
-- 12. cancelled_orders
-- ---------------------------------------------------------------------------

CREATE POLICY cancelled_orders_select_staff ON public.cancelled_orders
  FOR SELECT TO authenticated
  USING (public.is_admin_staff());

CREATE POLICY cancelled_orders_insert_staff ON public.cancelled_orders
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_staff());

-- ---------------------------------------------------------------------------
-- 13. settings
-- ---------------------------------------------------------------------------

-- Footer, QR, public — bütün sətir (SMTP də daxildir; gələcəkdə view ilə məhdudlaşdırın)
CREATE POLICY settings_select_public ON public.settings
  FOR SELECT TO anon, authenticated
  USING (true);

CREATE POLICY settings_write_superadmin ON public.settings
  FOR ALL TO authenticated
  USING (public.is_superadmin())
  WITH CHECK (public.is_superadmin());

-- Kitchen: yalnız order_delay_minutes oxuma
CREATE POLICY settings_select_kitchen ON public.settings
  FOR SELECT TO authenticated
  USING (public.is_kitchen_staff());

-- Admin kampaniya səhifəsi settings oxuya bilər
CREATE POLICY settings_select_admin ON public.settings
  FOR SELECT TO authenticated
  USING (public.is_admin_staff());

-- ---------------------------------------------------------------------------
-- 14. staff (yalnız superadmin)
-- ---------------------------------------------------------------------------

CREATE POLICY staff_all_superadmin ON public.staff
  FOR ALL TO authenticated
  USING (public.is_superadmin())
  WITH CHECK (public.is_superadmin());

-- ---------------------------------------------------------------------------
-- 15. Storage: product-images
-- ---------------------------------------------------------------------------

-- Bucket mövcud deyilsə Dashboard-dan yaradın (public read)

DROP POLICY IF EXISTS product_images_select_public ON storage.objects;
DROP POLICY IF EXISTS product_images_insert_staff ON storage.objects;
DROP POLICY IF EXISTS product_images_update_staff ON storage.objects;
DROP POLICY IF EXISTS product_images_delete_staff ON storage.objects;

CREATE POLICY product_images_select_public ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'product-images');

CREATE POLICY product_images_insert_staff ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'product-images'
    AND public.is_any_staff()
  );

CREATE POLICY product_images_update_staff ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'product-images' AND public.is_any_staff())
  WITH CHECK (bucket_id = 'product-images' AND public.is_any_staff());

CREATE POLICY product_images_delete_staff ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'product-images' AND public.is_superadmin());

-- ---------------------------------------------------------------------------
-- 16. Realtime publication (orders, reservations, campaigns)
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'orders'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'reservations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.reservations;
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'order_items'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.order_items;
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'campaigns'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.campaigns;
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

COMMIT;

-- =============================================================================
-- Rol xülasəsi
-- =============================================================================
-- anon:           rezervasiya insert; sifariş/order_items; menyu oxuma;
--                 settings oxuma; Happy Hour avtomatik söndürmə
-- authenticated
--   kitchen:      orders/order_items; products is_available; settings delay
--   admin:        + reservations, campaigns, cancelled_orders, dashboard products
--   superadmin:   hamısı (+ staff, settings yazma, combos, storage silmə)
-- service_role:   RLS keçir (API route-lar)
-- =============================================================================
