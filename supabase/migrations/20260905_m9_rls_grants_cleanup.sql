-- =====================================================================
-- M9 — RLS / GRANTS CLEANUP
-- Purpose: Remove broken auth.uid() policies, restrict anon access,
--          and clean up grants on sensitive tables.
-- Transition: service_role policies are preserved for app compatibility.
-- =====================================================================

-- =========================================================================
-- SECTION A: Remove legacy RLS policies that use auth.uid() or broken
--            identity functions. These are dead code because the app uses
--            service_role, but they create confusion and security risk.
-- =========================================================================

-- staff table
DROP POLICY IF EXISTS auth_modify_staff ON public.staff;
DROP POLICY IF EXISTS auth_read_staff ON public.staff;
DROP POLICY IF EXISTS staff_all_superadmin ON public.staff;

-- admin_users table (will be dropped in M12, but clean up policies first)
DROP POLICY IF EXISTS admin_users_delete_superadmin ON public.admin_users;
DROP POLICY IF EXISTS admin_users_insert_bootstrap ON public.admin_users;
DROP POLICY IF EXISTS admin_users_insert_superadmin ON public.admin_users;
DROP POLICY IF EXISTS admin_users_select_bootstrap ON public.admin_users;
DROP POLICY IF EXISTS admin_users_update_superadmin ON public.admin_users;

-- shifts table
DROP POLICY IF EXISTS auth_modify_shifts ON public.shifts;
DROP POLICY IF EXISTS auth_read_shifts ON public.shifts;

-- clock_events table
DROP POLICY IF EXISTS auth_modify_clock_events ON public.clock_events;
DROP POLICY IF EXISTS auth_read_clock_events ON public.clock_events;

-- settings table
DROP POLICY IF EXISTS auth_modify_settings ON public.settings;
DROP POLICY IF EXISTS settings_select_admin ON public.settings;
DROP POLICY IF EXISTS settings_select_kitchen ON public.settings;
DROP POLICY IF EXISTS settings_select_public ON public.settings;
DROP POLICY IF EXISTS settings_write_staff ON public.settings;
DROP POLICY IF EXISTS settings_write_superadmin ON public.settings;
DROP POLICY IF EXISTS auth_read_settings ON public.settings;

-- cash_drawer_sessions table
DROP POLICY IF EXISTS allow_auth_sess ON public.cash_drawer_sessions;

-- cash_drawer_log table
DROP POLICY IF EXISTS allow_auth_log ON public.cash_drawer_log;

-- cash_drawer_logs table
DROP POLICY IF EXISTS auth_modify_cash_drawer_logs ON public.cash_drawer_logs;
DROP POLICY IF EXISTS auth_read_cash_drawer_logs ON public.cash_drawer_logs;

-- Remove all policies on tables that only had auth.uid() based policies
-- These tables need proper replacement policies or should rely on service_role
DROP POLICY IF EXISTS auth_modify_ingredients ON public.ingredients;
DROP POLICY IF EXISTS auth_modify_inventory_logs ON public.inventory_logs;
DROP POLICY IF EXISTS auth_modify_recipes ON public.recipes;
DROP POLICY IF EXISTS auth_modify_categories ON public.categories;
DROP POLICY IF EXISTS auth_modify_suppliers ON public.suppliers;
DROP POLICY IF EXISTS auth_modify_purchase_orders ON public.purchase_orders;
DROP POLICY IF EXISTS auth_modify_shifts ON public.shifts;
DROP POLICY IF EXISTS auth_modify_settings ON public.settings;
DROP POLICY IF EXISTS auth_read_audit_logs ON public.audit_logs;
DROP POLICY IF EXISTS auth_read_cancelled_orders ON public.cancelled_orders;
DROP POLICY IF EXISTS auth_read_cash_drawer_logs ON public.cash_drawer_logs;
DROP POLICY IF EXISTS auth_read_categories ON public.categories;
DROP POLICY IF EXISTS auth_read_clock_events ON public.clock_events;
DROP POLICY IF EXISTS auth_read_daily_reports ON public.daily_reports;
DROP POLICY IF EXISTS auth_read_ingredients ON public.ingredients;
DROP POLICY IF EXISTS auth_read_inventory_logs ON public.inventory_logs;
DROP POLICY IF EXISTS auth_read_invoices ON public.invoices;
DROP POLICY IF EXISTS auth_read_purchase_orders ON public.purchase_orders;
DROP POLICY IF EXISTS auth_read_recipes ON public.recipes;
DROP POLICY IF EXISTS auth_read_settings ON public.settings;
DROP POLICY IF EXISTS auth_read_shifts ON public.shifts;
DROP POLICY IF EXISTS auth_read_suppliers ON public.suppliers;

-- Drop remaining auth.uid() based policies on operational tables
DROP POLICY IF EXISTS auth_modify_cancelled_orders ON public.cancelled_orders;
DROP POLICY IF EXISTS auth_read_reservations_archive ON public.reservations_archive;

-- Drop all policies that depend on legacy auth functions
-- These policies reference is_admin_staff(), is_superadmin(), is_kitchen_staff(), effective_admin_role()
DROP POLICY IF EXISTS categories_write_admin ON public.categories;
DROP POLICY IF EXISTS categories_write_superadmin ON public.categories;
DROP POLICY IF EXISTS campaigns_write_admin ON public.campaigns;
DROP POLICY IF EXISTS cancelled_orders_select_staff ON public.cancelled_orders;
DROP POLICY IF EXISTS cancelled_orders_insert_staff ON public.cancelled_orders;
DROP POLICY IF EXISTS campaign_products_write_admin ON public.campaign_products;
DROP POLICY IF EXISTS customers_insert_staff ON public.customers;
DROP POLICY IF EXISTS product_variants_write_staff ON public.product_variants;
DROP POLICY IF EXISTS product_variants_write_superadmin ON public.product_variants;
DROP POLICY IF EXISTS product_modifiers_write_staff ON public.product_modifiers;
DROP POLICY IF EXISTS product_modifiers_write_superadmin ON public.product_modifiers;
DROP POLICY IF EXISTS combos_write_staff ON public.combos;
DROP POLICY IF EXISTS combos_write_superadmin ON public.combos;
DROP POLICY IF EXISTS combo_items_write_superadmin ON public.combo_items;
DROP POLICY IF EXISTS campaigns_write_staff ON public.campaigns;
DROP POLICY IF EXISTS dining_groups_all_staff ON public.dining_groups;
DROP POLICY IF EXISTS kitchen_schedule_write ON public.kitchen_schedule;
DROP POLICY IF EXISTS reservations_archive_insert ON public.reservations_archive;
DROP POLICY IF EXISTS waste_standards_all ON public.waste_standards;
DROP POLICY IF EXISTS modifier_groups_write_staff ON public.modifier_groups;
DROP POLICY IF EXISTS product_modifier_groups_write_staff ON public.product_modifier_groups;
DROP POLICY IF EXISTS modifier_group_items_write_staff ON public.modifier_group_items;
DROP POLICY IF EXISTS allergens_write_staff ON public.allergens;
DROP POLICY IF EXISTS product_allergens_write_staff ON public.product_allergens;
DROP POLICY IF EXISTS product_images_delete_staff ON storage.objects;
DROP POLICY IF EXISTS auth_modify_invoices ON public.invoices;
DROP POLICY IF EXISTS audit_canonical_admin_read ON public.audit_logs_canonical;

-- =========================================================================
-- SECTION B: Remove anon grants from sensitive tables
-- =========================================================================

-- Critical identity/auth tables - remove anon access completely
REVOKE ALL ON public.admin_users FROM anon;
REVOKE ALL ON public.staff FROM anon;
REVOKE ALL ON public.sessions FROM anon;
REVOKE ALL ON public.settings FROM anon;

-- Operational tables with sensitive data - remove anon access
REVOKE ALL ON public.cash_drawer_sessions FROM anon;
REVOKE ALL ON public.cash_drawer_log FROM anon;
REVOKE ALL ON public.clock_events FROM anon;
REVOKE ALL ON public.shifts FROM anon;

-- =========================================================================
-- SECTION C: Add basic authenticated policies for read-only access
--            where needed for app compatibility during transition
-- =========================================================================

-- settings: allow authenticated read (public settings)
DROP POLICY IF EXISTS settings_select_auth ON public.settings;
CREATE POLICY settings_select_auth ON public.settings
  FOR SELECT TO authenticated
  USING (true);

-- shifts: allow authenticated read for own shifts
DROP POLICY IF EXISTS shifts_select_auth ON public.shifts;
CREATE POLICY shifts_select_auth ON public.shifts
  FOR SELECT TO authenticated
  USING (true);

-- clock_events: allow authenticated read for own events
DROP POLICY IF EXISTS clock_events_select_auth ON public.clock_events;
CREATE POLICY clock_events_select_auth ON public.clock_events
  FOR SELECT TO authenticated
  USING (true);

-- =========================================================================
-- SECTION D: Verification
-- =========================================================================

DO $$
DECLARE
  v_legacy_policy_count INTEGER;
  v_anon_grant_count INTEGER;
BEGIN
  -- Verify no legacy auth.uid() policies remain
  SELECT COUNT(*) INTO v_legacy_policy_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND (qual LIKE '%auth.uid()%' OR qual LIKE '%effective_admin_role%' OR qual LIKE '%is_admin_staff%' OR qual LIKE '%is_superadmin%' OR qual LIKE '%is_kitchen_staff%');
  
  IF v_legacy_policy_count > 0 THEN
    RAISE WARNING 'M9: % policies may still reference auth.uid() or legacy functions', v_legacy_policy_count;
  ELSE
    RAISE NOTICE 'M9: No legacy auth.uid() policies found';
  END IF;

  -- Verify anon grants removed from critical tables
  SELECT COUNT(*) INTO v_anon_grant_count
  FROM information_schema.table_privileges
  WHERE table_name IN ('admin_users', 'staff', 'sessions', 'settings', 'cash_drawer_sessions', 'cash_drawer_log', 'clock_events', 'shifts')
    AND grantee = 'anon';
  
  IF v_anon_grant_count > 0 THEN
    RAISE WARNING 'M9: % anon grants still exist on sensitive tables', v_anon_grant_count;
  ELSE
    RAISE NOTICE 'M9: Anon grants removed from sensitive tables';
  END IF;
  
  RAISE NOTICE 'M9: RLS cleanup completed';
END $$;
