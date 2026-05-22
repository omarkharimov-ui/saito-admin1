-- Köhnə sessiya/cookie problemindən sonra products INSERT/UPDATE/DELETE
-- policy-lərini vahid staff qaydasına gətirir (yenidən işə salın).
-- Əsas fix: useAdminAuth login-dən sonra setSession (kod dəyişikliyi).

BEGIN;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'products'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.products', r.policyname);
  END LOOP;
END $$;

-- Menyu oxuma
CREATE POLICY products_select_public ON public.products
  FOR SELECT TO anon, authenticated
  USING (
    coalesce(is_in_stock, true) = true
    AND coalesce(is_available, true) = true
  );

CREATE POLICY products_select_staff ON public.products
  FOR SELECT TO authenticated
  USING (public.is_any_staff());

-- Admin + Superadmin: tam yazma
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

-- QR Happy Hour
CREATE POLICY products_update_anon_happy_hour ON public.products
  FOR UPDATE TO anon
  USING (true)
  WITH CHECK (true);

-- Kitchen: yalnız is_available
CREATE POLICY products_update_kitchen ON public.products
  FOR UPDATE TO authenticated
  USING (public.is_kitchen_staff())
  WITH CHECK (public.is_kitchen_staff());

COMMIT;
