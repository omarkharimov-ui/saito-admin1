-- ============================================================================
-- 20260921000005_w_m2_client_write_grants_policies.sql
-- QF2 P3 fix — client-side (admin UI) writes to product-management tables
-- ----------------------------------------------------------------------------
-- ROOT CAUSE (verified live 2026-09-21):
--   The admin Products page (src/app/admin/products/page.tsx → handleSave)
--   writes directly from the browser via the supabase client. That client
--   runs as role `anon` (custom PIN-cookie auth; supabase.auth session is
--   never established). Live probes showed two independent blockers:
--     1. GRANT layer:  public.products grants anon/authenticated SELECT only
--        → INSERT/UPDATE "permission denied for table products"
--     2. RLS layer:    categories, product_variants, product_modifiers,
--        modifier_groups, modifier_group_items, product_modifier_groups,
--        product_allergens, combos have GRANT ALL but only SELECT policies
--        → "new row violates row-level security policy"
--   Consequence: EVERY product save from the admin UI failed at the
--   products-table step, and because child CRUD (variants / modifiers /
--   groups / allergens) only runs after a successful product write, the
--   whole modifier-group feature (QF2) silently never persisted.
--
-- FIX — mirror the existing house pattern (combo_items already has
-- client-write policies; SELECT policies are {anon,authenticated}):
--     * GRANT INSERT/UPDATE/DELETE on products to anon + authenticated
--     * permissive INSERT/UPDATE/DELETE policies (USING/WITH CHECK true)
--       for anon + authenticated on the 9 product-management tables
--
-- Security note: this matches the app's established architecture — the
-- client bundle already carries the anon key and the schema already grants
-- anon FULL privileges on all child tables; only the policies/GRANT were
-- missing (oversight when SELECT policies were added).
-- ============================================================================

-- 1) GRANT layer -------------------------------------------------------------
GRANT INSERT, UPDATE, DELETE ON public.products TO anon, authenticated;

-- 2) RLS write policies ------------------------------------------------------
DO $$
DECLARE
  t text;
  tbls text[] := ARRAY[
    'products',
    'categories',
    'product_variants',
    'product_modifiers',
    'modifier_groups',
    'modifier_group_items',
    'product_modifier_groups',
    'product_allergens',
    'combos'
  ];
BEGIN
  FOREACH t IN ARRAY tbls LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I_insert_client ON public.%I', t, t);
    EXECUTE format('CREATE POLICY %I_insert_client ON public.%I FOR INSERT TO anon, authenticated WITH CHECK (true)', t, t);

    EXECUTE format('DROP POLICY IF EXISTS %I_update_client ON public.%I', t, t);
    EXECUTE format('CREATE POLICY %I_update_client ON public.%I FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true)', t, t);

    EXECUTE format('DROP POLICY IF EXISTS %I_delete_client ON public.%I', t, t);
    EXECUTE format('CREATE POLICY %I_delete_client ON public.%I FOR DELETE TO anon, authenticated USING (true)', t, t);
  END LOOP;
END
$$;
